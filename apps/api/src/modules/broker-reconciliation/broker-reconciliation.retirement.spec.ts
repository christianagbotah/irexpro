import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { BrokerTradeReconciliationService } from './services/broker-trade-reconciliation.service';
import { ClosedTradeNormalizerService } from './services/closed-trade-normalizer.service';
import {
  BrokerTradeReconciliationRun,
  ReconciliationRunStatus,
} from './entities/broker-trade-reconciliation-run.entity';
import { BrokerReconciledTrade } from './entities/broker-reconciled-trade.entity';
import {
  PerformanceFeeLedgerEntry,
  LedgerEntryType,
} from '../performance-fees/entities/performance-fee-ledger-entry.entity';
import { BrokerService } from '../broker/broker.service';
import { BrokerMode, BrokerConnectionStatus } from '../broker/interfaces/broker-adapter.interface';
import { AuditService } from '../audit/audit.service';
import { BrokerConnection } from '../broker/entities/broker-connection.entity';

function makeLiveConnection(o: Partial<BrokerConnection> = {}): BrokerConnection {
  return {
    id: 'conn-1',
    userId: 'user-1',
    brokerId: 'metatrader5',
    brokerName: 'MT5',
    displayName: 'MT5 Live',
    accountId: '12345',
    accountType: BrokerMode.LIVE,
    accountCurrency: 'USD',
    accountLeverage: null,
    status: BrokerConnectionStatus.CONNECTED,
    encryptedCredentials: 'enc',
    credentialIv: 'iv',
    credentialTag: 'tag',
    encryptionKeyId: 'key-v1',
    lastHealthCheckAt: null,
    lastSyncAt: null,
    consecutiveFailureCount: 0,
    lastErrorMessage: null,
    demoValidated: true,
    liveTradingEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...o,
  } as BrokerConnection;
}
function makeClosedTrade(
  o: Partial<{
    externalOrderId: string;
    realisedPnl: string;
    commission: string;
    swap: string;
  }> = {},
) {
  return {
    externalOrderId: 'trade-001',
    instrument: 'EURUSD',
    direction: 'BUY' as const,
    lotSize: '1.00',
    openPrice: '1.10000',
    closePrice: '1.11000',
    stopLoss: '1.09000',
    takeProfit: '1.12000',
    realisedPnl: '100.00',
    openedAt: new Date(Date.now() - 172800000),
    closedAt: new Date(Date.now() - 86400000),
    commission: '-2.50',
    swap: '-0.50',
    closeReason: 'TP' as const,
    ...o,
  };
}
const mockRunRepo = {
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
};
const mockTradeRepo = {
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
};
const mockLedgerRepo = { create: jest.fn(), save: jest.fn(), find: jest.fn(), findOne: jest.fn() };
const mockBrokerService = {
  findConnectionById: jest.fn(),
  getClosedTradesForConnection: jest.fn(),
};
const mockAuditService = { log: jest.fn() };
function makeMockEntityManager(): EntityManager {
  const tx = {
    getRepository: jest.fn((e: unknown) => {
      if (e === BrokerReconciledTrade) return mockTradeRepo;
      if (e === PerformanceFeeLedgerEntry) return mockLedgerRepo;
      if (e === BrokerTradeReconciliationRun) return mockRunRepo;
      throw new Error('unexpected');
    }),
    query: jest.fn().mockResolvedValue([{}]),
  };
  return tx as unknown as EntityManager;
}
const mockDataSource = {
  transaction: jest.fn(async (cb: (tx: EntityManager) => Promise<unknown>) =>
    cb(makeMockEntityManager()),
  ),
  query: jest.fn(),
};
const FROM = new Date(Date.now() - 604800000);
const TO = new Date(Date.now() - 1000);

describe('BrokerTradeReconciliationService — GATE-3 proofs', () => {
  let service: BrokerTradeReconciliationService;
  beforeEach(async () => {
    jest.clearAllMocks();
    const run = { id: 'run-1', status: ReconciliationRunStatus.PENDING };
    mockRunRepo.create.mockReturnValue(run);
    mockRunRepo.save.mockResolvedValue(run);
    mockRunRepo.update.mockResolvedValue(undefined);
    mockRunRepo.findOne.mockResolvedValue({ ...run, status: ReconciliationRunStatus.COMPLETED });
    mockTradeRepo.create.mockReturnValue({ id: 'rtrade-1' });
    mockTradeRepo.save.mockResolvedValue({ id: 'rtrade-1' });
    mockTradeRepo.update.mockResolvedValue(undefined);
    mockTradeRepo.findOne.mockResolvedValue(null);
    mockLedgerRepo.create.mockReturnValue({ id: 'ledger-1' });
    mockLedgerRepo.save.mockResolvedValue({ id: 'ledger-1' });
    mockLedgerRepo.find.mockResolvedValue([]);
    mockLedgerRepo.findOne.mockResolvedValue(null);
    mockDataSource.transaction.mockClear();
    mockDataSource.transaction.mockImplementation(
      async (cb: (tx: EntityManager) => Promise<unknown>) => cb(makeMockEntityManager()),
    );
    const module = await Test.createTestingModule({
      providers: [
        BrokerTradeReconciliationService,
        ClosedTradeNormalizerService,
        { provide: getRepositoryToken(BrokerTradeReconciliationRun), useValue: mockRunRepo },
        { provide: getRepositoryToken(BrokerReconciledTrade), useValue: mockTradeRepo },
        { provide: getRepositoryToken(PerformanceFeeLedgerEntry), useValue: mockLedgerRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: BrokerService, useValue: mockBrokerService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();
    service = module.get(BrokerTradeReconciliationService);
  });
  function setup(t: Partial<{ realisedPnl: string; commission: string; swap: string }> = {}) {
    const c = makeLiveConnection();
    mockBrokerService.findConnectionById.mockResolvedValue(c);
    mockBrokerService.getClosedTradesForConnection.mockResolvedValue({
      connection: c,
      trades: [makeClosedTrade(t)],
    });
  }

  it('1. LIVE profit → trade + PROFIT ledger', async () => {
    setup({ realisedPnl: '100.00', commission: '-2.50', swap: '-0.50' });
    await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');
    expect(mockLedgerRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        entryType: LedgerEntryType.REALISED_TRADE_PROFIT,
        amount: '9700',
        currency: 'USD',
      }),
    );
  });
  it('2. LIVE loss → LOSS ledger', async () => {
    setup({ realisedPnl: '-100.00', commission: '-2.50', swap: '-0.50' });
    await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');
    expect(mockLedgerRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ entryType: LedgerEntryType.REALISED_TRADE_LOSS, amount: '-10300' }),
    );
  });
  it('3. multi-policy → still recorded', async () => {
    setup({ realisedPnl: '250.00', commission: '0', swap: '0' });
    await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');
    expect(mockLedgerRepo.save).toHaveBeenCalled();
  });
  it('4. DEMO → rejected', async () => {
    mockBrokerService.findConnectionById.mockResolvedValue(
      makeLiveConnection({ accountType: BrokerMode.DEMO }),
    );
    mockBrokerService.getClosedTradesForConnection.mockResolvedValue({
      connection: makeLiveConnection(),
      trades: [makeClosedTrade()],
    });
    await expect(
      service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1'),
    ).rejects.toThrow(BadRequestException);
    expect(mockLedgerRepo.save).not.toHaveBeenCalled();
  });
  it('5. zero P&L → trade saved, no ledger', async () => {
    setup({ realisedPnl: '0.00', commission: '0', swap: '0' });
    await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');
    expect(mockTradeRepo.save).toHaveBeenCalled();
    expect(mockLedgerRepo.create).not.toHaveBeenCalled();
  });
  it('6. duplicate (linked) → no new ledger', async () => {
    setup({ realisedPnl: '100.00' });
    mockTradeRepo.findOne.mockReset();
    mockTradeRepo.findOne.mockResolvedValue({
      id: 'rtrade-existing',
      userId: 'user-1',
      brokerConnectionId: 'conn-1',
      brokerTradeId: 'trade-001',
      netRealisedPnl: '9700',
      currency: 'USD',
      isFeeEligible: true,
      ledgerEntryId: 'ledger-already-there',
    });
    await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');
    expect(mockLedgerRepo.save).not.toHaveBeenCalled();
  });
  it('7. existing trade, missing ledger → backfill', async () => {
    setup({ realisedPnl: '100.00', commission: '-2.50', swap: '-0.50' });
    mockTradeRepo.findOne.mockReset();
    mockTradeRepo.findOne.mockResolvedValue({
      id: 'rtrade-existing',
      userId: 'user-1',
      brokerConnectionId: 'conn-1',
      brokerTradeId: 'trade-001',
      instrument: 'EURUSD',
      direction: 'BUY',
      netRealisedPnl: '9700',
      currency: 'USD',
      closedAt: new Date(),
      isFeeEligible: true,
      ledgerEntryId: null,
    });
    mockLedgerRepo.findOne.mockResolvedValue(null);
    await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');
    expect(mockLedgerRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ entryType: LedgerEntryType.REALISED_TRADE_PROFIT, amount: '9700' }),
    );
    expect(mockTradeRepo.update).toHaveBeenCalledWith('rtrade-existing', {
      ledgerEntryId: 'ledger-1',
    });
  });
  it('8. existing trade, ledger exists but link null → link, zero new', async () => {
    setup({ realisedPnl: '100.00' });
    mockTradeRepo.findOne.mockReset();
    mockTradeRepo.findOne.mockResolvedValue({
      id: 'rtrade-existing',
      userId: 'user-1',
      brokerConnectionId: 'conn-1',
      brokerTradeId: 'trade-001',
      instrument: 'EURUSD',
      direction: 'BUY',
      netRealisedPnl: '9700',
      currency: 'USD',
      closedAt: new Date(),
      isFeeEligible: true,
      ledgerEntryId: null,
    });
    mockLedgerRepo.find.mockResolvedValue([
      {
        id: 'ledger-pre',
        userId: 'user-1',
        brokerConnectionId: 'conn-1',
        sourceReference: 'trade-001',
        entryType: LedgerEntryType.REALISED_TRADE_PROFIT,
        amount: '9700',
        currency: 'USD',
      },
    ]);
    await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');
    expect(mockLedgerRepo.create).not.toHaveBeenCalled();
    expect(mockTradeRepo.update).toHaveBeenCalledWith('rtrade-existing', {
      ledgerEntryId: 'ledger-pre',
    });
  });
  it('9. injected ledger failure → COMPLETED_WITH_WARNINGS', async () => {
    setup({ realisedPnl: '100.00' });
    mockLedgerRepo.save.mockRejectedValueOnce(new Error('simulated'));
    await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');
    expect(mockRunRepo.update).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: ReconciliationRunStatus.COMPLETED_WITH_WARNINGS }),
    );
  });
  it('10. ONE transaction per trade', async () => {
    setup({ realisedPnl: '100.00', commission: '-2.50', swap: '-0.50' });
    await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');
    expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
  });

  describe('currency validation (BLOCKER 2)', () => {
    async function runWithCurrency(c: string | null | undefined) {
      mockBrokerService.findConnectionById.mockResolvedValue(
        makeLiveConnection({ accountCurrency: c as string }),
      );
      mockBrokerService.getClosedTradesForConnection.mockResolvedValue({
        connection: makeLiveConnection({ accountCurrency: c as string }),
        trades: [makeClosedTrade()],
      });
      return service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');
    }
    it('C1. null → BadRequest', async () => {
      await expect(runWithCurrency(null)).rejects.toThrow(BadRequestException);
      expect(mockRunRepo.save).not.toHaveBeenCalled();
    });
    it('C2. undefined → BadRequest', async () => {
      await expect(runWithCurrency(undefined)).rejects.toThrow(BadRequestException);
    });
    it('C3. empty → BadRequest', async () => {
      await expect(runWithCurrency('')).rejects.toThrow(BadRequestException);
    });
    it('C4. whitespace → BadRequest', async () => {
      await expect(runWithCurrency('   ')).rejects.toThrow(BadRequestException);
    });
    it('C5. XYZ → BadRequest', async () => {
      await expect(runWithCurrency('XYZ')).rejects.toThrow(BadRequestException);
    });
    it('C6. USD → succeeds', async () => {
      await expect(runWithCurrency('USD')).resolves.toBeDefined();
      expect(mockLedgerRepo.save).toHaveBeenCalled();
    });
    it('C7. jpy → correct 0-decimal', async () => {
      mockBrokerService.findConnectionById.mockResolvedValue(
        makeLiveConnection({ accountCurrency: 'JPY' }),
      );
      mockBrokerService.getClosedTradesForConnection.mockResolvedValue({
        connection: makeLiveConnection({ accountCurrency: 'JPY' }),
        trades: [makeClosedTrade({ realisedPnl: '1000', commission: '0', swap: '0' })],
      });
      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');
      expect(mockLedgerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '1000', currency: 'JPY' }),
      );
    });
  });
});
