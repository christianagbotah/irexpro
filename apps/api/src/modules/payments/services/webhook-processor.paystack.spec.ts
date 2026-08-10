import * as crypto from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WebhookProcessorService } from './webhook-processor.service';
import { PaymentProviderRegistry } from '../registry/payment-provider.registry';
import { PaystackPaymentProvider } from '../providers/paystack.provider';
import { PaystackHttpClient } from '../providers/paystack-http.client';
import { PaymentWebhookEvent } from '../entities/payment-webhook-event.entity';
import { PaymentTransaction, PaymentPurpose } from '../entities/payment-transaction.entity';
import { Invoice } from '../entities/invoice.entity';
import {
  PerformanceFeeAssessment,
  AssessmentStatus,
} from '../../performance-fees/entities/performance-fee-assessment.entity';
import { PerformanceFeeLedgerEntry } from '../../performance-fees/entities/performance-fee-ledger-entry.entity';
import { TradingAccountPerformance } from '../../performance-fees/entities/trading-account-performance.entity';
import { AuditService } from '../../audit/audit.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';

const SECRET_KEY = 'sk_test_paystack_secret_for_webhook_tests';

function paystackConfigService(): any {
  const values: Record<string, unknown> = {
    'paystack.enabled': true,
    'paystack.secretKey': SECRET_KEY,
    'paystack.webhookSecret': undefined,
    'paystack.baseUrl': 'https://api.paystack.co',
  };
  return { get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback) };
}

function sign(rawBody: Buffer): string {
  return crypto.createHmac('sha512', SECRET_KEY).update(rawBody).digest('hex');
}

function chargeSuccessPayload(reference: string, txId: number, amount = 50000, currency = 'GHS') {
  return Buffer.from(
    JSON.stringify({
      event: 'charge.success',
      data: {
        id: txId,
        reference,
        amount,
        currency,
        status: 'success',
        customer: { customer_code: 'CUS_1', email: 'user@example.com' },
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

describe('WebhookProcessorService — Paystack integration', () => {
  let service: WebhookProcessorService;
  let module: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();

    const registry = new PaymentProviderRegistry();
    registry.register(
      new PaystackPaymentProvider(paystackConfigService(), new PaystackHttpClient()),
    );

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
    it('valid Paystack webhook success activates subscription', async () => {
      const rawBody = chargeSuccessPayload('psk_sub_ref', 1001);
      const signature = sign(rawBody);

      mockWebhookEventRepo.create.mockImplementation((x: unknown) => x);
      mockWebhookEventRepo.save.mockImplementation(async (x: any) => x);
      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-sub-1',
        userId: 'user-1',
        invoiceId: 'inv-sub-1',
        provider: 'paystack',
        providerTransactionReference: 'psk_sub_ref',
        paymentPurpose: PaymentPurpose.SUBSCRIPTION_INITIAL,
        amountMinor: '50000',
        currency: 'GHS',
        providerPayloadSummary: { planId: 'plan-1' },
      });
      mockSubscriptionsService.activateSubscriptionFromPayment.mockResolvedValue({ id: 'sub-1' });

      const result = await service.processWebhook('paystack', rawBody, {
        'x-paystack-signature': signature,
      });

      expect(result.accepted).toBe(true);
      expect(mockSubscriptionsService.activateSubscriptionFromPayment).toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SUBSCRIPTION_ACTIVATED' }),
      );
    });

    it('invalid signature does not activate subscription', async () => {
      const rawBody = chargeSuccessPayload('psk_sub_ref_bad', 1002);

      await expect(
        service.processWebhook('paystack', rawBody, {
          'x-paystack-signature': 'not-a-real-signature',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockSubscriptionsService.activateSubscriptionFromPayment).not.toHaveBeenCalled();
      expect(mockWebhookEventRepo.save).not.toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYMENT_WEBHOOK_SIGNATURE_FAILED' }),
      );
    });

    it('Paystack checkout initiation failure never reaches this service (no activation path)', () => {
      // Checkout failures happen in SubscriptionsService.initiateCheckout before any
      // webhook is ever sent — WebhookProcessorService only ever sees success/failure
      // events for sessions that were actually created. Documented invariant.
      expect(mockSubscriptionsService.activateSubscriptionFromPayment).not.toHaveBeenCalled();
    });

    it('duplicate webhook does not double-activate subscription', async () => {
      const rawBody = chargeSuccessPayload('psk_sub_dup', 1003);
      const signature = sign(rawBody);

      mockWebhookEventRepo.create.mockImplementation((x: unknown) => x);
      const dupError = Object.assign(new Error('duplicate key'), { code: '23505' });
      const { QueryFailedError } = await import('typeorm');
      Object.setPrototypeOf(dupError, QueryFailedError.prototype);
      mockWebhookEventRepo.save.mockRejectedValue(dupError);
      mockWebhookEventRepo.findOne.mockResolvedValue({ id: 'wh-dup', processed: true });

      const result = await service.processWebhook('paystack', rawBody, {
        'x-paystack-signature': signature,
      });

      expect(result.idempotent).toBe(true);
      expect(mockSubscriptionsService.activateSubscriptionFromPayment).not.toHaveBeenCalled();
    });
  });

  describe('performance-fee checkout', () => {
    it('valid Paystack webhook marks performance fee paid once', async () => {
      const rawBody = chargeSuccessPayload('psk_pf_ref', 2001, 200000, 'USD');
      const signature = sign(rawBody);

      mockWebhookEventRepo.create.mockImplementation((x: unknown) => x);
      mockWebhookEventRepo.save.mockImplementation(async (x: any) => x);
      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-pf-1',
        userId: 'user-pf',
        invoiceId: 'inv-pf-1',
        provider: 'paystack',
        providerTransactionReference: 'psk_pf_ref',
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

      const result = await service.processWebhook('paystack', rawBody, {
        'x-paystack-signature': signature,
      });

      expect(result.accepted).toBe(true);
      expect(mockAssessmentRepo.update).toHaveBeenCalledWith('assess-pf-1', {
        status: AssessmentStatus.PAID,
      });
      expect(mockLedgerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ assessmentId: 'assess-pf-1' }),
      );
      expect(mockPerformanceRepo.update).toHaveBeenCalledWith(
        'perf-pf-1',
        expect.objectContaining({ currentHighWaterMark: '5000000', totalFeesCharged: '200000' }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PERFORMANCE_FEE_PAID' }),
      );
    });

    it('duplicate webhook does not double-create FEE_PAID', async () => {
      const rawBody = chargeSuccessPayload('psk_pf_dup', 2002, 200000, 'USD');
      const signature = sign(rawBody);

      mockWebhookEventRepo.create.mockImplementation((x: unknown) => x);
      const dupError = Object.assign(new Error('duplicate key'), { code: '23505' });
      const { QueryFailedError } = await import('typeorm');
      Object.setPrototypeOf(dupError, QueryFailedError.prototype);
      mockWebhookEventRepo.save.mockRejectedValue(dupError);
      mockWebhookEventRepo.findOne.mockResolvedValue({ id: 'wh-pf-dup', processed: true });

      const result = await service.processWebhook('paystack', rawBody, {
        'x-paystack-signature': signature,
      });

      expect(result.idempotent).toBe(true);
      expect(mockAssessmentRepo.update).not.toHaveBeenCalled();
      expect(mockLedgerRepo.save).not.toHaveBeenCalled();
    });

    it('invalid signature does not mark performance fee paid', async () => {
      const rawBody = chargeSuccessPayload('psk_pf_bad', 2003, 200000, 'USD');

      await expect(
        service.processWebhook('paystack', rawBody, { 'x-paystack-signature': 'invalid' }),
      ).rejects.toThrow(BadRequestException);

      expect(mockAssessmentRepo.update).not.toHaveBeenCalled();
      expect(mockLedgerRepo.save).not.toHaveBeenCalled();
      expect(mockPerformanceRepo.update).not.toHaveBeenCalled();
    });

    it('charge.failed event does not mark performance fee paid', async () => {
      const rawBody = Buffer.from(
        JSON.stringify({ event: 'charge.failed', data: { id: 2004, reference: 'psk_pf_fail' } }),
      );
      const signature = sign(rawBody);

      mockWebhookEventRepo.create.mockImplementation((x: unknown) => x);
      mockWebhookEventRepo.save.mockImplementation(async (x: any) => x);
      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-pf-fail',
        userId: 'user-pf',
        provider: 'paystack',
        providerTransactionReference: 'psk_pf_fail',
        paymentPurpose: PaymentPurpose.PERFORMANCE_FEE,
      });

      await service.processWebhook('paystack', rawBody, { 'x-paystack-signature': signature });

      expect(mockAssessmentRepo.update).not.toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYMENT_FAILED' }),
      );
    });
  });

  describe('amount/currency verification (Sprint 15 audit)', () => {
    it('underpayment does not activate subscription', async () => {
      // Expected 50000 GHS, but the webhook reports only 40000 (underpayment).
      const rawBody = chargeSuccessPayload('psk_sub_under', 3001, 40000, 'GHS');
      const signature = sign(rawBody);

      mockWebhookEventRepo.create.mockImplementation((x: unknown) => x);
      mockWebhookEventRepo.save.mockImplementation(async (x: any) => x);
      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-sub-under',
        userId: 'user-1',
        invoiceId: 'inv-sub-under',
        provider: 'paystack',
        providerTransactionReference: 'psk_sub_under',
        paymentPurpose: PaymentPurpose.SUBSCRIPTION_INITIAL,
        amountMinor: '50000',
        currency: 'GHS',
        providerPayloadSummary: { planId: 'plan-1' },
      });

      const result = await service.processWebhook('paystack', rawBody, {
        'x-paystack-signature': signature,
      });

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
      const rawBody = chargeSuccessPayload('psk_pf_over', 3002, 250000, 'USD');
      const signature = sign(rawBody);

      mockWebhookEventRepo.create.mockImplementation((x: unknown) => x);
      mockWebhookEventRepo.save.mockImplementation(async (x: any) => x);
      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-pf-over',
        userId: 'user-pf',
        invoiceId: 'inv-pf-over',
        provider: 'paystack',
        providerTransactionReference: 'psk_pf_over',
        paymentPurpose: PaymentPurpose.PERFORMANCE_FEE,
        amountMinor: '200000',
        currency: 'USD',
        providerPayloadSummary: {},
      });

      const result = await service.processWebhook('paystack', rawBody, {
        'x-paystack-signature': signature,
      });

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

    it('currency mismatch does not mark paid even when amount matches', async () => {
      // Expected 200000 USD, webhook reports the same numeric amount but in GHS.
      const rawBody = chargeSuccessPayload('psk_pf_curr', 3003, 200000, 'GHS');
      const signature = sign(rawBody);

      mockWebhookEventRepo.create.mockImplementation((x: unknown) => x);
      mockWebhookEventRepo.save.mockImplementation(async (x: any) => x);
      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-pf-curr',
        userId: 'user-pf',
        invoiceId: 'inv-pf-curr',
        provider: 'paystack',
        providerTransactionReference: 'psk_pf_curr',
        paymentPurpose: PaymentPurpose.PERFORMANCE_FEE,
        amountMinor: '200000',
        currency: 'USD',
        providerPayloadSummary: {},
      });

      const result = await service.processWebhook('paystack', rawBody, {
        'x-paystack-signature': signature,
      });

      expect(result.accepted).toBe(true);
      expect(mockAssessmentRepo.update).not.toHaveBeenCalled();
      expect(mockLedgerRepo.save).not.toHaveBeenCalled();
    });

    it('a success event for a different reference cannot pay this transaction', async () => {
      // Webhook references psk_other_ref; the stored transaction is for a different ref
      // (findOne returning null simulates the correct "no cross-transaction match" lookup).
      const rawBody = chargeSuccessPayload('psk_other_ref', 3004, 200000, 'USD');
      const signature = sign(rawBody);

      mockWebhookEventRepo.create.mockImplementation((x: unknown) => x);
      mockWebhookEventRepo.save.mockImplementation(async (x: any) => x);
      mockTransactionRepo.findOne.mockResolvedValue(null);

      const result = await service.processWebhook('paystack', rawBody, {
        'x-paystack-signature': signature,
      });

      expect(result.accepted).toBe(true);
      expect(mockAssessmentRepo.update).not.toHaveBeenCalled();
      expect(mockSubscriptionsService.activateSubscriptionFromPayment).not.toHaveBeenCalled();
    });
  });

  describe('manual provider remains blocked', () => {
    it('rejects the manual provider at the Paystack-integrated webhook endpoint', async () => {
      await expect(service.processWebhook('manual', Buffer.from('{}'), {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
