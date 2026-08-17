import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ExecutionService } from './execution.service';
import { Trade, TradeStatus } from './entities/trade.entity';
import { TradingSession } from './entities/trading-session.entity';
import { BrokerService } from '../broker/broker.service';
import { BrokerAdapterRegistry } from '../broker/adapters/broker-adapter.registry';
import { CredentialEncryptionService } from '../broker/services/credential-encryption.service';
import { AuditService } from '../audit/audit.service';
import { AuditSeverity } from '../audit/entities/audit-log.entity';
import { RiskDecision } from '../risk/interfaces/risk.interface';
import { BrokerMode } from '../broker/interfaces/broker-adapter.interface';
import { DomainEventBus } from '../events/event-bus.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const approvedDecision = (): RiskDecision => ({
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
  maxDailyTrades: 10,
});

const mockAdapter = () => ({
  setMode: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
  placeOrder: jest.fn().mockResolvedValue({
    success: true,
    externalOrderId: 'ext-001',
    filledPrice: '1.08500',
    status: 'FILLED',
  }),
  closeOrder: jest.fn().mockResolvedValue({ success: true, filledPrice: '1.09000' }),
  getOrderStatus: jest.fn().mockResolvedValue({ status: 'OPEN' }),
});

const mockEncryptionService = () => ({
  decrypt: jest.fn().mockReturnValue({ apiKey: 'test-key', apiSecret: 'test-secret' }),
});

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('ExecutionService — Sprint 32 Idempotency', () => {
  let service: ExecutionService;
  let tradeRepo: Record<string, jest.Mock>;
  let sessionRepo: Record<string, jest.Mock>;
  let mockAdapterInstance: ReturnType<typeof mockAdapter>;
  let auditService: { log: jest.Mock };

  beforeEach(async () => {
    mockAdapterInstance = mockAdapter();
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExecutionService,
        { provide: getRepositoryToken(Trade), useValue: tradeRepo },
        { provide: getRepositoryToken(TradingSession), useValue: sessionRepo },
        { provide: BrokerService, useValue: {} },
        {
          provide: BrokerAdapterRegistry,
          useValue: { getAdapter: jest.fn().mockReturnValue(mockAdapterInstance) },
        },
        { provide: CredentialEncryptionService, useValue: mockEncryptionService() },
        { provide: AuditService, useValue: auditService },
        {
          provide: DataSource,
          useValue: {
            query: jest.fn().mockResolvedValue([{ total: '0' }]),
            // Sprint 32 Gate 2: mock transaction for reserveDailyTradeSlot
            transaction: jest
              .fn()
              .mockImplementation(
                async (cb: (manager: { query: jest.Mock }) => Promise<unknown>) => {
                  const mockManager = {
                    query: jest.fn().mockImplementation((sql: string) => {
                      if (sql.includes('pg_advisory_xact_lock')) return Promise.resolve([]);
                      if (sql.includes('COUNT(*)')) return Promise.resolve([{ count: '0' }]);
                      return Promise.resolve([]);
                    }),
                  };
                  return cb(mockManager);
                },
              ),
          },
        },
        { provide: DomainEventBus, useValue: { publish: jest.fn() } },
        { provide: Logger, useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    service = module.get(ExecutionService);

    // Mock brokerService.findActiveConnectionForUser
    (service as unknown as { brokerService: Record<string, jest.Mock> }).brokerService = {
      findActiveConnectionForUser: jest.fn().mockResolvedValue({
        id: 'conn-1',
        brokerId: 'paper-broker',
        accountType: BrokerMode.DEMO,
        encryptedCredentials: 'enc',
        credentialIv: 'iv',
        credentialTag: 'tag',
        encryptionKeyId: 'key-1',
      }),
    };
  });

  // ── Duplicate sequential intent ─────────────────────────────────────────────

  it('returns existing trade when the same signal is submitted twice (sequential)', async () => {
    const existingTrade = { id: 'trade-existing', status: TradeStatus.OPEN };

    // Second call: save rejects with unique violation, findOne returns existing
    const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
    tradeRepo.save.mockRejectedValueOnce(uniqueViolation);
    tradeRepo.findOne.mockResolvedValue(existingTrade);

    const result = await service.executeTrade('user-1', approvedDecision());

    expect(result).toEqual(existingTrade);
    expect(mockAdapterInstance.placeOrder).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TRADE_DUPLICATE_SUPPRESSED',
        severity: AuditSeverity.WARNING,
      }),
    );
  });

  // ── Non-unique-constraint error surfaces ───────────────────────────────────

  it('re-throws non-unique-constraint DB errors (does not mask as duplicate)', async () => {
    const otherError = new Error('connection refused');
    tradeRepo.save.mockRejectedValueOnce(otherError);

    await expect(service.executeTrade('user-1', approvedDecision())).rejects.toThrow(
      'connection refused',
    );
    expect(mockAdapterInstance.placeOrder).not.toHaveBeenCalled();
  });

  // ── Successful execution cannot duplicate ──────────────────────────────────

  it('does not call broker placeOrder twice for the same signalId', async () => {
    // First call succeeds
    await service.executeTrade('user-1', approvedDecision());
    expect(mockAdapterInstance.placeOrder).toHaveBeenCalledTimes(1);

    // Second call with same signal → unique violation → existing trade returned
    const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
    tradeRepo.save.mockRejectedValueOnce(uniqueViolation);
    tradeRepo.findOne.mockResolvedValue({ id: 'trade-1', status: TradeStatus.OPEN });

    await service.executeTrade('user-1', approvedDecision());
    // placeOrder still only called once (the second call returned the existing trade)
    expect(mockAdapterInstance.placeOrder).toHaveBeenCalledTimes(1);
  });

  // ── findTradeBySignalId (Risk-layer idempotency helper) ────────────────────

  it('findTradeBySignalId queries by signalId + userId', async () => {
    tradeRepo.findOne.mockResolvedValue({ id: 'trade-1', signalId: 'sig-001' });
    const result = await service.findTradeBySignalId('sig-001', 'user-1');
    expect(result).toEqual({ id: 'trade-1', signalId: 'sig-001' });
    expect(tradeRepo.findOne).toHaveBeenCalledWith({
      where: { signalId: 'sig-001', userId: 'user-1' },
    });
  });

  it('findTradeBySignalId returns null when no trade exists', async () => {
    tradeRepo.findOne.mockResolvedValue(null);
    const result = await service.findTradeBySignalId('sig-999', 'user-1');
    expect(result).toBeNull();
  });

  // ── countTodayTrades (daily-limit helper) ──────────────────────────────────

  it('countTodayTrades returns the count of OPEN+CLOSED trades opened today', async () => {
    const dataSource = (service as unknown as { dataSource: { query: jest.Mock } }).dataSource;
    dataSource.query.mockResolvedValue([{ count: '5' }]);
    const result = await service.countTodayTrades('user-1');
    expect(result).toBe(5);
  });

  it('countTodayTrades returns 0 when no trades today', async () => {
    const dataSource = (service as unknown as { dataSource: { query: jest.Mock } }).dataSource;
    dataSource.query.mockResolvedValue([{ count: '0' }]);
    const result = await service.countTodayTrades('user-1');
    expect(result).toBe(0);
  });
});
