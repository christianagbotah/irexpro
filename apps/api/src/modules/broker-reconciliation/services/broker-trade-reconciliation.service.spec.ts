import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { BrokerTradeReconciliationService } from './broker-trade-reconciliation.service';
import { ClosedTradeNormalizerService } from './closed-trade-normalizer.service';
import {
  BrokerTradeReconciliationRun,
  ReconciliationRunStatus,
} from '../entities/broker-trade-reconciliation-run.entity';
import { BrokerReconciledTrade, TradeSourceType } from '../entities/broker-reconciled-trade.entity';
import {
  PerformanceFeeLedgerEntry,
  LedgerEntryType,
} from '../../performance-fees/entities/performance-fee-ledger-entry.entity';
import {
  PerformanceFeePolicy,
  BillingFrequency,
} from '../../performance-fees/entities/performance-fee-policy.entity';
import {
  UserSubscription,
  SubscriptionStatus,
} from '../../subscriptions/entities/user-subscription.entity';
import { BrokerService } from '../../broker/broker.service';
import {
  BrokerMode,
  BrokerConnectionStatus,
} from '../../broker/interfaces/broker-adapter.interface';
import { AuditService } from '../../audit/audit.service';
import { BrokerConnection } from '../../broker/entities/broker-connection.entity';

// ── Mock factories ─────────────────────────────────────────────────────────────

function makeLiveConnection(overrides: Partial<BrokerConnection> = {}): BrokerConnection {
  return {
    id: 'conn-1',
    userId: 'user-1',
    brokerId: 'metatrader5',
    brokerName: 'MetaTrader 5',
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
    ...overrides,
  } as BrokerConnection;
}

function makeClosedTrade(
  overrides: Partial<{
    externalOrderId: string;
    instrument: string;
    direction: 'BUY' | 'SELL';
    lotSize: string;
    openPrice: string;
    closePrice: string;
    realisedPnl: string;
    openedAt: Date;
    closedAt: Date;
    commission: string;
    swap: string;
    closeReason: string;
    stopLoss: string;
    takeProfit: string;
  }> = {},
) {
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000); // yesterday
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
    openedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    closedAt: past,
    commission: '-2.50',
    swap: '-0.50',
    closeReason: 'TP' as const,
    ...overrides,
  };
}

function makeActiveSubscription(): Partial<UserSubscription> {
  return {
    id: 'sub-1',
    userId: 'user-1',
    subscriptionPlanId: 'plan-1',
    status: SubscriptionStatus.ACTIVE,
  };
}

function makePolicy(): Partial<PerformanceFeePolicy> {
  return {
    id: 'policy-1',
    planId: 'plan-1',
    name: 'Standard 20%',
    feePercent: '20.0000',
    billingFrequency: BillingFrequency.MONTHLY,
    isActive: true,
  } as Partial<PerformanceFeePolicy>;
}

// ── Mock repositories ──────────────────────────────────────────────────────────

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
const mockLedgerRepo = {
  create: jest.fn(),
  save: jest.fn(),
};
const mockPolicyRepo = { findOne: jest.fn() };
const mockSubscriptionRepo = { findOne: jest.fn() };

const mockBrokerService = {
  findConnectionById: jest.fn(),
  getClosedTradesForConnection: jest.fn(),
};
const mockAuditService = { log: jest.fn() };

// ── Helpers ────────────────────────────────────────────────────────────────────

const FROM = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
const TO = new Date(Date.now() - 1000);

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('BrokerTradeReconciliationService', () => {
  let service: BrokerTradeReconciliationService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default mock setup
    const run = { id: 'run-1', status: ReconciliationRunStatus.PENDING };
    mockRunRepo.create.mockReturnValue(run);
    mockRunRepo.save.mockResolvedValue(run);
    mockRunRepo.update.mockResolvedValue(undefined);
    mockRunRepo.findOne.mockResolvedValue({ ...run, status: ReconciliationRunStatus.COMPLETED });

    const reconTrade = { id: 'rtrade-1' };
    mockTradeRepo.create.mockReturnValue(reconTrade);
    mockTradeRepo.save.mockResolvedValue(reconTrade);
    mockTradeRepo.update.mockResolvedValue(undefined);
    // Default: no pre-existing trade row (backfill lookup returns null → treated as duplicate)
    mockTradeRepo.findOne.mockResolvedValue(null);

    const ledger = { id: 'ledger-1' };
    mockLedgerRepo.create.mockReturnValue(ledger);
    mockLedgerRepo.save.mockResolvedValue(ledger);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrokerTradeReconciliationService,
        ClosedTradeNormalizerService,
        { provide: getRepositoryToken(BrokerTradeReconciliationRun), useValue: mockRunRepo },
        { provide: getRepositoryToken(BrokerReconciledTrade), useValue: mockTradeRepo },
        { provide: getRepositoryToken(PerformanceFeeLedgerEntry), useValue: mockLedgerRepo },
        { provide: getRepositoryToken(PerformanceFeePolicy), useValue: mockPolicyRepo },
        { provide: getRepositoryToken(UserSubscription), useValue: mockSubscriptionRepo },
        { provide: BrokerService, useValue: mockBrokerService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<BrokerTradeReconciliationService>(BrokerTradeReconciliationService);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Time range validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('time range validation', () => {
    it('throws if fromTime >= toTime', async () => {
      await expect(
        service.runReconciliation('user-1', 'conn-1', TO, FROM, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws if toTime is in the future', async () => {
      const future = new Date(Date.now() + 10000);
      await expect(
        service.runReconciliation('user-1', 'conn-1', FROM, future, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws if window > 90 days', async () => {
      const from = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000);
      const to = new Date(Date.now() - 1000);
      await expect(
        service.runReconciliation('user-1', 'conn-1', from, to, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Broker connection checks
  // ─────────────────────────────────────────────────────────────────────────────

  describe('broker connection validation', () => {
    it('throws if broker connection is DEMO (not LIVE)', async () => {
      mockBrokerService.findConnectionById.mockResolvedValue(
        makeLiveConnection({ accountType: BrokerMode.DEMO }),
      );
      await expect(
        service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('does not proceed if broker connection belongs to another user (findConnectionById throws)', async () => {
      mockBrokerService.findConnectionById.mockRejectedValue(new ForbiddenException('Not found'));
      await expect(
        service.runReconciliation('user-2', 'conn-1', FROM, TO, 'admin-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Winning trade creates REALISED_TRADE_PROFIT ledger entry
  // ─────────────────────────────────────────────────────────────────────────────

  describe('fee-eligible winning trade', () => {
    beforeEach(() => {
      mockBrokerService.findConnectionById.mockResolvedValue(makeLiveConnection());
      mockBrokerService.getClosedTradesForConnection.mockResolvedValue({
        connection: makeLiveConnection(),
        trades: [makeClosedTrade({ realisedPnl: '100.00', commission: '-2.50', swap: '-0.50' })],
      });
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy());
    });

    it('creates a REALISED_TRADE_PROFIT ledger entry for a winning live trade', async () => {
      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');

      // ledger entry saved with REALISED_TRADE_PROFIT
      expect(mockLedgerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ entryType: LedgerEntryType.REALISED_TRADE_PROFIT }),
      );
      expect(mockLedgerRepo.save).toHaveBeenCalled();
    });

    it('creates a BrokerReconciledTrade record linked to the ledger entry', async () => {
      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');

      expect(mockTradeRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isFeeEligible: true,
          sourceType: TradeSourceType.LIVE_BROKER,
        }),
      );
      // Links ledger entry id back
      expect(mockTradeRepo.update).toHaveBeenCalledWith('rtrade-1', { ledgerEntryId: 'ledger-1' });
    });

    it('stores net realised P&L correctly (no double-subtract commission/swap)', async () => {
      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');

      // gross=10000, commission=-250, swap=-50 → net=9700
      expect(mockLedgerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '9700' }),
      );
    });

    it('ledger entry is visible to PerformanceFeeService (uses same ledger repo)', async () => {
      // Verifies we write to the same PerformanceFeeLedgerEntry repo
      // that calculateAssessment() reads from.
      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');
      // Service calls ledgerRepo.create({...}) then ledgerRepo.save(created) — check create args
      expect(mockLedgerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entryType: LedgerEntryType.REALISED_TRADE_PROFIT,
          userId: 'user-1',
          brokerConnectionId: 'conn-1',
        }),
      );
      expect(mockLedgerRepo.save).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Losing trade creates REALISED_TRADE_LOSS ledger entry
  // ─────────────────────────────────────────────────────────────────────────────

  describe('fee-eligible losing trade', () => {
    beforeEach(() => {
      mockBrokerService.findConnectionById.mockResolvedValue(makeLiveConnection());
      mockBrokerService.getClosedTradesForConnection.mockResolvedValue({
        connection: makeLiveConnection(),
        trades: [makeClosedTrade({ realisedPnl: '-100.00', commission: '-2.50', swap: '-0.50' })],
      });
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy());
    });

    it('creates a REALISED_TRADE_LOSS ledger entry for a losing live trade', async () => {
      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');

      expect(mockLedgerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ entryType: LedgerEntryType.REALISED_TRADE_LOSS }),
      );
    });

    it('stores negative amount for loss', async () => {
      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');

      // gross=-10000, commission=-250, swap=-50 → net=-10300
      expect(mockLedgerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '-10300' }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Zero P&L trade
  // ─────────────────────────────────────────────────────────────────────────────

  describe('zero P&L trade', () => {
    beforeEach(() => {
      mockBrokerService.findConnectionById.mockResolvedValue(makeLiveConnection());
      mockBrokerService.getClosedTradesForConnection.mockResolvedValue({
        connection: makeLiveConnection(),
        trades: [makeClosedTrade({ realisedPnl: '0.00', commission: '0', swap: '0' })],
      });
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy());
    });

    it('creates a reconciled trade record but no ledger entry for zero P&L', async () => {
      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');

      expect(mockTradeRepo.save).toHaveBeenCalled();
      expect(mockLedgerRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Duplicate brokerTradeId
  // ─────────────────────────────────────────────────────────────────────────────

  describe('duplicate trade deduplication', () => {
    beforeEach(() => {
      mockBrokerService.findConnectionById.mockResolvedValue(makeLiveConnection());
      mockBrokerService.getClosedTradesForConnection.mockResolvedValue({
        connection: makeLiveConnection(),
        trades: [makeClosedTrade()],
      });
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy());
    });

    it('skips duplicate brokerTradeId (unique constraint violation → idempotent)', async () => {
      const dupError = new QueryFailedError('', [], new Error('unique violation'));
      (dupError as unknown as { code: string }).code = '23505';
      mockTradeRepo.save.mockRejectedValue(dupError);

      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');

      // No ledger entry created for duplicate
      expect(mockLedgerRepo.save).not.toHaveBeenCalled();
      // Run should be updated with duplicate count
      expect(mockRunRepo.update).toHaveBeenCalledWith(
        'run-1',
        expect.objectContaining({ duplicateTradesSkipped: 1 }),
      );
    });

    it('reruns same time range are idempotent — no new entries', async () => {
      const dupError = new QueryFailedError('', [], new Error('unique violation'));
      (dupError as unknown as { code: string }).code = '23505';
      mockTradeRepo.save.mockRejectedValue(dupError);

      // Run twice
      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');
      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');

      // No ledger entries created across both runs
      expect(mockLedgerRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Normalizer: invalid trades skipped
  // ─────────────────────────────────────────────────────────────────────────────

  describe('normalizer — invalid trades skipped', () => {
    beforeEach(() => {
      mockBrokerService.findConnectionById.mockResolvedValue(makeLiveConnection());
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy());
    });

    it('skips trade with missing brokerTradeId (externalOrderId)', async () => {
      mockBrokerService.getClosedTradesForConnection.mockResolvedValue({
        connection: makeLiveConnection(),
        trades: [makeClosedTrade({ externalOrderId: '' })],
      });
      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');
      expect(mockTradeRepo.save).not.toHaveBeenCalled();
      expect(mockLedgerRepo.save).not.toHaveBeenCalled();
    });

    it('skips trade with future closedAt', async () => {
      const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      mockBrokerService.getClosedTradesForConnection.mockResolvedValue({
        connection: makeLiveConnection(),
        trades: [makeClosedTrade({ closedAt: futureDate })],
      });
      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');
      expect(mockTradeRepo.save).not.toHaveBeenCalled();
    });

    it('skips open trade (closedAt is null/missing)', async () => {
      mockBrokerService.getClosedTradesForConnection.mockResolvedValue({
        connection: makeLiveConnection(),
        trades: [makeClosedTrade({ closedAt: undefined as unknown as Date })],
      });
      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');
      expect(mockTradeRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Fee eligibility — no active subscription
  // ─────────────────────────────────────────────────────────────────────────────

  describe('fee eligibility — no active subscription', () => {
    it('creates reconciled trade but not fee-eligible when no active subscription', async () => {
      mockBrokerService.findConnectionById.mockResolvedValue(makeLiveConnection());
      mockBrokerService.getClosedTradesForConnection.mockResolvedValue({
        connection: makeLiveConnection(),
        trades: [makeClosedTrade({ realisedPnl: '100.00' })],
      });
      mockSubscriptionRepo.findOne.mockResolvedValue(null);
      mockPolicyRepo.findOne.mockResolvedValue(null);

      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');

      expect(mockTradeRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ isFeeEligible: false }),
      );
      expect(mockLedgerRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Fee eligibility — no performance fee policy
  // ─────────────────────────────────────────────────────────────────────────────

  describe('fee eligibility — no performance fee policy', () => {
    it('creates reconciled trade but no ledger entry when subscription has no perf fee policy', async () => {
      mockBrokerService.findConnectionById.mockResolvedValue(makeLiveConnection());
      mockBrokerService.getClosedTradesForConnection.mockResolvedValue({
        connection: makeLiveConnection(),
        trades: [makeClosedTrade({ realisedPnl: '100.00' })],
      });
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(null); // no policy for plan

      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');

      expect(mockTradeRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ isFeeEligible: false }),
      );
      expect(mockLedgerRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Adapter failure → FAILED run
  // ─────────────────────────────────────────────────────────────────────────────

  describe('adapter failure', () => {
    it('marks run as FAILED when broker adapter throws', async () => {
      mockBrokerService.findConnectionById.mockResolvedValue(makeLiveConnection());
      mockBrokerService.getClosedTradesForConnection.mockRejectedValue(
        new Error('Adapter timeout'),
      );

      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');

      expect(mockRunRepo.update).toHaveBeenCalledWith(
        'run-1',
        expect.objectContaining({ status: ReconciliationRunStatus.FAILED }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Partial failure → COMPLETED_WITH_WARNINGS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('partial failure', () => {
    it('marks run as COMPLETED_WITH_WARNINGS when some trades fail to persist', async () => {
      const goodTrade = makeClosedTrade({ externalOrderId: 'trade-001', realisedPnl: '100.00' });
      const badTrade = makeClosedTrade({ externalOrderId: 'trade-002', realisedPnl: '50.00' });

      mockBrokerService.findConnectionById.mockResolvedValue(makeLiveConnection());
      mockBrokerService.getClosedTradesForConnection.mockResolvedValue({
        connection: makeLiveConnection(),
        trades: [goodTrade, badTrade],
      });
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy());

      // First call (goodTrade) succeeds, second call (badTrade) throws
      mockTradeRepo.save
        .mockResolvedValueOnce({ id: 'rtrade-1' })
        .mockRejectedValueOnce(new Error('DB error'));

      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');

      expect(mockRunRepo.update).toHaveBeenCalledWith(
        'run-1',
        expect.objectContaining({
          status: ReconciliationRunStatus.COMPLETED_WITH_WARNINGS,
          failedTrades: 1,
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Demo/paper/backtest not fee-eligible
  // ─────────────────────────────────────────────────────────────────────────────

  describe('demo/paper/backtest exclusion', () => {
    it('rejects reconciliation for a DEMO broker connection', async () => {
      mockBrokerService.findConnectionById.mockResolvedValue(
        makeLiveConnection({ accountType: BrokerMode.DEMO }),
      );
      await expect(
        service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Cross-broker isolation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('cross-broker isolation', () => {
    it('one broker connection trades do not affect another broker connection ledger', async () => {
      const conn1 = makeLiveConnection({ id: 'conn-1' });
      const conn2 = makeLiveConnection({ id: 'conn-2' });

      mockBrokerService.findConnectionById
        .mockResolvedValueOnce(conn1)
        .mockResolvedValueOnce(conn2);

      mockBrokerService.getClosedTradesForConnection
        .mockResolvedValueOnce({
          connection: conn1,
          trades: [makeClosedTrade({ externalOrderId: 't-1' })],
        })
        .mockResolvedValueOnce({
          connection: conn2,
          trades: [makeClosedTrade({ externalOrderId: 't-2' })],
        });

      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy());

      mockTradeRepo.save
        .mockResolvedValueOnce({ id: 'rtrade-1' })
        .mockResolvedValueOnce({ id: 'rtrade-2' });

      mockLedgerRepo.save
        .mockResolvedValueOnce({ id: 'ledger-1' })
        .mockResolvedValueOnce({ id: 'ledger-2' });

      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');
      await service.runReconciliation('user-1', 'conn-2', FROM, TO, 'admin-1');

      // Each save call should have correct brokerConnectionId scoped
      const createCalls = mockTradeRepo.create.mock.calls;
      expect(createCalls[0][0].brokerConnectionId).toBe('conn-1');
      expect(createCalls[1][0].brokerConnectionId).toBe('conn-2');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // No secrets in audit/responses
  // ─────────────────────────────────────────────────────────────────────────────

  describe('security — no secrets in audit metadata', () => {
    it('audit log never contains encrypted credentials, API keys, or passwords', async () => {
      mockBrokerService.findConnectionById.mockResolvedValue(makeLiveConnection());
      mockBrokerService.getClosedTradesForConnection.mockResolvedValue({
        connection: makeLiveConnection(),
        trades: [makeClosedTrade()],
      });
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy());

      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');

      for (const call of mockAuditService.log.mock.calls) {
        const meta = JSON.stringify(call[0]?.metadata ?? {});
        expect(meta).not.toMatch(/apiKey/i);
        expect(meta).not.toMatch(/apiSecret/i);
        expect(meta).not.toMatch(/password/i);
        expect(meta).not.toMatch(/encryptedCredentials/i);
        expect(meta).not.toMatch(/credentialIv/i);
        expect(meta).not.toMatch(/credentialTag/i);
        expect(meta).not.toMatch(/serverUrl/i);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // getRuns / getReconciledTrades
  // ─────────────────────────────────────────────────────────────────────────────

  describe('getRuns and getReconciledTrades', () => {
    it('returns runs filtered by userId', async () => {
      mockRunRepo.find.mockResolvedValue([{ id: 'run-1', userId: 'user-1' }]);
      const result = await service.getRuns('user-1');
      expect(mockRunRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
      expect(result).toHaveLength(1);
    });

    it('returns all runs when no userId filter', async () => {
      mockRunRepo.find.mockResolvedValue([]);
      await service.getRuns();
      expect(mockRunRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });

    it('returns reconciled trades filtered by userId and brokerConnectionId', async () => {
      mockTradeRepo.find.mockResolvedValue([]);
      await service.getReconciledTrades('user-1', 'conn-1');
      expect(mockTradeRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', brokerConnectionId: 'conn-1' },
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // No auto-charge / no assessment creation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('safety: no auto-charge or auto-assessment', () => {
    it('does not create any performance fee assessment or invoice', async () => {
      mockBrokerService.findConnectionById.mockResolvedValue(makeLiveConnection());
      mockBrokerService.getClosedTradesForConnection.mockResolvedValue({
        connection: makeLiveConnection(),
        trades: [makeClosedTrade({ realisedPnl: '100.00' })],
      });
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy());

      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');

      // No invoice or assessment repos exist in this service — verify no unexpected save calls
      // The service only uses: runRepo, tradeRepo, ledgerRepo, policyRepo, subscriptionRepo
      // No assessmentRepo or invoiceRepo injected at all
      // Service calls ledgerRepo.create({...}) then ledgerRepo.save(created) — check create args
      expect(mockLedgerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ entryType: LedgerEntryType.REALISED_TRADE_PROFIT }),
      );
      expect(mockLedgerRepo.save).toHaveBeenCalled();
      // Ensure audit log doesn't contain any invoice or assessment creation actions
      const auditActions = mockAuditService.log.mock.calls.map(
        (c: unknown[]) => (c[0] as { action: string }).action,
      );
      expect(auditActions).not.toContain('PERFORMANCE_FEE_ASSESSMENT_CALCULATED');
      expect(auditActions).not.toContain('PERFORMANCE_FEE_ASSESSMENT_INVOICED');
    });

    it('duplicate reconciliation run does not double-count fee basis', async () => {
      mockBrokerService.findConnectionById.mockResolvedValue(makeLiveConnection());
      mockBrokerService.getClosedTradesForConnection.mockResolvedValue({
        connection: makeLiveConnection(),
        trades: [makeClosedTrade()],
      });
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy());

      // First run succeeds
      mockTradeRepo.save.mockResolvedValueOnce({ id: 'rtrade-1' });

      // Second run hits unique constraint
      const dupError = new QueryFailedError('', [], new Error('unique violation'));
      (dupError as unknown as { code: string }).code = '23505';
      mockTradeRepo.save.mockRejectedValueOnce(dupError);

      mockLedgerRepo.save.mockResolvedValue({ id: 'ledger-1' });

      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');
      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');

      // Ledger save called only once (first run), not twice
      expect(mockLedgerRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Currency minor-unit safety
  // ─────────────────────────────────────────────────────────────────────────────

  describe('currency minor-unit safety', () => {
    it('aborts (BadRequest) for a broker connection with an unsupported currency', async () => {
      mockBrokerService.findConnectionById.mockResolvedValue(
        makeLiveConnection({ accountCurrency: 'XYZ' }),
      );
      await expect(
        service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
      // No run should have been created or trades fetched
      expect(mockBrokerService.getClosedTradesForConnection).not.toHaveBeenCalled();
    });

    it('uses JPY 0-decimal exponent — net P&L not inflated 100x', async () => {
      mockBrokerService.findConnectionById.mockResolvedValue(
        makeLiveConnection({ accountCurrency: 'JPY' }),
      );
      mockBrokerService.getClosedTradesForConnection.mockResolvedValue({
        connection: makeLiveConnection({ accountCurrency: 'JPY' }),
        trades: [makeClosedTrade({ realisedPnl: '1000', commission: '0', swap: '0' })],
      });
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy());

      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');

      // ¥1000 → 1000 minor units (NOT 100000) and currency tagged JPY
      expect(mockLedgerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '1000', currency: 'JPY' }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Self-healing ledger backfill (partial-failure gap)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('self-healing ledger backfill', () => {
    it('backfills a missing ledger entry when a prior run saved the trade but not the ledger', async () => {
      mockBrokerService.findConnectionById.mockResolvedValue(makeLiveConnection());
      mockBrokerService.getClosedTradesForConnection.mockResolvedValue({
        connection: makeLiveConnection(),
        trades: [makeClosedTrade({ realisedPnl: '100.00', commission: '-2.50', swap: '-0.50' })],
      });
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy());

      // Simulate: trade row already exists (unique violation) ...
      const dupError = new QueryFailedError('', [], new Error('unique violation'));
      (dupError as unknown as { code: string }).code = '23505';
      mockTradeRepo.save.mockRejectedValueOnce(dupError);

      // ... and that existing row is fee-eligible, non-zero, with NO ledger entry yet
      mockTradeRepo.findOne.mockResolvedValueOnce({
        id: 'rtrade-existing',
        userId: 'user-1',
        brokerConnectionId: 'conn-1',
        brokerTradeId: 'trade-001',
        instrument: 'EURUSD',
        direction: 'BUY',
        netRealisedPnl: '9700',
        closedAt: new Date(),
        isFeeEligible: true,
        ledgerEntryId: null,
      });

      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');

      // Backfill creates the missing ledger entry and links it
      expect(mockLedgerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: '9700',
          entryType: LedgerEntryType.REALISED_TRADE_PROFIT,
        }),
      );
      expect(mockTradeRepo.update).toHaveBeenCalledWith('rtrade-existing', {
        ledgerEntryId: 'ledger-1',
      });
    });

    it('does NOT backfill when the existing trade already has a ledger entry (genuine duplicate)', async () => {
      mockBrokerService.findConnectionById.mockResolvedValue(makeLiveConnection());
      mockBrokerService.getClosedTradesForConnection.mockResolvedValue({
        connection: makeLiveConnection(),
        trades: [makeClosedTrade({ realisedPnl: '100.00' })],
      });
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy());

      const dupError = new QueryFailedError('', [], new Error('unique violation'));
      (dupError as unknown as { code: string }).code = '23505';
      mockTradeRepo.save.mockRejectedValueOnce(dupError);

      mockTradeRepo.findOne.mockResolvedValueOnce({
        id: 'rtrade-existing',
        netRealisedPnl: '9700',
        isFeeEligible: true,
        ledgerEntryId: 'ledger-already-there', // already linked
      });

      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');

      // No new ledger entry created — treated as a duplicate
      expect(mockLedgerRepo.save).not.toHaveBeenCalled();
    });

    it('does NOT backfill a zero-P&L duplicate', async () => {
      mockBrokerService.findConnectionById.mockResolvedValue(makeLiveConnection());
      mockBrokerService.getClosedTradesForConnection.mockResolvedValue({
        connection: makeLiveConnection(),
        trades: [makeClosedTrade({ realisedPnl: '0.00', commission: '0', swap: '0' })],
      });
      mockSubscriptionRepo.findOne.mockResolvedValue(makeActiveSubscription());
      mockPolicyRepo.findOne.mockResolvedValue(makePolicy());

      const dupError = new QueryFailedError('', [], new Error('unique violation'));
      (dupError as unknown as { code: string }).code = '23505';
      mockTradeRepo.save.mockRejectedValueOnce(dupError);

      mockTradeRepo.findOne.mockResolvedValueOnce({
        id: 'rtrade-existing',
        netRealisedPnl: '0',
        isFeeEligible: false,
        ledgerEntryId: null,
      });

      await service.runReconciliation('user-1', 'conn-1', FROM, TO, 'admin-1');

      expect(mockLedgerRepo.save).not.toHaveBeenCalled();
    });
  });
});

// ── ClosedTradeNormalizerService unit tests ────────────────────────────────────

import {
  ClosedTradeNormalizerService as NormSvc,
  majorToMinorUnits,
} from './closed-trade-normalizer.service';

describe('ClosedTradeNormalizerService', () => {
  let svc: NormSvc;

  beforeEach(() => {
    svc = new NormSvc();
  });

  describe('majorToMinorUnits', () => {
    it('converts 100.00 → 10000 (2dp default)', () =>
      expect(majorToMinorUnits('100.00')).toBe('10000'));
    it('converts -2.50 → -250', () => expect(majorToMinorUnits('-2.50')).toBe('-250'));
    it('converts 0.00 → 0', () => expect(majorToMinorUnits('0.00')).toBe('0'));
    it('converts 1000 → 100000 (no decimal)', () =>
      expect(majorToMinorUnits('1000')).toBe('100000'));
    it('converts -0.01 → -1', () => expect(majorToMinorUnits('-0.01')).toBe('-1'));
    it('returns null for empty string (invalid)', () => expect(majorToMinorUnits('')).toBeNull());
    it('returns null for non-numeric input', () => expect(majorToMinorUnits('abc')).toBeNull());
    it('truncates extra decimals toward zero', () =>
      expect(majorToMinorUnits('1.119')).toBe('111'));

    // Currency exponent handling
    it('JPY (0 digits): 1000 → 1000', () => expect(majorToMinorUnits('1000', 0)).toBe('1000'));
    it('JPY (0 digits): 1000.50 → 1000 (drops sub-unit)', () =>
      expect(majorToMinorUnits('1000.50', 0)).toBe('1000'));
    it('JPY (0 digits): -250 → -250', () => expect(majorToMinorUnits('-250', 0)).toBe('-250'));
    it('KWD (3 digits): 1.234 → 1234', () => expect(majorToMinorUnits('1.234', 3)).toBe('1234'));
    it('KWD (3 digits): 1.2 → 1200', () => expect(majorToMinorUnits('1.2', 3)).toBe('1200'));
  });

  describe('normalize — skip rules', () => {
    const now = new Date();

    it('skips trade with empty externalOrderId', () => {
      const { valid, skipped } = svc.normalize(
        [{ ...makeClosedTrade(), externalOrderId: '' } as any],
        'mt5',
        'USD',
        now,
      );
      expect(valid).toHaveLength(0);
      expect(skipped[0].reason).toMatch(/brokerTradeId/);
    });

    it('skips trade with future closedAt', () => {
      const future = new Date(now.getTime() + 3600_000);
      const { valid, skipped } = svc.normalize(
        [{ ...makeClosedTrade(), closedAt: future } as any],
        'mt5',
        'USD',
        now,
      );
      expect(valid).toHaveLength(0);
      expect(skipped[0].reason).toMatch(/future/);
    });

    it('skips trade with null closedAt', () => {
      const { valid } = svc.normalize(
        [{ ...makeClosedTrade(), closedAt: null as unknown as Date } as any],
        'mt5',
        'USD',
        now,
      );
      expect(valid).toHaveLength(0);
    });

    it('passes valid trade through normalization', () => {
      const past = new Date(now.getTime() - 3600_000);
      const { valid } = svc.normalize(
        [makeClosedTrade({ closedAt: past }) as any],
        'mt5',
        'USD',
        now,
      );
      expect(valid).toHaveLength(1);
      expect(valid[0].brokerTradeId).toBe('trade-001');
      expect(valid[0].currency).toBe('USD');
    });

    it('computes netRealisedPnl without double-subtracting commission/swap', () => {
      const past = new Date(now.getTime() - 3600_000);
      const { valid } = svc.normalize(
        [
          makeClosedTrade({
            closedAt: past,
            realisedPnl: '100.00',
            commission: '-2.50',
            swap: '-0.50',
          }) as any,
        ],
        'mt5',
        'USD',
        now,
      );
      // gross=10000 + commission=-250 + swap=-50 = net=9700
      expect(valid[0].netRealisedPnl).toBe('9700');
      expect(valid[0].grossRealisedPnl).toBe('10000');
    });

    it('uses JPY 0-decimal exponent for a JPY account', () => {
      const past = new Date(now.getTime() - 3600_000);
      const { valid } = svc.normalize(
        [
          makeClosedTrade({
            closedAt: past,
            realisedPnl: '1000',
            commission: '0',
            swap: '0',
          }) as any,
        ],
        'mt5',
        'JPY',
        now,
      );
      // JPY has no minor subunit: 1000 yen → 1000 minor units (NOT 100000)
      expect(valid[0].netRealisedPnl).toBe('1000');
      expect(valid[0].currency).toBe('JPY');
    });

    it('does NOT include API keys or serverUrl in rawMetadataSummary', () => {
      const past = new Date(now.getTime() - 3600_000);
      const { valid } = svc.normalize(
        [makeClosedTrade({ closedAt: past }) as any],
        'mt5',
        'USD',
        now,
      );
      const meta = JSON.stringify(valid[0].rawMetadataSummary);
      expect(meta).not.toMatch(/apiKey/i);
      expect(meta).not.toMatch(/password/i);
      expect(meta).not.toMatch(/serverUrl/i);
    });
  });
});
