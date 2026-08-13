import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RiskService } from './risk.service';
import { RiskProfile } from './entities/risk-profile.entity';
import { RiskViolation } from './entities/risk-violation.entity';
import { BrokerService } from '../broker/broker.service';
import { AuditService } from '../audit/audit.service';
import { ExecutionService } from '../execution/execution.service';
import { ProposedTrade, RiskRejectionCode } from './interfaces/risk.interface';
import { DomainEventBus } from '../events/event-bus.service';
import { AllowedTradingMode } from './entities/risk-profile.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const validTrade = (): ProposedTrade => ({
  signalId: 'sig-s32-001',
  instrument: 'EURUSD',
  direction: 'BUY',
  requestedLotSize: '0.05',
  entryPrice: '1.08500',
  stopLoss: '1.07500',
  takeProfit: '1.09500',
  idempotencyKey: 'idem-s32',
  volatilityScore: 0.4,
  regime: 'TRENDING',
});

const defaultProfile = (): Partial<RiskProfile> => ({
  id: 'profile-1',
  userId: 'user-1',
  killSwitchActive: false,
  killSwitchReason: null,
  maxDailyLossPercent: '5.00',
  maxDrawdownPercent: '10.00',
  maxOpenTrades: 3,
  maxDailyTrades: 10,
  maxPositionSizeLot: '0.10',
  minStopLossPips: '5.00',
  allowedInstruments: null,
  maxVolatilityScore: '0.85',
  rejectLowLiquidity: true,
  maxTradeRiskPercent: '2.00',
  maxLeverageAllowed: 30,
  allowedTradingModes: AllowedTradingMode.PAPER_ONLY,
  riskAcknowledgementAccepted: true,
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockProfileRepo = () => ({
  findOne: jest.fn().mockResolvedValue(defaultProfile()),
  create: jest.fn().mockImplementation((obj) => ({ ...defaultProfile(), ...obj })),
  save: jest.fn().mockImplementation(async (obj) => obj),
  find: jest.fn().mockResolvedValue([]),
});

const mockViolationRepo = () => ({
  create: jest.fn().mockImplementation((obj) => obj),
  save: jest.fn().mockResolvedValue({}),
  find: jest.fn().mockResolvedValue([]),
});

const mockBrokerService = () => ({
  hasActiveConnection: jest.fn().mockResolvedValue(true),
  findActiveConnectionForUser: jest.fn().mockResolvedValue({ id: 'conn-1' }),
  getBrokerAccountState: jest.fn().mockResolvedValue({
    balance: '10000.00',
    equity: '10050.00',
    freeMargin: '9800.00',
    currency: 'USD',
  }),
});

const mockAuditService = () => ({
  log: jest.fn().mockResolvedValue(undefined),
});

const mockExecutionService = () => ({
  countOpenTrades: jest.fn().mockResolvedValue(0),
  countTodayTrades: jest.fn().mockResolvedValue(0),
  getTodayRealisedLoss: jest.fn().mockResolvedValue(0),
  findTradeBySignalId: jest.fn().mockResolvedValue(null),
});

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('RiskService — Sprint 32 Production Hardening', () => {
  let service: RiskService;
  let executionService: ReturnType<typeof mockExecutionService>;
  let brokerService: ReturnType<typeof mockBrokerService>;

  beforeEach(async () => {
    executionService = mockExecutionService();
    brokerService = mockBrokerService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RiskService,
        { provide: getRepositoryToken(RiskProfile), useValue: mockProfileRepo() },
        { provide: getRepositoryToken(RiskViolation), useValue: mockViolationRepo() },
        { provide: BrokerService, useValue: brokerService },
        { provide: AuditService, useValue: mockAuditService() },
        { provide: ExecutionService, useValue: executionService },
        { provide: DomainEventBus, useValue: { publish: jest.fn() } },
        { provide: Logger, useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    service = module.get(RiskService);
  });

  // ── Part C: Max daily trades ───────────────────────────────────────────────

  describe('Step 4b — Max daily trades', () => {
    it('approves when below the daily trade limit', async () => {
      executionService.countTodayTrades.mockResolvedValue(3);
      const decision = await service.validateProposedTrade('user-1', validTrade());
      expect(decision.decision).toBe('APPROVED');
    });

    it('rejects with MAX_DAILY_TRADES when at the limit', async () => {
      executionService.countTodayTrades.mockResolvedValue(10); // == maxDailyTrades (10)
      const decision = await service.validateProposedTrade('user-1', validTrade());
      expect(decision.decision).toBe('REJECTED');
      if (decision.decision === 'REJECTED') {
        expect(decision.rejectionCode).toBe(RiskRejectionCode.MAX_DAILY_TRADES);
        expect(decision.rejectionReason).toContain('10');
      }
    });

    it('rejects with MAX_DAILY_TRADES when above the limit', async () => {
      executionService.countTodayTrades.mockResolvedValue(15);
      const decision = await service.validateProposedTrade('user-1', validTrade());
      expect(decision.decision).toBe('REJECTED');
      if (decision.decision === 'REJECTED') {
        expect(decision.rejectionCode).toBe(RiskRejectionCode.MAX_DAILY_TRADES);
      }
    });

    it('fails closed with RISK_ENGINE_ERROR when countTodayTrades throws', async () => {
      executionService.countTodayTrades.mockRejectedValue(new Error('DB connection lost'));
      const decision = await service.validateProposedTrade('user-1', validTrade());
      expect(decision.decision).toBe('REJECTED');
      if (decision.decision === 'REJECTED') {
        expect(decision.rejectionCode).toBe(RiskRejectionCode.RISK_ENGINE_ERROR);
        expect(decision.rejectionReason).toContain('daily trade count');
      }
    });
  });

  // ── Part D: Margin / account capacity ─────────────────────────────────────

  describe('Step 3c — Margin / account capacity', () => {
    it('approves when freeMargin is positive', async () => {
      brokerService.getBrokerAccountState.mockResolvedValue({
        balance: '10000.00',
        equity: '10050.00',
        freeMargin: '9800.00',
        currency: 'USD',
      });
      const decision = await service.validateProposedTrade('user-1', validTrade());
      expect(decision.decision).toBe('APPROVED');
    });

    it('rejects with INSUFFICIENT_MARGIN when freeMargin is negative', async () => {
      brokerService.getBrokerAccountState.mockResolvedValue({
        balance: '10000.00',
        equity: '10000.00', // equity == balance → no drawdown trigger
        freeMargin: '-200.00',
        currency: 'USD',
      });
      const decision = await service.validateProposedTrade('user-1', validTrade());
      expect(decision.decision).toBe('REJECTED');
      if (decision.decision === 'REJECTED') {
        expect(decision.rejectionCode).toBe(RiskRejectionCode.INSUFFICIENT_MARGIN);
        expect(decision.rejectionReason).toContain('negative');
      }
    });

    it('rejects with INSUFFICIENT_MARGIN when freeMargin is malformed (NaN)', async () => {
      brokerService.getBrokerAccountState.mockResolvedValue({
        balance: '10000.00',
        equity: '10050.00',
        freeMargin: 'not-a-number',
        currency: 'USD',
      });
      const decision = await service.validateProposedTrade('user-1', validTrade());
      expect(decision.decision).toBe('REJECTED');
      if (decision.decision === 'REJECTED') {
        expect(decision.rejectionCode).toBe(RiskRejectionCode.INSUFFICIENT_MARGIN);
        expect(decision.rejectionReason).toContain('malformed');
      }
    });

    it('does not block when freeMargin is zero (paper account)', async () => {
      brokerService.getBrokerAccountState.mockResolvedValue({
        balance: '0',
        equity: '0',
        freeMargin: '0',
        currency: 'USD',
      });
      const decision = await service.validateProposedTrade('user-1', validTrade());
      // freeMargin=0 is valid for paper; only negative/NaN is blocked.
      // The decision should NOT be a margin rejection.
      if (decision.decision === 'REJECTED') {
        expect(decision.rejectionCode).not.toBe(RiskRejectionCode.INSUFFICIENT_MARGIN);
      }
    });
  });

  // ── Part A: Idempotency (Risk layer) ──────────────────────────────────────

  describe('Step 7 — Duplicate signal prevention', () => {
    it('rejects with DUPLICATE_SIGNAL when a trade already exists for the signalId', async () => {
      executionService.findTradeBySignalId.mockResolvedValue({
        id: 'trade-existing',
        status: 'OPEN',
      });
      const decision = await service.validateProposedTrade('user-1', validTrade());
      expect(decision.decision).toBe('REJECTED');
      if (decision.decision === 'REJECTED') {
        expect(decision.rejectionCode).toBe(RiskRejectionCode.DUPLICATE_SIGNAL);
        expect(decision.rejectionReason).toContain('sig-s32-001');
      }
    });

    it('approves when no existing trade for the signalId', async () => {
      executionService.findTradeBySignalId.mockResolvedValue(null);
      const decision = await service.validateProposedTrade('user-1', validTrade());
      expect(decision.decision).toBe('APPROVED');
    });

    it('fails closed with RISK_ENGINE_ERROR when findTradeBySignalId throws', async () => {
      executionService.findTradeBySignalId.mockRejectedValue(new Error('DB error'));
      const decision = await service.validateProposedTrade('user-1', validTrade());
      expect(decision.decision).toBe('REJECTED');
      if (decision.decision === 'REJECTED') {
        expect(decision.rejectionCode).toBe(RiskRejectionCode.RISK_ENGINE_ERROR);
        expect(decision.rejectionReason).toContain('idempotency');
      }
    });
  });

  // ── Part B: Risk profile snapshot ──────────────────────────────────────────

  describe('createRiskProfileSnapshot', () => {
    it('returns a JSON object with risk-relevant fields', () => {
      const profile = defaultProfile() as RiskProfile;
      const snapshot = service.createRiskProfileSnapshot(profile);
      expect(snapshot).toEqual(
        expect.objectContaining({
          maxDailyLossPercent: '5.00',
          maxDrawdownPercent: '10.00',
          maxOpenTrades: 3,
          maxDailyTrades: 10,
          maxPositionSizeLot: '0.10',
          minStopLossPips: '5.00',
          maxVolatilityScore: '0.85',
          rejectLowLiquidity: true,
          maxTradeRiskPercent: '2.00',
          maxLeverageAllowed: 30,
          allowedTradingModes: AllowedTradingMode.PAPER_ONLY,
          killSwitchActive: false,
          snapshotVersion: 1,
        }),
      );
    });

    it('does NOT include credentials, tokens, or secrets', () => {
      const profile = defaultProfile() as RiskProfile;
      const snapshot = service.createRiskProfileSnapshot(profile);
      const snapshotStr = JSON.stringify(snapshot);
      // Must not contain credential-related fields
      expect(snapshotStr).not.toMatch(
        /password|secret|token|apiKey|apiSecret|credential|encrypted/i,
      );
    });

    it('does NOT include the profile internal id or userId (those are on the session)', () => {
      const profile = defaultProfile() as RiskProfile;
      const snapshot = service.createRiskProfileSnapshot(profile);
      expect(snapshot).not.toHaveProperty('id');
      expect(snapshot).not.toHaveProperty('userId');
    });

    it('is deterministic — same profile produces the same fields (except timestamp)', () => {
      const profile = defaultProfile() as RiskProfile;
      const snapshot1 = service.createRiskProfileSnapshot(profile);
      const snapshot2 = service.createRiskProfileSnapshot(profile);
      // All fields except snapshotCreatedAt should match
      const { snapshotCreatedAt: _ignored1, ...rest1 } = snapshot1;
      const { snapshotCreatedAt: _ignored2, ...rest2 } = snapshot2;
      void _ignored1;
      void _ignored2;
      expect(rest1).toEqual(rest2);
    });
  });
});
