import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, Logger } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ExecutionService } from './execution.service';
import { Trade, TradeCloseReason, TradeStatus } from './entities/trade.entity';
import { TradingSession, TradingSessionStatus } from './entities/trading-session.entity';
import { BrokerService } from '../broker/broker.service';
import { BrokerAdapterRegistry } from '../broker/adapters/broker-adapter.registry';
import { CredentialEncryptionService } from '../broker/services/credential-encryption.service';
import { AuditService } from '../audit/audit.service';
import { AuditSeverity } from '../audit/entities/audit-log.entity';
import { RiskDecision, RiskRejectionCode } from '../risk/interfaces/risk.interface';
import { BrokerConnectionStatus, BrokerMode } from '../broker/interfaces/broker-adapter.interface';
import { DomainEventBus } from '../events/event-bus.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const approvedDecision: RiskDecision = {
  decision: 'APPROVED',
  signalId: 'sig-001',
  validatedOrder: {
    instrument: 'EURUSD',
    direction: 'BUY',
    lotSize: '0.05',
    entryPrice: '1.08500',
    stopLoss: '1.07500',
    takeProfit: '1.09500',
    idempotencyKey: 'idem-abc',
  },
  appliedRules: ['KILL_SWITCH:OK'],
  riskScore: 30,
  evaluatedAt: new Date(),
  // Sprint 32 Gate 2: required for the advisory-lock daily-trade-slot reservation
  maxDailyTrades: 10,
};

const rejectedDecision: RiskDecision = {
  decision: 'REJECTED',
  signalId: 'sig-002',
  rejectionCode: RiskRejectionCode.KILL_SWITCH_ACTIVE,
  rejectionReason: 'Kill switch is active',
  evaluatedAt: new Date(),
};

const mockBrokerConnection = {
  id: 'conn-1',
  userId: 'user-1',
  brokerId: 'metatrader',
  accountType: BrokerMode.DEMO,
  status: BrokerConnectionStatus.CONNECTED,
  encryptedCredentials: 'enc',
  credentialIv: 'iv',
  credentialTag: 'tag',
  encryptionKeyId: 'key-1',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ExecutionService', () => {
  let module: TestingModule;
  let service: ExecutionService;
  let tradeRepo: jest.Mocked<{
    findOne: jest.Mock;
    find: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  }>;
  let sessionRepo: jest.Mocked<{
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  }>;
  let mockAdapter: {
    setMode: jest.Mock;
    connect: jest.Mock;
    placeOrder: jest.Mock;
    closeOrder: jest.Mock;
    getOrderStatus: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let dataSource: { query: jest.Mock; transaction: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockAdapter = {
      setMode: jest.fn(),
      connect: jest.fn().mockResolvedValue({ success: true }),
      placeOrder: jest.fn().mockResolvedValue({
        success: true,
        externalOrderId: 'ext-order-1',
        filledPrice: '1.08502',
        status: 'FILLED',
      }),
      closeOrder: jest.fn().mockResolvedValue({
        success: true,
        filledPrice: '1.09000', // exit price comes through as filledPrice
        status: 'FILLED',
      }),
      getOrderStatus: jest.fn().mockResolvedValue({ status: 'OPEN' }),
    };

    tradeRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation((obj) => ({ id: 'trade-1', ...obj })),
      save: jest.fn().mockImplementation(async (obj) => ({ id: 'trade-1', ...obj })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    sessionRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((obj) => obj),
      save: jest.fn().mockImplementation(async (obj) => obj),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    // Sprint 32 Gate 2: mock dataSource.transaction for reserveDailyTradeSlot
    // (advisory lock). The mock manager supports query() for the lock + count.
    const mockManager = {
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('pg_advisory_xact_lock')) return Promise.resolve([]);
        if (sql.includes('COUNT(*)')) return Promise.resolve([{ count: '0' }]);
        return Promise.resolve([]);
      }),
    };
    dataSource = {
      query: jest.fn().mockResolvedValue([{ total: '0' }]),
      transaction: jest
        .fn()
        .mockImplementation((cb: (manager: typeof mockManager) => Promise<unknown>) =>
          cb(mockManager),
        ),
    };

    module = await Test.createTestingModule({
      providers: [
        ExecutionService,
        { provide: getRepositoryToken(Trade), useValue: tradeRepo },
        { provide: getRepositoryToken(TradingSession), useValue: sessionRepo },
        {
          provide: BrokerService,
          useValue: {
            findActiveConnectionForUser: jest.fn().mockResolvedValue(mockBrokerConnection),
            findConnectionById: jest.fn().mockResolvedValue(mockBrokerConnection),
          },
        },
        {
          provide: BrokerAdapterRegistry,
          useValue: { getAdapter: jest.fn().mockReturnValue(mockAdapter) },
        },
        {
          provide: CredentialEncryptionService,
          useValue: { decrypt: jest.fn().mockReturnValue({ accountId: 'acc-1', apiKey: 'k' }) },
        },
        { provide: AuditService, useValue: auditService },
        { provide: DataSource, useValue: dataSource },
        {
          provide: DomainEventBus,
          useValue: { publish: jest.fn(), subscribe: jest.fn().mockReturnValue(() => {}) },
        },
      ],
    }).compile();

    service = module.get<ExecutionService>(ExecutionService);
  });

  afterEach(async () => {
    await module.close();
  });

  // ─── Risk Engine gate — non-bypassable ────────────────────────────────────

  describe('Risk Engine gate', () => {
    it('throws ForbiddenException for REJECTED decision — gate cannot be bypassed', async () => {
      await expect(service.executeTrade('user-1', rejectedDecision)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException for SUSPENDED decision', async () => {
      const suspended: RiskDecision = {
        decision: 'SUSPENDED',
        signalId: 'x',
        rejectionCode: RiskRejectionCode.DAILY_LOSS_LIMIT_REACHED,
        rejectionReason: 'Daily loss',
        evaluatedAt: new Date(),
      };
      await expect(service.executeTrade('user-1', suspended)).rejects.toThrow(ForbiddenException);
    });

    it('includes rejection code in ForbiddenException message', async () => {
      await expect(service.executeTrade('user-1', rejectedDecision)).rejects.toThrow(
        /KILL_SWITCH_ACTIVE/,
      );
    });

    it('never calls broker when decision is not APPROVED', async () => {
      await expect(service.executeTrade('user-1', rejectedDecision)).rejects.toThrow();
      expect(mockAdapter.placeOrder).not.toHaveBeenCalled();
    });

    it('APPROVED decision passes the gate and proceeds to broker', async () => {
      await service.executeTrade('user-1', approvedDecision);
      expect(mockAdapter.placeOrder).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Idempotency ──────────────────────────────────────────────────────────

  describe('Idempotency', () => {
    it('returns existing trade when unique constraint rejects duplicate INSERT', async () => {
      // Sprint 32: the idempotency check is now atomic — the INSERT is
      // attempted and if the DB rejects it with a unique-constraint
      // violation (SQLSTATE 23505), we load and return the existing trade.
      const existingTrade = { id: 'trade-existing', status: TradeStatus.OPEN };

      // Simulate the DB rejecting the INSERT with a 23505 unique violation.
      const uniqueViolation = Object.assign(
        new Error('duplicate key value violates unique constraint'),
        {
          code: '23505',
        },
      );
      tradeRepo.save.mockRejectedValueOnce(uniqueViolation);

      // The subsequent findOne (to load the existing trade) returns it.
      tradeRepo.findOne.mockResolvedValue(existingTrade);

      const result = await service.executeTrade('user-1', approvedDecision);

      expect(result).toEqual(existingTrade);
      expect(mockAdapter.placeOrder).not.toHaveBeenCalled();
      // Audit the suppression
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TRADE_DUPLICATE_SUPPRESSED',
          severity: AuditSeverity.WARNING,
          metadata: expect.objectContaining({ existingTradeId: 'trade-existing' }),
        }),
      );
    });
  });

  // ─── Successful execution ─────────────────────────────────────────────────

  describe('Successful APPROVED execution', () => {
    it('creates a PENDING trade before calling broker', async () => {
      await service.executeTrade('user-1', approvedDecision);
      expect(tradeRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: TradeStatus.PENDING, instrument: 'EURUSD' }),
      );
    });

    it('calls placeOrder with Risk Engine-validated values', async () => {
      await service.executeTrade('user-1', approvedDecision);
      expect(mockAdapter.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          instrument: 'EURUSD',
          direction: 'BUY',
          lotSize: '0.05',
          stopLoss: '1.07500',
          takeProfit: '1.09500',
        }),
      );
    });

    it('updates trade to OPEN with externalOrderId on broker success', async () => {
      await service.executeTrade('user-1', approvedDecision);
      expect(tradeRepo.update).toHaveBeenCalledWith(
        'trade-1',
        expect.objectContaining({
          status: TradeStatus.OPEN,
          externalOrderId: 'ext-order-1',
          fillPrice: '1.08502',
        }),
      );
    });

    it('records TRADE_PREPARED and TRADE_OPENED audit events', async () => {
      await service.executeTrade('user-1', approvedDecision);
      expect(auditService.log).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Broker rejects order ─────────────────────────────────────────────────

  describe('Broker rejection', () => {
    beforeEach(() => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('sets trade to REJECTED when broker returns success=false', async () => {
      mockAdapter.placeOrder.mockResolvedValueOnce({
        success: false,
        brokerMessage: 'Insufficient margin',
        status: 'FAILED',
      });

      await service.executeTrade('user-1', approvedDecision);

      expect(tradeRepo.update).toHaveBeenCalledWith(
        'trade-1',
        expect.objectContaining({ status: TradeStatus.REJECTED }),
      );
    });
  });

  // ─── Broker error → RECONCILIATION_PENDING ───────────────────────────────

  describe('Broker error handling', () => {
    beforeEach(() => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('sets trade to RECONCILIATION_PENDING on broker exception', async () => {
      mockAdapter.placeOrder.mockRejectedValueOnce(new Error('MetaAPI network error'));

      await service.executeTrade('user-1', approvedDecision);

      expect(tradeRepo.update).toHaveBeenCalledWith(
        'trade-1',
        expect.objectContaining({ status: TradeStatus.RECONCILIATION_PENDING }),
      );
    });
  });

  // ─── closeTrade ───────────────────────────────────────────────────────────

  describe('closeTrade()', () => {
    it('throws ForbiddenException when trade not found', async () => {
      tradeRepo.findOne.mockResolvedValue(null);
      await expect(
        service.closeTrade('missing', 'user-1', TradeCloseReason.MANUAL_CLOSE),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when trade is not OPEN', async () => {
      tradeRepo.findOne.mockResolvedValue({
        id: 'trade-1',
        userId: 'user-1',
        status: TradeStatus.CLOSED,
      });
      await expect(
        service.closeTrade('trade-1', 'user-1', TradeCloseReason.MANUAL_CLOSE),
      ).rejects.toThrow(ForbiddenException);
    });

    it('calls closeOrder on broker and updates trade to CLOSED', async () => {
      tradeRepo.findOne.mockResolvedValue({
        id: 'trade-1',
        userId: 'user-1',
        status: TradeStatus.OPEN,
        externalOrderId: 'ext-1',
        brokerConnectionId: 'conn-1',
        openedAt: new Date(),
      });

      await service.closeTrade('trade-1', 'user-1', TradeCloseReason.MANUAL_CLOSE);

      expect(mockAdapter.closeOrder).toHaveBeenCalledWith('ext-1');
      expect(tradeRepo.update).toHaveBeenCalledWith(
        'trade-1',
        expect.objectContaining({
          status: TradeStatus.CLOSED,
          closeReason: TradeCloseReason.MANUAL_CLOSE,
          exitPrice: '1.09000',
          // realisedPnl populated later by TradeReconciliationJob (not available from closeOrder result)
        }),
      );
    });
  });

  // ─── Query helpers ─────────────────────────────────────────────────────────

  describe('countOpenTrades()', () => {
    it('returns count from repository', async () => {
      tradeRepo.count.mockResolvedValue(3);
      expect(await service.countOpenTrades('user-1')).toBe(3);
    });
  });

  describe('getTodayRealisedLoss()', () => {
    it('returns 0 when no losses today', async () => {
      dataSource.query.mockResolvedValue([{ total: '0' }]);
      expect(await service.getTodayRealisedLoss('user-1')).toBe(0);
    });

    it('returns negative number representing loss', async () => {
      dataSource.query.mockResolvedValue([{ total: '-250.75' }]);
      expect(await service.getTodayRealisedLoss('user-1')).toBe(-250.75);
    });
  });

  // ─── Session management ───────────────────────────────────────────────────

  describe('startSession()', () => {
    it('creates new session when none exists', async () => {
      await service.startSession('user-1', 'conn-1', '10000.00');
      expect(sessionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          status: TradingSessionStatus.ACTIVE,
          openingBalance: '10000.00',
        }),
      );
    });

    it('returns existing session without creating duplicate', async () => {
      const existing = { id: 'sess-1', status: TradingSessionStatus.ACTIVE };
      sessionRepo.findOne.mockResolvedValue(existing);

      const result = await service.startSession('user-1', 'conn-1', '10000.00');
      expect(result).toEqual(existing);
      expect(sessionRepo.save).not.toHaveBeenCalled();
    });
  });
});
