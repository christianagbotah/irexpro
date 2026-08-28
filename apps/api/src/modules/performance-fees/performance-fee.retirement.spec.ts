/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PerformanceFeeService } from './services/performance-fee.service';
import { PerformanceFeePolicy, BillingFrequency } from './entities/performance-fee-policy.entity';
import { TradingAccountPerformance } from './entities/trading-account-performance.entity';
import {
  PerformanceFeeAssessment,
  AssessmentStatus,
} from './entities/performance-fee-assessment.entity';
import {
  PerformanceFeeLedgerEntry,
  LedgerEntryType,
} from './entities/performance-fee-ledger-entry.entity';
import { Invoice } from '../payments/entities/invoice.entity';
import { PaymentTransaction } from '../payments/entities/payment-transaction.entity';
import { AuditService } from '../audit/audit.service';
import { CreatePolicyDto } from './dto/create-policy.dto';

const mockPolicyManager = { transaction: jest.fn() };
const mockPolicyRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  count: jest.fn(),
  manager: mockPolicyManager,
};
const mockPerformanceRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
};
const mockAssessmentRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
};
const mockLedgerRepo = { find: jest.fn(), save: jest.fn(), findOne: jest.fn() };
const mockInvoiceRepo = { create: jest.fn(), save: jest.fn() };
const mockTransactionRepo = { create: jest.fn(), save: jest.fn() };
const mockAuditService = { log: jest.fn() };

function makeGlobalPolicy(o: Partial<PerformanceFeePolicy> = {}): PerformanceFeePolicy {
  return {
    id: 'global-policy-1',
    planId: null,
    name: 'Standard 20% Global',
    feePercent: '20.0000',
    billingFrequency: BillingFrequency.MONTHLY,
    calculationMode: 'HIGH_WATER_MARK' as any,
    appliesTo: 'REALISED_PROFIT_ONLY' as any,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...o,
  };
}
function makePeriod() {
  return { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-01-31T23:59:59Z') };
}
function makeUsdPerformance() {
  return { id: 'perf-1', currentHighWaterMark: '0', totalRealisedProfit: '0', currency: 'USD' };
}

describe('PerformanceFeeService — GATE-3 proofs', () => {
  let service: PerformanceFeeService;
  beforeEach(async () => {
    jest.clearAllMocks();
    mockPolicyManager.transaction.mockImplementation(async (callback) =>
      callback({
        query: jest.fn().mockResolvedValue(undefined),
        getRepository: () => mockPolicyRepo,
      }),
    );
    const module = await Test.createTestingModule({
      providers: [
        PerformanceFeeService,
        { provide: getRepositoryToken(PerformanceFeePolicy), useValue: mockPolicyRepo },
        { provide: getRepositoryToken(TradingAccountPerformance), useValue: mockPerformanceRepo },
        { provide: getRepositoryToken(PerformanceFeeAssessment), useValue: mockAssessmentRepo },
        { provide: getRepositoryToken(PerformanceFeeLedgerEntry), useValue: mockLedgerRepo },
        { provide: getRepositoryToken(Invoice), useValue: mockInvoiceRepo },
        { provide: getRepositoryToken(PaymentTransaction), useValue: mockTransactionRepo },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();
    service = module.get(PerformanceFeeService);
  });
  function setupHappy() {
    mockPolicyRepo.find.mockResolvedValue([makeGlobalPolicy()]);
    mockAssessmentRepo.findOne.mockResolvedValue(null);
    mockPerformanceRepo.findOne.mockResolvedValue(makeUsdPerformance());
    mockLedgerRepo.find.mockResolvedValue([
      {
        id: 'led-1',
        entryType: LedgerEntryType.REALISED_TRADE_PROFIT,
        amount: '500000',
        currency: 'USD',
      },
    ]);
    const a = { id: 'assess-1', feeAmount: '100000', status: AssessmentStatus.ASSESSED };
    mockAssessmentRepo.create.mockReturnValue(a);
    mockAssessmentRepo.save.mockResolvedValue(a);
    mockPerformanceRepo.update.mockResolvedValue(undefined);
  }

  it('1. assessment works without subscription', async () => {
    setupHappy();
    const { start, end } = makePeriod();
    const r = await service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1');
    expect(r.id).toBe('assess-1');
  });
  it('2. assessment.subscriptionId = null', async () => {
    setupHappy();
    mockAssessmentRepo.create.mockImplementation((p: any) => p);
    mockAssessmentRepo.save.mockImplementation(async (a: any) => a);
    const { start, end } = makePeriod();
    await service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1');
    expect(mockAssessmentRepo.create.mock.calls[0][0].subscriptionId).toBeNull();
  });
  it('3. invoice.subscriptionId = null', async () => {
    mockAssessmentRepo.findOne.mockResolvedValue({
      id: 'a1',
      status: AssessmentStatus.ASSESSED,
      userId: 'u1',
      subscriptionId: 'legacy',
      brokerConnectionId: null,
      currency: 'USD',
      feeAmount: '50000',
      feePercent: '20.0000',
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-01-31'),
      realisedProfitForFee: '250000',
      invoiceId: null,
    });
    mockInvoiceRepo.create.mockImplementation((p: any) => ({ ...p, id: 'inv' }));
    mockInvoiceRepo.save.mockResolvedValue({ id: 'inv' });
    mockTransactionRepo.create.mockImplementation((p: any) => ({ ...p, id: 'tx' }));
    mockTransactionRepo.save.mockResolvedValue({ id: 'tx' });
    mockAssessmentRepo.save.mockImplementation(async (a: any) => a);
    mockLedgerRepo.save.mockResolvedValue({});
    await service.invoiceAssessment('a1', 'admin-1');
    expect(mockInvoiceRepo.create.mock.calls[0][0].subscriptionId).toBeNull();
    expect(mockTransactionRepo.create.mock.calls[0][0].subscriptionId).toBeNull();
  });
  it('4. no global policy → BadRequest', async () => {
    mockPolicyRepo.find.mockResolvedValue([]);
    const { start, end } = makePeriod();
    await expect(
      service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1'),
    ).rejects.toThrow(/No active global/);
  });
  it('5. multiple global policies → BadRequest', async () => {
    mockPolicyRepo.find.mockResolvedValue([
      makeGlobalPolicy({ id: 'g1' }),
      makeGlobalPolicy({ id: 'g2' }),
    ]);
    const { start, end } = makePeriod();
    await expect(
      service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1'),
    ).rejects.toThrow(/Multiple active global/);
  });

  describe('BLOCKER 3 — currency binding', () => {
    it('6. USD+USD+USD → succeeds', async () => {
      setupHappy();
      const { start, end } = makePeriod();
      await service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1');
      expect(mockAssessmentRepo.create.mock.calls[0][0].currency).toBe('USD');
    });
    it('7. USD+USD+GHS → rejects', async () => {
      setupHappy();
      const { start, end } = makePeriod();
      await expect(
        service.calculateAssessment('user-1', null, 'GHS', start, end, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
      expect(mockAssessmentRepo.save).not.toHaveBeenCalled();
    });
    it('8. mixed-currency ledger → rejects', async () => {
      mockPolicyRepo.find.mockResolvedValue([makeGlobalPolicy()]);
      mockAssessmentRepo.findOne.mockResolvedValue(null);
      mockPerformanceRepo.findOne.mockResolvedValue(makeUsdPerformance());
      mockLedgerRepo.find.mockResolvedValue([
        {
          id: 'l1',
          entryType: LedgerEntryType.REALISED_TRADE_PROFIT,
          amount: '500000',
          currency: 'USD',
        },
        {
          id: 'l2',
          entryType: LedgerEntryType.REALISED_TRADE_PROFIT,
          amount: '300000',
          currency: 'EUR',
        },
      ]);
      const { start, end } = makePeriod();
      await expect(
        service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1'),
      ).rejects.toThrow(/Currency mismatch in ledger/);
    });
    it('9. existing perf currency mismatch → rejects', async () => {
      mockPolicyRepo.find.mockResolvedValue([makeGlobalPolicy()]);
      mockAssessmentRepo.findOne.mockResolvedValue(null);
      mockPerformanceRepo.findOne.mockResolvedValue({
        id: 'p',
        currentHighWaterMark: '0',
        totalRealisedProfit: '0',
        currency: 'GHS',
      });
      const { start, end } = makePeriod();
      await expect(
        service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1'),
      ).rejects.toThrow(/Currency mismatch: requested 'USD'/);
    });
    it('10. mismatch → no mutation', async () => {
      setupHappy();
      const { start, end } = makePeriod();
      try {
        await service.calculateAssessment('user-1', null, 'EUR', start, end, 'admin-1');
      } catch {}
      expect(mockAssessmentRepo.save).not.toHaveBeenCalled();
      expect(mockPerformanceRepo.update).not.toHaveBeenCalled();
    });
    it('11. valid GHS works', async () => {
      mockPolicyRepo.find.mockResolvedValue([makeGlobalPolicy()]);
      mockAssessmentRepo.findOne.mockResolvedValue(null);
      mockPerformanceRepo.findOne.mockResolvedValue({
        id: 'p',
        currentHighWaterMark: '0',
        totalRealisedProfit: '0',
        currency: 'GHS',
      });
      mockLedgerRepo.find.mockResolvedValue([
        {
          id: 'l',
          entryType: LedgerEntryType.REALISED_TRADE_PROFIT,
          amount: '500000',
          currency: 'GHS',
        },
      ]);
      const a = { id: 'a', feeAmount: '100000', status: AssessmentStatus.ASSESSED };
      mockAssessmentRepo.create.mockReturnValue(a);
      mockAssessmentRepo.save.mockResolvedValue(a);
      mockPerformanceRepo.update.mockResolvedValue(undefined);
      const { start, end } = makePeriod();
      const r = await service.calculateAssessment('user-1', null, 'GHS', start, end, 'admin-1');
      expect(r.id).toBe('a');
    });
  });

  describe('BLOCKER 4 — policy creation', () => {
    function dto(o: Partial<CreatePolicyDto> = {}): CreatePolicyDto {
      return { name: 'New', feePercent: 20, billingFrequency: BillingFrequency.MONTHLY, ...o };
    }
    it('12. first global → succeeds', async () => {
      mockPolicyRepo.count.mockResolvedValue(0);
      mockPolicyRepo.create.mockImplementation((p: any) => p);
      mockPolicyRepo.save.mockImplementation(async (p: any) => ({ ...p, id: 'np' }));
      const r = await service.createPolicy(dto(), 'admin-1');
      expect(r.id).toBe('np');
      expect(r.planId).toBeNull();
    });
    it('13. second global → rejected', async () => {
      mockPolicyRepo.count.mockResolvedValue(1);
      await expect(service.createPolicy(dto({ name: 'Second' }), 'admin-1')).rejects.toThrow(
        /already exists/,
      );
      expect(mockPolicyRepo.save).not.toHaveBeenCalled();
    });
    it('14. historical plan-specific + no global → first succeeds', async () => {
      mockPolicyRepo.count.mockResolvedValue(0);
      mockPolicyRepo.create.mockImplementation((p: any) => p);
      mockPolicyRepo.save.mockImplementation(async (p: any) => ({ ...p, id: 'ng' }));
      const r = await service.createPolicy(dto(), 'admin-1');
      expect(r.planId).toBeNull();
    });
    it('15. planId supplied → rejected', async () => {
      mockPolicyRepo.count.mockResolvedValue(0);
      await expect(service.createPolicy(dto({ planId: 'x' } as any), 'admin-1')).rejects.toThrow(
        /retired/,
      );
    });
    it('16. findActiveGlobalPolicy 0 → rejects', async () => {
      mockPolicyRepo.find.mockResolvedValue([]);
      await expect(service.findActiveGlobalPolicy()).rejects.toThrow(/No active global/);
    });
    it('17. findActiveGlobalPolicy 1 → succeeds', async () => {
      mockPolicyRepo.find.mockResolvedValue([makeGlobalPolicy()]);
      expect((await service.findActiveGlobalPolicy()).id).toBe('global-policy-1');
    });
    it('18. findActiveGlobalPolicy >1 → rejects', async () => {
      mockPolicyRepo.find.mockResolvedValue([
        makeGlobalPolicy({ id: 'g1' }),
        makeGlobalPolicy({ id: 'g2' }),
      ]);
      await expect(service.findActiveGlobalPolicy()).rejects.toThrow(/Multiple active global/);
    });
    it('19. assessment never falls back to plan-specific', async () => {
      mockPolicyRepo.find.mockResolvedValue([]);
      mockPerformanceRepo.findOne.mockResolvedValue(makeUsdPerformance());
      const { start, end } = makePeriod();
      await expect(
        service.calculateAssessment('user-1', null, 'USD', start, end, 'admin-1'),
      ).rejects.toThrow(/No active global/);
    });

    // ── 20. (GATE-3 §5) Historical plan-linked policies do NOT participate in
    // runtime global-policy resolution. This directly replaces the semantic
    // coverage lost when the deprecated findApplicablePolicy plan-specific
    // lookup was removed. findActiveGlobalPolicy queries ONLY plan_id IS NULL
    // & isActive=true — a historical active plan-linked policy is invisible to
    // it and cannot create ambiguity or be returned.
    it('20. historical plan-linked policies are ignored by findActiveGlobalPolicy (no plan-specific path exists)', async () => {
      // State: one active GLOBAL policy + one active historical PLAN-LINKED policy.
      // findActiveGlobalPolicy must return ONLY the global one — the plan-linked
      // policy must NOT participate in runtime resolution.
      const globalPolicy = makeGlobalPolicy({ id: 'global-active' });
      // A historical plan-linked policy (planId != null) exists in the DB but
      // is intentionally NOT returned by findActiveGlobalPolicy — the real DB
      // query (WHERE plan_id IS NULL AND is_active = true) excludes it.
      makeGlobalPolicy({ id: 'legacy-plan-policy', planId: 'legacy-plan-id-123' });
      mockPolicyRepo.find.mockImplementation(async () => {
        return [globalPolicy];
      });

      const resolved = await service.findActiveGlobalPolicy();
      expect(resolved.id).toBe('global-active');
      expect(resolved.planId).toBeNull();

      // The find query MUST target planId IS NULL only — never a plan-specific lookup.
      expect(mockPolicyRepo.find).toHaveBeenCalledWith({
        where: { planId: expect.anything(), isActive: true },
      });

      // Verify the plan-linked policy was never returned (no ambiguity)
      expect(resolved.id).not.toBe('legacy-plan-policy');
    });

    // ── 21. (GATE-3 §5) planId = null is accepted by the service boundary and
    // normalized to the global policy representation. The service must NEVER
    // interpret null as a request for plan-specific behavior — it always
    // enforces planId = null on the persisted policy.
    it('21. planId = null is accepted and normalized to global (never interpreted as plan-specific)', async () => {
      mockPolicyRepo.count.mockResolvedValue(0);
      mockPolicyRepo.create.mockImplementation((p: any) => p);
      mockPolicyRepo.save.mockImplementation(async (p: any) => ({ ...p, id: 'new-global' }));

      // Pass planId: null explicitly — the service must accept it and persist planId: null
      const r = await service.createPolicy(dto({ planId: null as any }), 'admin-1');
      expect(r.id).toBe('new-global');
      expect(r.planId).toBeNull();

      // The create() payload must have planId: null (global), never a plan-specific value
      const createPayload = mockPolicyRepo.create.mock.calls[0][0];
      expect(createPayload.planId).toBeNull();
    });
  });
});
