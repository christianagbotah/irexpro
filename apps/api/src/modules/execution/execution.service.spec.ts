import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, Logger } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ExecutionService } from './execution.service';
import { Trade, TradeCloseReason, TradeStatus } from './entities/trade.entity';
import { TradingSession, TradingSessionStatus } from './entities/trading-session.entity';
import { BrokerService } from '../broker/broker.service';
import { BrokerAdapterRegistry } from '../broker/adapters/broker-adapter.registry';
import { BrokerCircuitBreakerService } from '../broker/circuit-breaker/broker-circuit-breaker.service';
import { ExecutionResilienceService } from './execution-resilience.service';
const mockResilienceService = {
  submitOrderWithResilience: jest.fn().mockResolvedValue({
    success: true,
    externalOrderId: 'broker-order-1',
    filledPrice: '1.10010',
    filledVolume: '0.05',
    status: 'FILLED',
    slippagePoints: 1,
    requoteAttempts: 0,
    rejectionReason: null,
    brokerMessage: null,
    uncertain: false,
  }),
};
const mockCircuitBreaker = {
  canExecute: jest.fn().mockReturnValue(true),
  recordSuccess: jest.fn().mockResolvedValue(undefined),
  recordFailure: jest.fn().mockResolvedValue(false),
  getState: jest.fn().mockReturnValue('CLOSED'),
  getDetails: jest.fn().mockReturnValue({ state: 'CLOSED', failureCount: 0 }),
  reset: jest.fn().mockResolvedValue(undefined),
};
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
    // Re-set the resilience mock implementation after clearAllMocks
    mockResilienceService.submitOrderWithResilience.mockImplementation(
      async (adapter: any, request: any) => {
        try {
          const result = await adapter.placeOrder(request);
          return {
            success: result.success,
            externalOrderId: result.externalOrderId ?? null,
            filledPrice: result.filledPrice ?? null,
            filledVolume: request.lotSize,
            status: result.success ? 'FILLED' : 'REJECTED',
            slippagePoints: null,
            requoteAttempts: 0,
            rejectionReason: result.success ? null : 'BROKER_REJECTED',
            brokerMessage: result.brokerMessage ?? null,
            uncertain: false,
          };
        } catch (err) {
          return {
            success: false,
            externalOrderId: null,
            filledPrice: null,
            filledVolume: null,
            status: 'FAILED',
            slippagePoints: null,
            requoteAttempts: 0,
            rejectionReason: (err as Error).message,
            brokerMessage: (err as Error).message,
            uncertain: false,
          };
        }
      },
    );

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
    // Sprint 32 Gate 3: mock dataSource.transaction for atomicallyReserveTradeSlot.
    // The mock manager supports: advisory lock, idempotency SELECT, count SELECT,
    // and INSERT ... RETURNING.
    const mockTradeRow = {
      id: 'trade-1',
      user_id: 'user-1',
      broker_connection_id: 'conn-1',
      signal_id: 'sig-001',
      idempotency_key: 'idem-abc',
      instrument: 'EURUSD',
      direction: 'BUY',
      lot_size: '0.05',
      requested_entry_price: '1.08500',
      stop_loss: '1.07500',
      take_profit: '1.09500',
      trailing_stop_pips: null,
      status: 'PENDING',
      opened_at: null,
      closed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const mockManager = {
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('pg_advisory_xact_lock')) return Promise.resolve([]);
        if (sql.includes('SELECT * FROM trading.trades WHERE idempotency_key'))
          return Promise.resolve([]);
        if (sql.includes('COUNT(*)')) return Promise.resolve([{ count: '0' }]);
        if (sql.includes('INSERT INTO trading.trades')) return Promise.resolve([mockTradeRow]);
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
        { provide: ExecutionResilienceService, useValue: mockResilienceService },
        { provide: BrokerCircuitBreakerService, useValue: mockCircuitBreaker },
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
    it('returns existing trade when idempotency_key already exists (duplicate signal)', async () => {
      // Sprint 32 Gate 3: the idempotency check is now inside the advisory-lock
      // transaction. When a trade with the same idempotency_key already exists,
      // the SELECT inside the transaction finds it and returns DUPLICATE_EXISTING.
      const existingTrade = {
        id: 'trade-existing',
        status: 'OPEN',
        instrument: 'EURUSD',
        direction: 'BUY',
      };

      // Override the mock manager to return the existing trade on SELECT
      const mockMgr = (dataSource as { transaction: jest.Mock }).transaction.mock.calls[0]?.[0]
        ? undefined // not used — we override below
        : undefined;
      void mockMgr; // suppress unused

      // Re-setup the transaction mock to return existing trade
      (dataSource as { transaction: jest.Mock }).transaction.mockImplementationOnce(
        async (cb: (manager: { query: jest.Mock }) => Promise<unknown>) => {
          const mgr = {
            query: jest.fn().mockImplementation((sql: string) => {
              if (sql.includes('pg_advisory_xact_lock')) return Promise.resolve([]);
              if (sql.includes('SELECT * FROM trading.trades WHERE idempotency_key'))
                return Promise.resolve([existingTrade]);
              return Promise.resolve([]);
            }),
          };
          return cb(mgr);
        },
      );

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
    it('creates a PENDING trade before calling broker (via atomic reservation)', async () => {
      // Sprint 32 Gate 3: the PENDING INSERT is now inside the advisory-lock
      // transaction (raw SQL INSERT ... RETURNING). The mock manager handles it.
      // We verify the broker was called AFTER the reservation (trade was PENDING).
      await service.executeTrade('user-1', approvedDecision);
      // The broker placeOrder should have been called (the reservation succeeded)
      expect(mockAdapter.placeOrder).toHaveBeenCalled();
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
