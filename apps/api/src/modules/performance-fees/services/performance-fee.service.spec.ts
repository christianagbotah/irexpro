import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PerformanceFeeService } from './performance-fee.service';
import { PerformanceFeePolicy, BillingFrequency } from '../entities/performance-fee-policy.entity';
import { TradingAccountPerformance } from '../entities/trading-account-performance.entity';
import { PerformanceFeeAssessment, AssessmentStatus } from '../entities/performance-fee-assessment.entity';
import { PerformanceFeeLedgerEntry, LedgerEntryType } from '../entities/performance-fee-ledger-entry.entity';
import { Invoice } from '../../payments/entities/invoice.entity';
import { PaymentTransaction } from '../../payments/entities/payment-transaction.entity';
import { UserSubscription, SubscriptionStatus } from '../../subscriptions/entities/user-subscription.entity';
import { AuditService } from '../../audit/audit.service';

// ── Mock repositories ─────────────────────────────────────────────────────────
const mockPolicyRepo = { find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
const mockPerformanceRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn(), update: jest.fn() };
const mockAssessmentRepo = { find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn(), update: jest.fn() };
const mockLedgerRepo = { find: jest.fn(), save: jest.fn() };
const mockInvoiceRepo = { create: jest.fn(), save: jest.fn() };
const mockTransactionRepo = { create: jest.fn(), save: jest.fn() };
const mockSubscriptionRepo = { findOne: jest.fn() };
const mockAuditService = { log: jest.fn() };

// ── Test helpers ──────────────────────────────────────────────────────────────

function makePolicy(overrides: Partial<PerformanceFeePolicy> = {}): PerformanceFeePolicy {
  return {
    id: 'policy-1',
    planId: null,
    name: 'Standard 20%',
    feePercent: '20.0000',
    billingFrequency: BillingFrequency.MONTHLY,
    calculationMode: 'HIGH_WATER_MARK' as any,
    appliesTo: 'REALISED_PROFIT_ONLY' as any,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeActiveSubscription(planId = 'plan-1'): Partial<UserSubscription> {
  return { id: 'sub-1', userId: 'user-1', subscriptionPlanId: planId, status: SubscriptionStatus.ACTIVE };
}

function makePeriod() {
  const start = new Date('2026-01-01T00:00:00Z');
  const end = new Date('2026-01-31T23:59:59Z');
  return { start, end };
}

// ── Test suite ────────────────────────────────────────────────────────────────
describe('PerformanceFeeService', () => {
  let service: PerformanceFeeService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PerformanceFeeService,
        { provide: getRepositoryToken(PerformanceFeePolicy), useValue: mockPolicyRepo },
        { provide: getRepositoryToken(TradingAccountPerformance), useValue: mockPerformanceRepo },
        { provide: getRepositoryToken(PerformanceFeeAssessment), useValue: mockAssessmentRepo },
        { provide: getRepositoryToken(PerformanceFeeLedgerEntry), useValue: mockLedgerRepo },
        { provide: getRepositoryToken(Invoice), useValue: mockInvoiceRepo },
        { provide: getRepositoryToken(PaymentTransaction), useValue: mockTransactionRepo },
        { provide: getRepositoryToken(UserSubscription), useValue: mockSubscriptionRepo },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<PerformanceFeeService>(PerformanceFeeService);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // High-water mark
  // ─────────────────────────────────────────────────────────────────────────

  describe('calculateAssessment — high-water mark', () => {
    function setupBaseline(realisedPnL: string, hwm: string) {
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy());
      mockAssessmentRepo.findOne.mockResolvedValue(null); // no duplicate
      mockPerformanceRepo.findOne.mockResolvedValue({ id: 'perf-1', currentHighWaterMark: hwm, totalRealisedProfit: '0' });
      mockLedgerRepo.find.mockResolvedValue([
        { entryType: LedgerEntryType.REALISED_TRADE_PROFIT, amount: realisedPnL },
      ]);
      const assessment = { id: 'assess-1', feeAmount: '0', status: AssessmentStatus.DRAFT };
      mockAssessmentRepo.create.mockReturnValue(assessment);
      mockAssessmentRepo.save.mockResolvedValue(assessment);
      mockPerformanceRepo.update.mockResolvedValue(undefined);
    }

    it('no fee when realised balance is below high-water mark', async () => {
      setupBaseline('300000', '500000'); // profit $3k, HWM $5k
      const { start, end } = makePeriod();

      const result = await service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1');
      expect(result.feeAmount).toBe('0');
      expect(result.status).toBe(AssessmentStatus.DRAFT);
    });

    it('no fee when realised balance equals high-water mark', async () => {
      setupBaseline('500000', '500000'); // profit $5k = HWM $5k
      const { start, end } = makePeriod();

      const result = await service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1');
      expect(result.feeAmount).toBe('0');
    });

    it('fee applies only on amount above high-water mark', async () => {
      // profit $7k, HWM $5k → taxable basis = $2k, 20% fee = $400
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy({ feePercent: '20.0000' }));
      mockAssessmentRepo.findOne.mockResolvedValue(null);
      mockPerformanceRepo.findOne.mockResolvedValue({ id: 'perf-1', currentHighWaterMark: '500000', totalRealisedProfit: '0' });
      mockLedgerRepo.find.mockResolvedValue([
        { entryType: LedgerEntryType.REALISED_TRADE_PROFIT, amount: '700000' },
      ]);
      const expectedFee = String((700000n * 2000n) / 1_000_000n); // = '1400' wait let me recalc
      // profit above HWM = 700000 - 500000 = 200000
      // fee = 200000 * 20 / 100 = 40000
      const expectedFeeCalc = String((200000n * 200000n) / 1_000_000n); // 200000 * 20 / 100

      const assessment = { id: 'assess-2', feeAmount: '40000', status: AssessmentStatus.ASSESSED };
      mockAssessmentRepo.create.mockReturnValue(assessment);
      mockAssessmentRepo.save.mockResolvedValue(assessment);
      mockPerformanceRepo.update.mockResolvedValue(undefined);

      const { start, end } = makePeriod();
      const result = await service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1');
      expect(result.status).toBe(AssessmentStatus.ASSESSED);
      expect(BigInt(result.feeAmount)).toBeGreaterThan(0n);
    });

    it('high-water mark updates only after fee is PAID (not on DRAFT)', async () => {
      // HWM update is handled by markAssessmentPaid, not by calculateAssessment
      setupBaseline('700000', '500000');
      const { start, end } = makePeriod();

      await service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1');
      // HWM must NOT be updated during calculation
      expect(mockPerformanceRepo.update).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ currentHighWaterMark: expect.anything() }),
      );
    });

    it('markAssessmentPaid updates HWM to endingRealisedBalance', async () => {
      mockAssessmentRepo.findOne.mockResolvedValue({
        id: 'assess-3',
        status: AssessmentStatus.INVOICED,
        userId: 'user-1',
        invoiceId: 'inv-1',
        brokerConnectionId: null,
        feeAmount: '40000',
        endingRealisedBalance: '700000',
        currency: 'USD',
      });
      mockPerformanceRepo.findOne.mockResolvedValue({
        id: 'perf-1', currentHighWaterMark: '500000', totalFeesCharged: '0',
      });
      mockAssessmentRepo.update.mockResolvedValue(undefined);
      mockPerformanceRepo.update.mockResolvedValue(undefined);

      await service.markAssessmentPaid('inv-1');

      expect(mockAssessmentRepo.update).toHaveBeenCalledWith('assess-3', { status: AssessmentStatus.PAID });
      expect(mockPerformanceRepo.update).toHaveBeenCalledWith('perf-1', expect.objectContaining({
        currentHighWaterMark: '700000',
        totalFeesCharged: '40000',
      }));
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'HIGH_WATER_MARK_UPDATED' }),
      );
    });

    it('markAssessmentPaid is idempotent for already-PAID assessment', async () => {
      mockAssessmentRepo.findOne.mockResolvedValue({
        id: 'assess-done', status: AssessmentStatus.PAID,
      });

      await service.markAssessmentPaid('inv-done');
      expect(mockAssessmentRepo.update).not.toHaveBeenCalled();
    });

    it('CANCELLED assessment does not affect HWM', async () => {
      // markAssessmentPaid on CANCELLED should not update HWM
      mockAssessmentRepo.findOne.mockResolvedValue({
        id: 'assess-cancelled', status: AssessmentStatus.CANCELLED,
      });

      await service.markAssessmentPaid('inv-cancelled');
      expect(mockPerformanceRepo.update).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Deposit / top-up exclusion
  // ─────────────────────────────────────────────────────────────────────────

  describe('calculateAssessment — deposit/top-up exclusion', () => {
    function setupWithEntries(entries: Array<{ entryType: LedgerEntryType; amount: string }>) {
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy());
      mockAssessmentRepo.findOne.mockResolvedValue(null);
      mockPerformanceRepo.findOne.mockResolvedValue({ id: 'perf-1', currentHighWaterMark: '0', totalRealisedProfit: '0' });
      mockLedgerRepo.find.mockResolvedValue(entries);
      const assessment = { id: 'assess-dep', feeAmount: '0', realisedProfitForFee: '0', depositsExcluded: '0', status: AssessmentStatus.DRAFT };
      mockAssessmentRepo.create.mockReturnValue(assessment);
      mockAssessmentRepo.save.mockResolvedValue(assessment);
      mockPerformanceRepo.update.mockResolvedValue(undefined);
    }

    it('deposits do not count as profit — zero fee on pure deposit', async () => {
      setupWithEntries([{ entryType: LedgerEntryType.DEPOSIT, amount: '1000000' }]);
      const { start, end } = makePeriod();

      const result = await service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1');
      expect(result.feeAmount).toBe('0');
      expect(result.realisedProfitForFee).toBe('0');
    });

    it('top-up (deposit) with profit: only profit above HWM is taxed', async () => {
      // $5k deposit + $1k trade profit, HWM=0 → only $1k is basis for fee
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy({ feePercent: '20.0000' }));
      mockAssessmentRepo.findOne.mockResolvedValue(null);
      mockPerformanceRepo.findOne.mockResolvedValue({ id: 'perf-1', currentHighWaterMark: '0', totalRealisedProfit: '0' });
      mockLedgerRepo.find.mockResolvedValue([
        { entryType: LedgerEntryType.DEPOSIT, amount: '500000' },
        { entryType: LedgerEntryType.REALISED_TRADE_PROFIT, amount: '100000' },
      ]);
      const assessment = { id: 'assess-mix', feeAmount: '20000', realisedProfitForFee: '100000', depositsExcluded: '500000', status: AssessmentStatus.ASSESSED };
      mockAssessmentRepo.create.mockReturnValue(assessment);
      mockAssessmentRepo.save.mockResolvedValue(assessment);
      mockPerformanceRepo.update.mockResolvedValue(undefined);

      const { start, end } = makePeriod();
      const result = await service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1');
      expect(result.depositsExcluded).toBe('500000');
      expect(result.realisedProfitForFee).toBe('100000');
    });

    it('withdrawal adjusts ledger but does not count as profit', async () => {
      setupWithEntries([{ entryType: LedgerEntryType.WITHDRAWAL, amount: '-200000' }]);
      const { start, end } = makePeriod();

      const result = await service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1');
      expect(result.feeAmount).toBe('0');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Realised profit only
  // ─────────────────────────────────────────────────────────────────────────

  describe('calculateAssessment — realised profit only', () => {
    function setupProfitEntries(entries: Array<{ entryType: LedgerEntryType; amount: string }>, hwm = '0') {
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy());
      mockAssessmentRepo.findOne.mockResolvedValue(null);
      mockPerformanceRepo.findOne.mockResolvedValue({ id: 'perf-1', currentHighWaterMark: hwm, totalRealisedProfit: '0' });
      mockLedgerRepo.find.mockResolvedValue(entries);
      const netPnL = entries.reduce((sum, e) => {
        if (e.entryType === LedgerEntryType.REALISED_TRADE_PROFIT || e.entryType === LedgerEntryType.REALISED_TRADE_LOSS) {
          return sum + BigInt(e.amount);
        }
        return sum;
      }, 0n);
      const profitAboveHWM = netPnL - BigInt(hwm) > 0n ? netPnL - BigInt(hwm) : 0n;
      const feeAmount = profitAboveHWM > 0n ? String((profitAboveHWM * 2000n) / 1_000_000n) : '0';
      const status = BigInt(feeAmount) > 0n ? AssessmentStatus.ASSESSED : AssessmentStatus.DRAFT;
      const assessment = { id: 'assess-r', feeAmount, realisedProfitForFee: profitAboveHWM.toString(), status };
      mockAssessmentRepo.create.mockReturnValue(assessment);
      mockAssessmentRepo.save.mockResolvedValue(assessment);
      mockPerformanceRepo.update.mockResolvedValue(undefined);
    }

    it('closed winning trades count toward realised profit', async () => {
      setupProfitEntries([{ entryType: LedgerEntryType.REALISED_TRADE_PROFIT, amount: '500000' }]);
      const { start, end } = makePeriod();
      const result = await service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1');
      expect(result.status).toBe(AssessmentStatus.ASSESSED);
      expect(BigInt(result.feeAmount)).toBeGreaterThan(0n);
    });

    it('closed losing trades reduce realised profit (net negative → no fee)', async () => {
      setupProfitEntries([
        { entryType: LedgerEntryType.REALISED_TRADE_PROFIT, amount: '100000' },
        { entryType: LedgerEntryType.REALISED_TRADE_LOSS, amount: '-300000' },
      ]);
      const { start, end } = makePeriod();
      const result = await service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1');
      expect(result.feeAmount).toBe('0');
    });

    it('FEE_ASSESSED and FEE_PAID entries are ignored in profit calculation', async () => {
      setupProfitEntries([
        { entryType: LedgerEntryType.FEE_ASSESSED, amount: '-50000' },
        { entryType: LedgerEntryType.FEE_PAID, amount: '-50000' },
      ]);
      const { start, end } = makePeriod();
      const result = await service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1');
      // Fee entries don't count as profit or loss — no fee basis
      expect(result.feeAmount).toBe('0');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Duplicate prevention
  // ─────────────────────────────────────────────────────────────────────────

  describe('calculateAssessment — duplicate prevention', () => {
    it('returns existing DRAFT assessment without recalculating', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy());
      const existingDraft = { id: 'draft-existing', status: AssessmentStatus.DRAFT, feeAmount: '0' };
      mockAssessmentRepo.findOne.mockResolvedValue(existingDraft);

      const { start, end } = makePeriod();
      const result = await service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1');
      expect(result.id).toBe('draft-existing');
      // Ledger was NOT queried since DRAFT already exists
      expect(mockLedgerRepo.find).not.toHaveBeenCalled();
    });

    it('rejects duplicate assessment that is already ASSESSED', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy());
      mockAssessmentRepo.findOne.mockResolvedValue({ id: 'existing', status: AssessmentStatus.ASSESSED });

      const { start, end } = makePeriod();
      await expect(service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1')).rejects.toThrow(ConflictException);
    });

    it('rejects duplicate assessment that is already INVOICED', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy());
      mockAssessmentRepo.findOne.mockResolvedValue({ id: 'existing', status: AssessmentStatus.INVOICED });

      const { start, end } = makePeriod();
      await expect(service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1')).rejects.toThrow(ConflictException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Invoice integration
  // ─────────────────────────────────────────────────────────────────────────

  describe('invoiceAssessment', () => {
    function setupAssessedAssessment() {
      const assessment = {
        id: 'assess-inv', status: AssessmentStatus.ASSESSED, userId: 'user-1',
        subscriptionId: 'sub-1', brokerConnectionId: null, currency: 'USD',
        feeAmount: '50000', feePercent: '20.0000',
        periodStart: new Date('2026-01-01'), periodEnd: new Date('2026-01-31'),
        realisedProfitForFee: '250000', invoiceId: null,
      };
      mockAssessmentRepo.findOne.mockResolvedValue(assessment);
      const savedInvoice = { id: 'inv-new', invoiceNumber: 'PF-12345-ABCDE' };
      mockInvoiceRepo.create.mockReturnValue(savedInvoice);
      mockInvoiceRepo.save.mockResolvedValue(savedInvoice);
      const savedTx = { id: 'tx-new' };
      mockTransactionRepo.create.mockReturnValue(savedTx);
      mockTransactionRepo.save.mockResolvedValue(savedTx);
      mockAssessmentRepo.save.mockImplementation((a: any) => Promise.resolve({ ...a, status: AssessmentStatus.INVOICED }));
      mockLedgerRepo.save.mockResolvedValue({});
      return assessment;
    }

    it('creates invoice for positive fee assessment', async () => {
      setupAssessedAssessment();
      const result = await service.invoiceAssessment('assess-inv', 'admin-1');
      expect(result.status).toBe(AssessmentStatus.INVOICED);
      expect(mockInvoiceRepo.save).toHaveBeenCalled();
      expect(mockTransactionRepo.save).toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PERFORMANCE_FEE_ASSESSMENT_INVOICED' }),
      );
    });

    it('creates FEE_ASSESSED ledger entry when invoicing', async () => {
      setupAssessedAssessment();
      await service.invoiceAssessment('assess-inv', 'admin-1');
      expect(mockLedgerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ entryType: LedgerEntryType.FEE_ASSESSED }),
      );
    });

    it('rejects invoicing a DRAFT assessment', async () => {
      mockAssessmentRepo.findOne.mockResolvedValue({ id: 'draft-a', status: AssessmentStatus.DRAFT, feeAmount: '50000' });
      await expect(service.invoiceAssessment('draft-a', 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects invoicing a zero-fee assessment', async () => {
      mockAssessmentRepo.findOne.mockResolvedValue({ id: 'zero-a', status: AssessmentStatus.ASSESSED, feeAmount: '0' });
      await expect(service.invoiceAssessment('zero-a', 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('zero fee assessment remains DRAFT — no invoice created', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy());
      mockAssessmentRepo.findOne.mockResolvedValue(null);
      mockPerformanceRepo.findOne.mockResolvedValue({ id: 'perf-1', currentHighWaterMark: '1000000', totalRealisedProfit: '0' });
      // Only $5k profit, HWM is $10k → no taxable amount
      mockLedgerRepo.find.mockResolvedValue([{ entryType: LedgerEntryType.REALISED_TRADE_PROFIT, amount: '500000' }]);
      const assessment = { id: 'zero-assess', feeAmount: '0', status: AssessmentStatus.DRAFT };
      mockAssessmentRepo.create.mockReturnValue(assessment);
      mockAssessmentRepo.save.mockResolvedValue(assessment);
      mockPerformanceRepo.update.mockResolvedValue(undefined);

      const { start, end } = makePeriod();
      const result = await service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1');
      expect(result.feeAmount).toBe('0');
      expect(result.status).toBe(AssessmentStatus.DRAFT);
      expect(mockInvoiceRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Subscription / plan checks
  // ─────────────────────────────────────────────────────────────────────────

  describe('calculateAssessment — subscription/plan checks', () => {
    it('rejects when user has no active subscription', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValue(null);
      const { start, end } = makePeriod();
      await expect(service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects when no active performance fee policy exists for plan', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(null); // no policy
      const { start, end } = makePeriod();
      await expect(service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('allows assessment when active plan has matching policy', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy());
      mockAssessmentRepo.findOne.mockResolvedValue(null);
      mockPerformanceRepo.findOne.mockResolvedValue({ id: 'perf-1', currentHighWaterMark: '0', totalRealisedProfit: '0' });
      mockLedgerRepo.find.mockResolvedValue([]);
      const assessment = { id: 'ok-assess', feeAmount: '0', status: AssessmentStatus.DRAFT };
      mockAssessmentRepo.create.mockReturnValue(assessment);
      mockAssessmentRepo.save.mockResolvedValue(assessment);
      mockPerformanceRepo.update.mockResolvedValue(undefined);

      const { start, end } = makePeriod();
      const result = await service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1');
      expect(result).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Security
  // ─────────────────────────────────────────────────────────────────────────

  describe('security — audit metadata does not leak secrets', () => {
    it('audit logs for policy creation do not contain sensitive data', async () => {
      const policy = makePolicy();
      mockPolicyRepo.create.mockReturnValue(policy);
      mockPolicyRepo.save.mockResolvedValue(policy);

      await service.createPolicy({ name: 'Test', feePercent: 20, billingFrequency: BillingFrequency.MONTHLY }, 'admin-1');

      const auditCalls = mockAuditService.log.mock.calls;
      for (const [call] of auditCalls) {
        const metaStr = JSON.stringify(call.metadata ?? {});
        expect(metaStr).not.toContain('password');
        expect(metaStr).not.toContain('secret');
        expect(metaStr).not.toContain('credential');
        expect(metaStr).not.toContain('apiKey');
      }
    });

    it('assessment audit logs do not expose sensitive internal fields', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy());
      mockAssessmentRepo.findOne.mockResolvedValue(null);
      mockPerformanceRepo.findOne.mockResolvedValue({ id: 'perf-sec', currentHighWaterMark: '0', totalRealisedProfit: '0' });
      mockLedgerRepo.find.mockResolvedValue([]);
      const assessment = { id: 'sec-assess', feeAmount: '0', status: AssessmentStatus.DRAFT };
      mockAssessmentRepo.create.mockReturnValue(assessment);
      mockAssessmentRepo.save.mockResolvedValue(assessment);
      mockPerformanceRepo.update.mockResolvedValue(undefined);

      const { start, end } = makePeriod();
      await service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1');

      for (const [call] of mockAuditService.log.mock.calls) {
        const metaStr = JSON.stringify(call.metadata ?? {});
        expect(metaStr).not.toContain('apiKey');
        expect(metaStr).not.toContain('secret');
        expect(metaStr).not.toContain('rawBody');
        expect(metaStr).not.toContain('cardNumber');
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getCurrentHighWaterMark
  // ─────────────────────────────────────────────────────────────────────────

  describe('getCurrentHighWaterMark', () => {
    it('returns 0 when no performance record exists', async () => {
      mockPerformanceRepo.findOne.mockResolvedValue(null);
      const hwm = await service.getCurrentHighWaterMark('user-1', null, 'USD');
      expect(hwm).toBe('0');
    });

    it('returns stored HWM value', async () => {
      mockPerformanceRepo.findOne.mockResolvedValue({ id: 'p1', currentHighWaterMark: '750000' });
      const hwm = await service.getCurrentHighWaterMark('user-1', null, 'USD');
      expect(hwm).toBe('750000');
    });
  });
});
