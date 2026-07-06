import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WebhookProcessorService } from './webhook-processor.service';
import { PaymentProviderRegistry } from '../registry/payment-provider.registry';
import { PaymentWebhookEvent } from '../entities/payment-webhook-event.entity';
import { PaymentTransaction, PaymentTransactionStatus, PaymentPurpose } from '../entities/payment-transaction.entity';
import { Invoice } from '../entities/invoice.entity';
import { PerformanceFeeAssessment, AssessmentStatus } from '../../performance-fees/entities/performance-fee-assessment.entity';
import { PerformanceFeeLedgerEntry } from '../../performance-fees/entities/performance-fee-ledger-entry.entity';
import { TradingAccountPerformance } from '../../performance-fees/entities/trading-account-performance.entity';
import { AuditService } from '../../audit/audit.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { ManualPaymentProvider } from '../providers/manual.provider';
import { PaymentEventType } from '../interfaces/payment-provider.interface';
import { BillingInterval } from '../../subscriptions/entities/subscription-plan.entity';

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

/**
 * Builds a fake "live-like" provider whose signature verification can be toggled.
 * Used in place of ManualPaymentProvider, which is now rejected at the webhook endpoint.
 */
function buildMockProvider(
  providerId: string,
  opts: { signatureValid: boolean; event?: Record<string, unknown> },
): any {
  return {
    providerId,
    displayName: providerId,
    supportedCountries: ['US'],
    supportedCurrencies: ['USD'],
    isLive: false,
    supportedPaymentMethods: ['card'],
    verifyWebhookSignature: jest.fn().mockReturnValue(opts.signatureValid),
    parseWebhookEvent: jest.fn().mockReturnValue(
      opts.event ?? {
        eventType: PaymentEventType.PAYMENT_SUCCEEDED,
        providerEventId: `${providerId}_evt`,
      },
    ),
    createCustomer: jest.fn(),
    createCheckoutSession: jest.fn(),
    getTransactionStatus: jest.fn(),
    cancelSubscription: jest.fn(),
    refundPayment: jest.fn(),
    createSubscription: jest.fn(),
    createPaymentIntent: jest.fn(),
    validateWebhookSignature: jest.fn(),
  };
}

describe('WebhookProcessorService', () => {
  let service: WebhookProcessorService;
  let registry: PaymentProviderRegistry;
  let module: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();

    registry = new PaymentProviderRegistry();
    const manual = new ManualPaymentProvider();
    registry.register(manual);

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

  describe('processWebhook — signature verification', () => {
    it('should reject invalid signature (non-manual provider with no signature)', async () => {
      // Register a provider that rejects all signatures
      const mockProvider = {
        providerId: 'stripe',
        displayName: 'Stripe',
        supportedCountries: ['US'],
        supportedCurrencies: ['USD'],
        isLive: false,
        supportedPaymentMethods: ['card'],
        verifyWebhookSignature: jest.fn().mockReturnValue(false),
        parseWebhookEvent: jest.fn(),
        createCustomer: jest.fn(),
        createCheckoutSession: jest.fn(),
        getTransactionStatus: jest.fn(),
        cancelSubscription: jest.fn(),
        refundPayment: jest.fn(),
        createSubscription: jest.fn(),
        createPaymentIntent: jest.fn(),
        validateWebhookSignature: jest.fn(),
      };
      registry.register(mockProvider as any);

      await expect(
        service.processWebhook('stripe', Buffer.from('{}'), { 'stripe-signature': 'bad' }),
      ).rejects.toThrow(BadRequestException);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYMENT_WEBHOOK_SIGNATURE_FAILED' }),
      );
    });

    it('should accept valid signature from a live-like provider', async () => {
      registry.register(buildMockProvider('mock_ok', { signatureValid: true }));
      const webhookRecord = {
        id: 'wh-id',
        provider: 'mock_ok',
        providerEventId: 'mock_ok_evt',
        processed: false,
      };
      mockWebhookEventRepo.create.mockReturnValue(webhookRecord);
      mockWebhookEventRepo.save.mockResolvedValue(webhookRecord);
      mockTransactionRepo.findOne.mockResolvedValue(null);

      const result = await service.processWebhook('mock_ok', Buffer.from('{}'), {});
      expect(result.accepted).toBe(true);
    });

    it('should reject the dev/test manual provider at the webhook endpoint', async () => {
      // manual.verifyWebhookSignature() always returns true, so it must be
      // blocked before reaching signature verification.
      await expect(
        service.processWebhook('manual', Buffer.from('{}'), {}),
      ).rejects.toThrow(BadRequestException);
      expect(mockWebhookEventRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('processWebhook — idempotency', () => {
    async function makeQFE(): Promise<Error & { code?: string }> {
      const { QueryFailedError } = await import('typeorm');
      const qfe = Object.create(QueryFailedError.prototype) as Error & { code?: string };
      qfe.message = 'duplicate key';
      qfe.code = '23505';
      return qfe;
    }

    it('should return idempotent=true for duplicate webhook with processed=true (no double-processing)', async () => {
      registry.register(buildMockProvider('mock_dup', { signatureValid: true }));
      mockWebhookEventRepo.create.mockReturnValue({ id: 'wh-id' });
      mockWebhookEventRepo.save.mockRejectedValue(await makeQFE());
      // Existing record is already successfully processed
      mockWebhookEventRepo.findOne.mockResolvedValue({ id: 'wh-id', processed: true });

      const result = await service.processWebhook('mock_dup', Buffer.from('{}'), {});
      expect(result.idempotent).toBe(true);
      expect(mockSubscriptionsService.activateSubscriptionFromPayment).not.toHaveBeenCalled();
    });

    it('should retry processing when duplicate has processed=false (transient failure recovery)', async () => {
      registry.register(buildMockProvider('mock_retry', { signatureValid: true }));
      mockWebhookEventRepo.create.mockReturnValue({ id: 'wh-retry' });
      mockWebhookEventRepo.save.mockRejectedValue(await makeQFE());
      // Existing record has processed=false — safe to retry
      const existingRecord = { id: 'wh-retry', processed: false };
      mockWebhookEventRepo.findOne.mockResolvedValue(existingRecord);
      // Transaction not found — simplified success path
      mockTransactionRepo.findOne.mockResolvedValue(null);

      const result = await service.processWebhook('mock_retry', Buffer.from('{}'), {});
      expect(result.idempotent).toBe(false);
      expect(result.accepted).toBe(true);
      // Should mark processed=true after successful retry
      expect(mockWebhookEventRepo.update).toHaveBeenCalledWith('wh-retry', expect.objectContaining({ processed: true }));
    });

    it('processed=false retry does not double-activate subscription', async () => {
      // Setup two identical webhooks: first fails, second retries
      registry.register(buildMockProvider('mock_nodup', { signatureValid: true }));
      mockWebhookEventRepo.create.mockReturnValue({ id: 'wh-nodup' });
      mockWebhookEventRepo.save.mockRejectedValue(await makeQFE());
      mockWebhookEventRepo.findOne.mockResolvedValue({ id: 'wh-nodup', processed: false });
      mockTransactionRepo.findOne.mockResolvedValue(null); // No matching tx → safe, no activation

      await service.processWebhook('mock_nodup', Buffer.from('{}'), {});
      expect(mockSubscriptionsService.activateSubscriptionFromPayment).not.toHaveBeenCalled();
    });
  });

  describe('processWebhook — payment succeeded', () => {
    it('should activate subscription on verified payment success', async () => {
      // Register a mock provider that returns a known providerTransactionReference
      const mockProviderWithRef = {
        providerId: 'mock_pay',
        displayName: 'MockPay',
        supportedCountries: ['US'],
        supportedCurrencies: ['USD'],
        isLive: false,
        supportedPaymentMethods: ['card'],
        verifyWebhookSignature: jest.fn().mockReturnValue(true),
        parseWebhookEvent: jest.fn().mockReturnValue({
          eventType: PaymentEventType.PAYMENT_SUCCEEDED,
          providerEventId: 'mock_evt_success',
          providerTransactionReference: 'mock_session_test',
          amountMinor: 5000,
          currency: 'USD',
        }),
        createCustomer: jest.fn(),
        createCheckoutSession: jest.fn(),
        getTransactionStatus: jest.fn(),
        cancelSubscription: jest.fn(),
        refundPayment: jest.fn(),
        createSubscription: jest.fn(),
        createPaymentIntent: jest.fn(),
        validateWebhookSignature: jest.fn(),
      };
      registry.register(mockProviderWithRef as any);

      const webhookRecord = {
        id: 'wh-id',
        provider: 'mock_pay',
        providerEventId: 'mock_evt_success',
        processed: false,
      };
      mockWebhookEventRepo.create.mockReturnValue(webhookRecord);
      mockWebhookEventRepo.save.mockResolvedValue(webhookRecord);

      const transaction = {
        id: 'tx-id',
        userId: 'user-id',
        invoiceId: 'inv-id',
        provider: 'mock_pay',
        providerTransactionReference: 'mock_session_test',
        providerPayloadSummary: { planId: 'plan-id' },
        status: PaymentTransactionStatus.PENDING,
        amountMinor: '5000',
        currency: 'USD',
      };
      mockTransactionRepo.findOne.mockResolvedValue(transaction);
      mockSubscriptionsService.activateSubscriptionFromPayment.mockResolvedValue({ id: 'sub-id' });

      const result = await service.processWebhook(
        'mock_pay',
        Buffer.from(JSON.stringify({ ref: 'mock_session_test' })),
        {},
      );

      expect(result.accepted).toBe(true);
      expect(mockSubscriptionsService.activateSubscriptionFromPayment).toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYMENT_SUCCEEDED' }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SUBSCRIPTION_ACTIVATED' }),
      );
    });

    it('should not activate subscription when transaction not found', async () => {
      registry.register(buildMockProvider('mock_notx', { signatureValid: true }));
      const webhookRecord = {
        id: 'wh-id',
        provider: 'mock_notx',
        providerEventId: 'mock_notx_evt',
        processed: false,
      };
      mockWebhookEventRepo.create.mockReturnValue(webhookRecord);
      mockWebhookEventRepo.save.mockResolvedValue(webhookRecord);
      mockTransactionRepo.findOne.mockResolvedValue(null);

      const result = await service.processWebhook('mock_notx', Buffer.from('{}'), {});
      expect(result.accepted).toBe(true);
      expect(mockSubscriptionsService.activateSubscriptionFromPayment).not.toHaveBeenCalled();
    });

    it('failed payment webhook does not activate subscription', async () => {
      registry.register(
        buildMockProvider('mock_fail', {
          signatureValid: true,
          event: {
            eventType: PaymentEventType.PAYMENT_FAILED,
            providerEventId: 'mock_fail_evt',
            providerTransactionReference: 'mock_fail_ref',
          },
        }),
      );
      const webhookRecord = { id: 'wh-id', provider: 'mock_fail', providerEventId: 'mock_fail_evt', processed: false };
      mockWebhookEventRepo.create.mockReturnValue(webhookRecord);
      mockWebhookEventRepo.save.mockResolvedValue(webhookRecord);
      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-id',
        userId: 'user-id',
        provider: 'mock_fail',
        providerTransactionReference: 'mock_fail_ref',
      });

      await service.processWebhook('mock_fail', Buffer.from('{}'), {});
      expect(mockSubscriptionsService.activateSubscriptionFromPayment).not.toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYMENT_FAILED' }),
      );
    });
  });

  describe('billing period interval — Part A fix', () => {
    function buildProviderWithRef(providerId: string, txRef: string) {
      return buildMockProvider(providerId, {
        signatureValid: true,
        event: {
          eventType: PaymentEventType.PAYMENT_SUCCEEDED,
          providerEventId: `${providerId}_evt`,
          providerTransactionReference: txRef,
          amountMinor: 5000,
          currency: 'USD',
        },
      });
    }

    function setupWebhookSuccess(providerId: string) {
      const record = { id: 'wh-id', provider: providerId, providerEventId: `${providerId}_evt`, processed: false };
      mockWebhookEventRepo.create.mockReturnValue(record);
      mockWebhookEventRepo.save.mockResolvedValue(record);
      mockSubscriptionsService.activateSubscriptionFromPayment.mockResolvedValue({ id: 'sub-id' });
    }

    it('monthly plan sets period end to +1 month', async () => {
      registry.register(buildProviderWithRef('mock_mo', 'ref_mo'));
      setupWebhookSuccess('mock_mo');
      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-mo', userId: 'u1', invoiceId: 'inv-mo', provider: 'mock_mo',
        providerTransactionReference: 'ref_mo', paymentPurpose: PaymentPurpose.SUBSCRIPTION_INITIAL,
        providerPayloadSummary: { planId: 'plan-mo' },
        amountMinor: '5000', currency: 'USD',
      });
      mockSubscriptionsService.getPlanById.mockResolvedValue({ billingInterval: BillingInterval.MONTHLY });

      const before = new Date();
      await service.processWebhook('mock_mo', Buffer.from('{}'), {});
      const call = mockSubscriptionsService.activateSubscriptionFromPayment.mock.calls[0];
      const periodEnd: Date = call[5];

      const expectedMonth = new Date(before);
      expectedMonth.setMonth(expectedMonth.getMonth() + 1);
      expect(Math.abs(periodEnd.getTime() - expectedMonth.getTime())).toBeLessThan(5000);
    });

    it('quarterly plan sets period end to +3 months', async () => {
      registry.register(buildProviderWithRef('mock_q', 'ref_q'));
      setupWebhookSuccess('mock_q');
      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-q', userId: 'u1', invoiceId: 'inv-q', provider: 'mock_q',
        providerTransactionReference: 'ref_q', paymentPurpose: PaymentPurpose.SUBSCRIPTION_INITIAL,
        providerPayloadSummary: { planId: 'plan-q' },
        amountMinor: '5000', currency: 'USD',
      });
      mockSubscriptionsService.getPlanById.mockResolvedValue({ billingInterval: BillingInterval.QUARTERLY });

      const before = new Date();
      await service.processWebhook('mock_q', Buffer.from('{}'), {});
      const call = mockSubscriptionsService.activateSubscriptionFromPayment.mock.calls[0];
      const periodEnd: Date = call[5];

      const expectedEnd = new Date(before);
      expectedEnd.setMonth(expectedEnd.getMonth() + 3);
      expect(Math.abs(periodEnd.getTime() - expectedEnd.getTime())).toBeLessThan(5000);
    });

    it('annual plan sets period end to +1 year', async () => {
      registry.register(buildProviderWithRef('mock_an', 'ref_an'));
      setupWebhookSuccess('mock_an');
      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-an', userId: 'u1', invoiceId: 'inv-an', provider: 'mock_an',
        providerTransactionReference: 'ref_an', paymentPurpose: PaymentPurpose.SUBSCRIPTION_INITIAL,
        providerPayloadSummary: { planId: 'plan-an' },
        amountMinor: '5000', currency: 'USD',
      });
      mockSubscriptionsService.getPlanById.mockResolvedValue({ billingInterval: BillingInterval.ANNUAL });

      const before = new Date();
      await service.processWebhook('mock_an', Buffer.from('{}'), {});
      const call = mockSubscriptionsService.activateSubscriptionFromPayment.mock.calls[0];
      const periodEnd: Date = call[5];

      const expectedEnd = new Date(before);
      expectedEnd.setFullYear(expectedEnd.getFullYear() + 1);
      expect(Math.abs(periodEnd.getTime() - expectedEnd.getTime())).toBeLessThan(5000);
    });

    it('unknown interval (plan not found) falls back safely to monthly', async () => {
      registry.register(buildProviderWithRef('mock_unk', 'ref_unk'));
      setupWebhookSuccess('mock_unk');
      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-unk', userId: 'u1', invoiceId: 'inv-unk', provider: 'mock_unk',
        providerTransactionReference: 'ref_unk', paymentPurpose: PaymentPurpose.SUBSCRIPTION_INITIAL,
        providerPayloadSummary: { planId: 'nonexistent-plan' },
        amountMinor: '5000', currency: 'USD',
      });
      mockSubscriptionsService.getPlanById.mockResolvedValue(null); // plan not found

      const before = new Date();
      await service.processWebhook('mock_unk', Buffer.from('{}'), {});
      const call = mockSubscriptionsService.activateSubscriptionFromPayment.mock.calls[0];
      const periodEnd: Date = call[5];

      const expectedEnd = new Date(before);
      expectedEnd.setMonth(expectedEnd.getMonth() + 1);
      expect(Math.abs(periodEnd.getTime() - expectedEnd.getTime())).toBeLessThan(5000);
    });
  });

  describe('processWebhook — PERFORMANCE_FEE payments', () => {
    function buildPerfFeeProvider(providerId: string, txRef: string) {
      return buildMockProvider(providerId, {
        signatureValid: true,
        event: {
          eventType: PaymentEventType.PAYMENT_SUCCEEDED,
          providerEventId: `${providerId}_evt`,
          providerTransactionReference: txRef,
          amountMinor: 200000,
          currency: 'USD',
        },
      });
    }

    it('paid performance fee webhook marks assessment PAID and adds FEE_PAID ledger entry', async () => {
      registry.register(buildPerfFeeProvider('mock_pf', 'ref_pf'));
      const record = { id: 'wh-pf', provider: 'mock_pf', providerEventId: 'mock_pf_evt', processed: false };
      mockWebhookEventRepo.create.mockReturnValue(record);
      mockWebhookEventRepo.save.mockResolvedValue(record);

      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-pf', userId: 'user-pf', invoiceId: 'inv-pf', provider: 'mock_pf',
        providerTransactionReference: 'ref_pf',
        paymentPurpose: PaymentPurpose.PERFORMANCE_FEE,
        amountMinor: '200000', currency: 'USD',
        providerPayloadSummary: {},
      });
      mockAssessmentRepo.findOne.mockResolvedValue({
        id: 'assess-pf', userId: 'user-pf', invoiceId: 'inv-pf',
        status: AssessmentStatus.INVOICED, brokerConnectionId: null,
        feeAmount: '200000', endingRealisedBalance: '5000000', currency: 'USD',
      });
      mockPerformanceRepo.findOne.mockResolvedValue({
        id: 'perf-pf', totalFeesCharged: '0', currentHighWaterMark: '4000000',
      });

      await service.processWebhook('mock_pf', Buffer.from('{}'), {});

      expect(mockAssessmentRepo.update).toHaveBeenCalledWith('assess-pf', { status: AssessmentStatus.PAID });
      expect(mockLedgerRepo.save).toHaveBeenCalledWith(expect.objectContaining({ assessmentId: 'assess-pf' }));
      expect(mockPerformanceRepo.update).toHaveBeenCalledWith('perf-pf', expect.objectContaining({
        currentHighWaterMark: '5000000',
        totalFeesCharged: '200000',
      }));
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PERFORMANCE_FEE_PAID' }),
      );
      expect(mockSubscriptionsService.activateSubscriptionFromPayment).not.toHaveBeenCalled();
    });

    it('already-paid performance fee webhook is idempotent', async () => {
      registry.register(buildPerfFeeProvider('mock_pf2', 'ref_pf2'));
      const record = { id: 'wh-pf2', provider: 'mock_pf2', providerEventId: 'mock_pf2_evt', processed: false };
      mockWebhookEventRepo.create.mockReturnValue(record);
      mockWebhookEventRepo.save.mockResolvedValue(record);

      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-pf2', userId: 'user-pf2', invoiceId: 'inv-pf2', provider: 'mock_pf2',
        providerTransactionReference: 'ref_pf2',
        paymentPurpose: PaymentPurpose.PERFORMANCE_FEE,
        amountMinor: '200000', currency: 'USD',
        providerPayloadSummary: {},
      });
      // Assessment already PAID
      mockAssessmentRepo.findOne.mockResolvedValue({
        id: 'assess-pf2', status: AssessmentStatus.PAID,
      });

      await service.processWebhook('mock_pf2', Buffer.from('{}'), {});

      expect(mockAssessmentRepo.update).not.toHaveBeenCalled();
      expect(mockLedgerRepo.save).not.toHaveBeenCalled();
    });

    it('failed payment webhook does not mark performance fee assessment paid', async () => {
      const failProvider = buildMockProvider('mock_pf_fail', {
        signatureValid: true,
        event: {
          eventType: PaymentEventType.PAYMENT_FAILED,
          providerEventId: 'mock_pf_fail_evt',
          providerTransactionReference: 'ref_pf_fail',
        },
      });
      registry.register(failProvider);
      const record = { id: 'wh-pf-fail', processed: false };
      mockWebhookEventRepo.create.mockReturnValue(record);
      mockWebhookEventRepo.save.mockResolvedValue(record);
      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-pf-fail', userId: 'user-pf', invoiceId: null, provider: 'mock_pf_fail',
        providerTransactionReference: 'ref_pf_fail',
      });

      await service.processWebhook('mock_pf_fail', Buffer.from('{}'), {});

      expect(mockAssessmentRepo.update).not.toHaveBeenCalled();
      expect(mockSubscriptionsService.activateSubscriptionFromPayment).not.toHaveBeenCalled();
    });
  });

  describe('processWebhook — amount/currency verification (Sprint 15 audit)', () => {
    it('underpayment does not mark transaction succeeded or activate subscription', async () => {
      registry.register(
        buildMockProvider('mock_under', {
          signatureValid: true,
          event: {
            eventType: PaymentEventType.PAYMENT_SUCCEEDED,
            providerEventId: 'mock_under_evt',
            providerTransactionReference: 'ref_under',
            amountMinor: 4000, // expected 5000
            currency: 'USD',
          },
        }),
      );
      const record = { id: 'wh-under', processed: false };
      mockWebhookEventRepo.create.mockReturnValue(record);
      mockWebhookEventRepo.save.mockResolvedValue(record);
      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-under', userId: 'u1', invoiceId: 'inv-under', provider: 'mock_under',
        providerTransactionReference: 'ref_under', paymentPurpose: PaymentPurpose.SUBSCRIPTION_INITIAL,
        amountMinor: '5000', currency: 'USD',
      });

      await service.processWebhook('mock_under', Buffer.from('{}'), {});

      expect(mockTransactionRepo.update).not.toHaveBeenCalled();
      expect(mockInvoiceRepo.update).not.toHaveBeenCalled();
      expect(mockSubscriptionsService.activateSubscriptionFromPayment).not.toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYMENT_FAILED',
          metadata: expect.objectContaining({ reason: 'AMOUNT_OR_CURRENCY_MISMATCH' }),
        }),
      );
    });

    it('overpayment does not mark transaction succeeded', async () => {
      registry.register(
        buildMockProvider('mock_over', {
          signatureValid: true,
          event: {
            eventType: PaymentEventType.PAYMENT_SUCCEEDED,
            providerEventId: 'mock_over_evt',
            providerTransactionReference: 'ref_over',
            amountMinor: 6000, // expected 5000
            currency: 'USD',
          },
        }),
      );
      const record = { id: 'wh-over', processed: false };
      mockWebhookEventRepo.create.mockReturnValue(record);
      mockWebhookEventRepo.save.mockResolvedValue(record);
      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-over', userId: 'u1', invoiceId: 'inv-over', provider: 'mock_over',
        providerTransactionReference: 'ref_over', paymentPurpose: PaymentPurpose.SUBSCRIPTION_INITIAL,
        amountMinor: '5000', currency: 'USD',
      });

      await service.processWebhook('mock_over', Buffer.from('{}'), {});

      expect(mockTransactionRepo.update).not.toHaveBeenCalled();
      expect(mockSubscriptionsService.activateSubscriptionFromPayment).not.toHaveBeenCalled();
    });

    it('currency mismatch does not mark transaction succeeded', async () => {
      registry.register(
        buildMockProvider('mock_curr', {
          signatureValid: true,
          event: {
            eventType: PaymentEventType.PAYMENT_SUCCEEDED,
            providerEventId: 'mock_curr_evt',
            providerTransactionReference: 'ref_curr',
            amountMinor: 5000,
            currency: 'GHS', // expected USD
          },
        }),
      );
      const record = { id: 'wh-curr', processed: false };
      mockWebhookEventRepo.create.mockReturnValue(record);
      mockWebhookEventRepo.save.mockResolvedValue(record);
      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-curr', userId: 'u1', invoiceId: 'inv-curr', provider: 'mock_curr',
        providerTransactionReference: 'ref_curr', paymentPurpose: PaymentPurpose.SUBSCRIPTION_INITIAL,
        amountMinor: '5000', currency: 'USD',
      });

      await service.processWebhook('mock_curr', Buffer.from('{}'), {});

      expect(mockTransactionRepo.update).not.toHaveBeenCalled();
      expect(mockSubscriptionsService.activateSubscriptionFromPayment).not.toHaveBeenCalled();
    });

    it('missing amount/currency in webhook event fails closed (does not mark paid)', async () => {
      registry.register(
        buildMockProvider('mock_missing', {
          signatureValid: true,
          event: {
            eventType: PaymentEventType.PAYMENT_SUCCEEDED,
            providerEventId: 'mock_missing_evt',
            providerTransactionReference: 'ref_missing',
            // amountMinor/currency intentionally omitted
          },
        }),
      );
      const record = { id: 'wh-missing', processed: false };
      mockWebhookEventRepo.create.mockReturnValue(record);
      mockWebhookEventRepo.save.mockResolvedValue(record);
      mockTransactionRepo.findOne.mockResolvedValue({
        id: 'tx-missing', userId: 'u1', invoiceId: 'inv-missing', provider: 'mock_missing',
        providerTransactionReference: 'ref_missing', paymentPurpose: PaymentPurpose.SUBSCRIPTION_INITIAL,
        amountMinor: '5000', currency: 'USD',
      });

      await service.processWebhook('mock_missing', Buffer.from('{}'), {});

      expect(mockTransactionRepo.update).not.toHaveBeenCalled();
      expect(mockSubscriptionsService.activateSubscriptionFromPayment).not.toHaveBeenCalled();
    });
  });

  describe('security — no secrets in audit metadata', () => {
    it('should not include raw body in audit logs', async () => {
      registry.register(buildMockProvider('mock_sec', { signatureValid: true }));
      const rawBody = Buffer.from(JSON.stringify({ secret: 'sk_live_supersecret' }));
      const webhookRecord = { id: 'wh-id', provider: 'mock_sec', providerEventId: 'evt-secret', processed: false };
      mockWebhookEventRepo.create.mockReturnValue(webhookRecord);
      mockWebhookEventRepo.save.mockResolvedValue(webhookRecord);
      mockTransactionRepo.findOne.mockResolvedValue(null);

      await service.processWebhook('mock_sec', rawBody, {});

      const auditCalls = mockAuditService.log.mock.calls;
      for (const [call] of auditCalls) {
        const metaStr = JSON.stringify(call.metadata ?? {});
        expect(metaStr).not.toContain('sk_live_supersecret');
        expect(metaStr).not.toContain('supersecret');
      }
    });
  });
});
