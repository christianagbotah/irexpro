import * as crypto from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WebhookProcessorService } from './webhook-processor.service';
import { PaymentProviderRegistry } from '../registry/payment-provider.registry';
import { StripePaymentProvider } from '../providers/stripe.provider';
import { StripeHttpClient } from '../providers/stripe-http.client';
import { PaymentWebhookEvent } from '../entities/payment-webhook-event.entity';
import { PaymentTransaction, PaymentPurpose } from '../entities/payment-transaction.entity';
import { Invoice } from '../entities/invoice.entity';
import { PerformanceFeeAssessment, AssessmentStatus } from '../../performance-fees/entities/performance-fee-assessment.entity';
import { PerformanceFeeLedgerEntry } from '../../performance-fees/entities/performance-fee-ledger-entry.entity';
import { TradingAccountPerformance } from '../../performance-fees/entities/trading-account-performance.entity';
import { AuditService } from '../../audit/audit.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';

const WEBHOOK_SECRET = 'whsec_stripe_secret_for_webhook_tests';

function stripeConfigService(): any {
  const values: Record<string, unknown> = {
    'stripe.enabled': true,
    'stripe.secretKey': 'sk_test_stripe_secret_for_webhook_tests',
    'stripe.webhookSecret': WEBHOOK_SECRET,
    'stripe.baseUrl': 'https://api.stripe.com',
  };
  return { get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback) };
}

function sign(rawBody: Buffer, timestamp = Math.floor(Date.now() / 1000)): string {
  const signature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

function checkoutSessionCompletedPayload(
  eventId: string,
  sessionId: string,
  amountTotal = 2900,
  currency = 'usd',
) {
  return Buffer.from(
    JSON.stringify({
      id: eventId,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          payment_status: 'paid',
          amount_total: amountTotal,
          currency,
          customer: 'cus_1',
        },
      },
    }),
  );
}

const mockWebhookEventRepo = {
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  findOne: jest.fn(),
};
const mockTransactionRepo = { findOne: jest.fn(), update: jest.fn() };
const mockInvoiceRepo = { update: jest.fn() };
const mockAssessmentRepo = { findOne: jest.fn(), update: jest.fn() };
const mockLedgerRepo = { save: jest.fn() };
const mockPerformanceRepo = { findOne: jest.fn(), update: jest.fn() };
const mockAuditService = { log: jest.fn() };
const mockSubscriptionsService = {
  activateSubscriptionFromPayment: jest.fn(),
  getPlanById: jest.fn(),
};

describe('WebhookProcessorService — Stripe integration (Sprint 17)', () => {
  let service: WebhookProcessorService;
  let module: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();

    const registry = new PaymentProviderRegistry();
    registry.register(new StripePaymentProvider(stripeConfigService(), new StripeHttpClient()));

    module = await Test.createTestingModule({
      providers: [
        WebhookProcessorService,
        { provide: PaymentProviderRegistry, useValue: registry },
        { provide: getRepositoryToken(PaymentWebhookEvent), useValue: mockWebhookEventRepo },
        { provide: getRepositoryToken(PaymentTransaction), useValue: mockTransactionRepo },
        { provide: getRepositoryToken(Invoice), useValue: mockInvoiceRepo },
        { provide: getRepositoryToken(PerformanceFeeAssessment), useValue: mockAssessmentRepo },
        { provide: getRepositoryToken(PerformanceFeeLedgerEntry), useValue: mockLedgerRepo },
        { provide: getRepositoryToken(TradingAccountPerformance), useValue: mockPerformanceRepo },
        { provide: AuditService, useValue: mockAuditService },
        { provide: SubscriptionsService, useValue: mockSubscriptionsService },
      ],
    }).compile();

    service = module.get<WebhookProcessorService>(WebhookProcessorService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('subscription checkout', () => {
    it('valid Stripe webhook success activates subscription', async () => {
      const rawBody = checkoutSessionCompletedPayload('evt_sub_1', 'cs_sub_ref');
      const signature = sign(rawBody);

      mockWebhookEventRepo.create.mockImplementation((x: unknown) => x);
      mockWebhookEventRepo.save.mockImplementation(async (x: any) => x);
      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-sub-1',
        userId: 'user-1',
        invoiceId: 'inv-sub-1',
        provider: 'stripe',
        providerTransactionReference: 'cs_sub_ref',
        paymentPurpose: PaymentPurpose.SUBSCRIPTION_INITIAL,
        amountMinor: '2900',
        currency: 'USD',
        providerPayloadSummary: { planId: 'plan-1' },
      });
      mockSubscriptionsService.activateSubscriptionFromPayment.mockResolvedValue({ id: 'sub-1' });

      const result = await service.processWebhook('stripe', rawBody, { 'stripe-signature': signature });

      expect(result.accepted).toBe(true);
      expect(mockSubscriptionsService.activateSubscriptionFromPayment).toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SUBSCRIPTION_ACTIVATED' }),
      );
    });

    it('invalid signature does not activate subscription', async () => {
      const rawBody = checkoutSessionCompletedPayload('evt_sub_bad', 'cs_sub_ref_bad');

      await expect(
        service.processWebhook('stripe', rawBody, { 'stripe-signature': 't=1,v1=not-a-real-signature' }),
      ).rejects.toThrow(BadRequestException);

      expect(mockSubscriptionsService.activateSubscriptionFromPayment).not.toHaveBeenCalled();
      expect(mockWebhookEventRepo.save).not.toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYMENT_WEBHOOK_SIGNATURE_FAILED' }),
      );
    });

    it('duplicate webhook does not double-activate subscription', async () => {
      const rawBody = checkoutSessionCompletedPayload('evt_sub_dup', 'cs_sub_dup');
      const signature = sign(rawBody);

      mockWebhookEventRepo.create.mockImplementation((x: unknown) => x);
      const dupError = Object.assign(new Error('duplicate key'), { code: '23505' });
      const { QueryFailedError } = await import('typeorm');
      Object.setPrototypeOf(dupError, QueryFailedError.prototype);
      mockWebhookEventRepo.save.mockRejectedValue(dupError);
      mockWebhookEventRepo.findOne.mockResolvedValue({ id: 'wh-dup', processed: true });

      const result = await service.processWebhook('stripe', rawBody, { 'stripe-signature': signature });

      expect(result.idempotent).toBe(true);
      expect(mockSubscriptionsService.activateSubscriptionFromPayment).not.toHaveBeenCalled();
    });
  });

  describe('performance-fee checkout', () => {
    it('valid Stripe webhook marks performance fee paid once', async () => {
      const rawBody = checkoutSessionCompletedPayload('evt_pf_1', 'cs_pf_ref', 200000, 'usd');
      const signature = sign(rawBody);

      mockWebhookEventRepo.create.mockImplementation((x: unknown) => x);
      mockWebhookEventRepo.save.mockImplementation(async (x: any) => x);
      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-pf-1',
        userId: 'user-pf',
        invoiceId: 'inv-pf-1',
        provider: 'stripe',
        providerTransactionReference: 'cs_pf_ref',
        paymentPurpose: PaymentPurpose.PERFORMANCE_FEE,
        amountMinor: '200000',
        currency: 'USD',
        providerPayloadSummary: {},
      });
      mockAssessmentRepo.findOne.mockResolvedValue({
        id: 'assess-pf-1',
        userId: 'user-pf',
        invoiceId: 'inv-pf-1',
        status: AssessmentStatus.INVOICED,
        brokerConnectionId: null,
        endingRealisedBalance: '5000000',
      });
      mockPerformanceRepo.findOne.mockResolvedValue({
        id: 'perf-pf-1',
        totalFeesCharged: '0',
        currentHighWaterMark: '4000000',
      });

      const result = await service.processWebhook('stripe', rawBody, { 'stripe-signature': signature });

      expect(result.accepted).toBe(true);
      expect(mockAssessmentRepo.update).toHaveBeenCalledWith('assess-pf-1', { status: AssessmentStatus.PAID });
      expect(mockLedgerRepo.save).toHaveBeenCalledWith(expect.objectContaining({ assessmentId: 'assess-pf-1' }));
      expect(mockPerformanceRepo.update).toHaveBeenCalledWith(
        'perf-pf-1',
        expect.objectContaining({ currentHighWaterMark: '5000000', totalFeesCharged: '200000' }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PERFORMANCE_FEE_PAID' }),
      );
    });

    it('duplicate webhook does not double-create FEE_PAID', async () => {
      const rawBody = checkoutSessionCompletedPayload('evt_pf_dup', 'cs_pf_dup', 200000, 'usd');
      const signature = sign(rawBody);

      mockWebhookEventRepo.create.mockImplementation((x: unknown) => x);
      const dupError = Object.assign(new Error('duplicate key'), { code: '23505' });
      const { QueryFailedError } = await import('typeorm');
      Object.setPrototypeOf(dupError, QueryFailedError.prototype);
      mockWebhookEventRepo.save.mockRejectedValue(dupError);
      mockWebhookEventRepo.findOne.mockResolvedValue({ id: 'wh-pf-dup', processed: true });

      const result = await service.processWebhook('stripe', rawBody, { 'stripe-signature': signature });

      expect(result.idempotent).toBe(true);
      expect(mockAssessmentRepo.update).not.toHaveBeenCalled();
      expect(mockLedgerRepo.save).not.toHaveBeenCalled();
    });

    it('invalid signature does not mark performance fee paid', async () => {
      const rawBody = checkoutSessionCompletedPayload('evt_pf_bad', 'cs_pf_bad', 200000, 'usd');

      await expect(
        service.processWebhook('stripe', rawBody, { 'stripe-signature': 't=1,v1=invalid' }),
      ).rejects.toThrow(BadRequestException);

      expect(mockAssessmentRepo.update).not.toHaveBeenCalled();
      expect(mockLedgerRepo.save).not.toHaveBeenCalled();
      expect(mockPerformanceRepo.update).not.toHaveBeenCalled();
    });

    it('checkout.session.expired event does not mark performance fee paid', async () => {
      const rawBody = Buffer.from(
        JSON.stringify({
          id: 'evt_pf_expired',
          type: 'checkout.session.expired',
          data: { object: { id: 'cs_pf_expired' } },
        }),
      );
      const signature = sign(rawBody);

      mockWebhookEventRepo.create.mockImplementation((x: unknown) => x);
      mockWebhookEventRepo.save.mockImplementation(async (x: any) => x);
      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-pf-expired',
        userId: 'user-pf',
        provider: 'stripe',
        providerTransactionReference: 'cs_pf_expired',
        paymentPurpose: PaymentPurpose.PERFORMANCE_FEE,
      });

      await service.processWebhook('stripe', rawBody, { 'stripe-signature': signature });

      expect(mockAssessmentRepo.update).not.toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PAYMENT_FAILED' }));
    });
  });

  describe('amount/currency verification', () => {
    it('underpayment does not activate subscription', async () => {
      // Expected 2900 USD, but the webhook reports only 2000 (underpayment).
      const rawBody = checkoutSessionCompletedPayload('evt_sub_under', 'cs_sub_under', 2000, 'usd');
      const signature = sign(rawBody);

      mockWebhookEventRepo.create.mockImplementation((x: unknown) => x);
      mockWebhookEventRepo.save.mockImplementation(async (x: any) => x);
      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-sub-under',
        userId: 'user-1',
        invoiceId: 'inv-sub-under',
        provider: 'stripe',
        providerTransactionReference: 'cs_sub_under',
        paymentPurpose: PaymentPurpose.SUBSCRIPTION_INITIAL,
        amountMinor: '2900',
        currency: 'USD',
        providerPayloadSummary: { planId: 'plan-1' },
      });

      const result = await service.processWebhook('stripe', rawBody, { 'stripe-signature': signature });

      expect(result.accepted).toBe(true);
      expect(mockSubscriptionsService.activateSubscriptionFromPayment).not.toHaveBeenCalled();
      expect(mockTransactionRepo.update).not.toHaveBeenCalled();
      expect(mockInvoiceRepo.update).not.toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYMENT_FAILED',
          metadata: expect.objectContaining({ reason: 'AMOUNT_OR_CURRENCY_MISMATCH' }),
        }),
      );
    });

    it('overpayment does not mark performance fee paid', async () => {
      // Expected 200000 USD, but the webhook reports 250000 (overpayment).
      const rawBody = checkoutSessionCompletedPayload('evt_pf_over', 'cs_pf_over', 250000, 'usd');
      const signature = sign(rawBody);

      mockWebhookEventRepo.create.mockImplementation((x: unknown) => x);
      mockWebhookEventRepo.save.mockImplementation(async (x: any) => x);
      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-pf-over',
        userId: 'user-pf',
        invoiceId: 'inv-pf-over',
        provider: 'stripe',
        providerTransactionReference: 'cs_pf_over',
        paymentPurpose: PaymentPurpose.PERFORMANCE_FEE,
        amountMinor: '200000',
        currency: 'USD',
        providerPayloadSummary: {},
      });

      const result = await service.processWebhook('stripe', rawBody, { 'stripe-signature': signature });

      expect(result.accepted).toBe(true);
      expect(mockAssessmentRepo.update).not.toHaveBeenCalled();
      expect(mockLedgerRepo.save).not.toHaveBeenCalled();
      expect(mockPerformanceRepo.update).not.toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYMENT_FAILED',
          metadata: expect.objectContaining({ reason: 'AMOUNT_OR_CURRENCY_MISMATCH' }),
        }),
      );
    });

    it('currency mismatch does not mark paid even when amount matches (Stripe lowercase currency vs stored uppercase)', async () => {
      // Expected 200000 USD, webhook reports the same numeric amount in GHS (lowercase 'ghs' from Stripe).
      const rawBody = checkoutSessionCompletedPayload('evt_pf_curr', 'cs_pf_curr', 200000, 'ghs');
      const signature = sign(rawBody);

      mockWebhookEventRepo.create.mockImplementation((x: unknown) => x);
      mockWebhookEventRepo.save.mockImplementation(async (x: any) => x);
      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-pf-curr',
        userId: 'user-pf',
        invoiceId: 'inv-pf-curr',
        provider: 'stripe',
        providerTransactionReference: 'cs_pf_curr',
        paymentPurpose: PaymentPurpose.PERFORMANCE_FEE,
        amountMinor: '200000',
        currency: 'USD',
        providerPayloadSummary: {},
      });

      const result = await service.processWebhook('stripe', rawBody, { 'stripe-signature': signature });

      expect(result.accepted).toBe(true);
      expect(mockAssessmentRepo.update).not.toHaveBeenCalled();
      expect(mockLedgerRepo.save).not.toHaveBeenCalled();
    });

    it('a success event for a different reference cannot pay this transaction', async () => {
      const rawBody = checkoutSessionCompletedPayload('evt_other', 'cs_other_ref', 200000, 'usd');
      const signature = sign(rawBody);

      mockWebhookEventRepo.create.mockImplementation((x: unknown) => x);
      mockWebhookEventRepo.save.mockImplementation(async (x: any) => x);
      mockTransactionRepo.findOne.mockResolvedValue(null);

      const result = await service.processWebhook('stripe', rawBody, { 'stripe-signature': signature });

      expect(result.accepted).toBe(true);
      expect(mockAssessmentRepo.update).not.toHaveBeenCalled();
      expect(mockSubscriptionsService.activateSubscriptionFromPayment).not.toHaveBeenCalled();
    });

    it('a missing amount/currency in the webhook fails closed', async () => {
      const rawBody = Buffer.from(
        JSON.stringify({
          id: 'evt_missing',
          type: 'checkout.session.completed',
          data: { object: { id: 'cs_missing', payment_status: 'paid' } },
        }),
      );
      const signature = sign(rawBody);

      mockWebhookEventRepo.create.mockImplementation((x: unknown) => x);
      mockWebhookEventRepo.save.mockImplementation(async (x: any) => x);
      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-missing',
        userId: 'user-1',
        provider: 'stripe',
        providerTransactionReference: 'cs_missing',
        paymentPurpose: PaymentPurpose.SUBSCRIPTION_INITIAL,
        amountMinor: '2900',
        currency: 'USD',
        providerPayloadSummary: {},
      });

      const result = await service.processWebhook('stripe', rawBody, { 'stripe-signature': signature });

      expect(result.accepted).toBe(true);
      expect(mockSubscriptionsService.activateSubscriptionFromPayment).not.toHaveBeenCalled();
    });
  });

  describe('manual provider remains blocked', () => {
    it('rejects the manual provider at the Stripe-integrated webhook endpoint', async () => {
      await expect(service.processWebhook('manual', Buffer.from('{}'), {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
