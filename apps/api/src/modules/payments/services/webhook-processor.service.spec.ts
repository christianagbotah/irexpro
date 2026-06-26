import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WebhookProcessorService } from './webhook-processor.service';
import { PaymentProviderRegistry } from '../registry/payment-provider.registry';
import { PaymentWebhookEvent } from '../entities/payment-webhook-event.entity';
import { PaymentTransaction, PaymentTransactionStatus } from '../entities/payment-transaction.entity';
import { Invoice } from '../entities/invoice.entity';
import { AuditService } from '../../audit/audit.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { ManualPaymentProvider } from '../providers/manual.provider';
import { PaymentEventType } from '../interfaces/payment-provider.interface';

const mockWebhookEventRepo = {
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  findOne: jest.fn(),
};
const mockTransactionRepo = { findOne: jest.fn(), update: jest.fn() };
const mockInvoiceRepo = { update: jest.fn() };
const mockAuditService = { log: jest.fn() };
const mockSubscriptionsService = { activateSubscriptionFromPayment: jest.fn() };

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
    it('should return idempotent=true for duplicate webhook (no double-processing)', async () => {
      registry.register(buildMockProvider('mock_dup', { signatureValid: true }));
      const webhookRecord = { id: 'wh-id' };
      mockWebhookEventRepo.create.mockReturnValue(webhookRecord);
      // Simulate unique(provider, providerEventId) constraint violation
      const { QueryFailedError } = await import('typeorm');
      const qfe = Object.create(QueryFailedError.prototype) as Error & { code?: string };
      qfe.message = 'duplicate key';
      qfe.code = '23505';
      mockWebhookEventRepo.save.mockRejectedValue(qfe);

      const result = await service.processWebhook('mock_dup', Buffer.from('{}'), {});
      expect(result.idempotent).toBe(true);
      // Duplicate must NOT activate a subscription
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
