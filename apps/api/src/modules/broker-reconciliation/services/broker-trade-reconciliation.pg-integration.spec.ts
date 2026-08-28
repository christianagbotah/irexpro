/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GATE-3 BLOCKER 1 — Real PostgreSQL reconciliation concurrency proof.
 * Excluded from default jest; runs under CI with PG16 via jest-pg.json.
 */
import { DataSource } from 'typeorm';
import { BrokerTradeReconciliationService } from './broker-trade-reconciliation.service';
import { ClosedTradeNormalizerService } from './closed-trade-normalizer.service';
import { BrokerTradeReconciliationRun } from '../entities/broker-trade-reconciliation-run.entity';
import { BrokerReconciledTrade } from '../entities/broker-reconciled-trade.entity';
import { PerformanceFeeLedgerEntry } from '../../performance-fees/entities/performance-fee-ledger-entry.entity';
import { BrokerService } from '../../broker/broker.service';
import {
  BrokerMode,
  BrokerConnectionStatus,
} from '../../broker/interfaces/broker-adapter.interface';
import { AuditService } from '../../audit/audit.service';

describe('BrokerTradeReconciliationService — real PostgreSQL atomicity (GATE-3)', () => {
  let dataSource: DataSource;
  let service: BrokerTradeReconciliationService;
  const userId = '11111111-1111-1111-1111-111111111111';
  const brokerConnectionId = '22222222-2222-2222-2222-222222222222';
  const brokerTradeId = 'trade-gate3-001';
  const mockBrokerService = {
    findConnectionById: jest.fn(),
    getClosedTradesForConnection: jest.fn(),
  };
  const mockAuditService = { log: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USER ?? 'irexpro',
      password: process.env.DB_PASSWORD ?? 'test_password',
      database: process.env.DB_NAME ?? 'irexpro_test',
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();
    await dataSource.query('CREATE SCHEMA IF NOT EXISTS broker_reconciliation');
    await dataSource.query('CREATE SCHEMA IF NOT EXISTS performance_fees');
    await dataSource.query('DROP TABLE IF EXISTS broker_reconciliation.broker_reconciled_trades');
    await dataSource.query('DROP TABLE IF EXISTS performance_fees.performance_fee_ledger_entries');
    await dataSource.query(
      'DROP TABLE IF EXISTS broker_reconciliation.broker_trade_reconciliation_runs',
    );
    await dataSource.query(`CREATE TABLE broker_reconciliation.broker_trade_reconciliation_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL, broker_connection_id UUID NOT NULL,
      status VARCHAR(64) NOT NULL DEFAULT 'PENDING', from_time TIMESTAMPTZ, to_time TIMESTAMPTZ,
      started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, total_broker_trades_seen INT DEFAULT 0,
      new_ledger_entries_created INT DEFAULT 0, duplicate_trades_skipped INT DEFAULT 0, failed_trades INT DEFAULT 0,
      error_summary TEXT NULL, metadata JSONB NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await dataSource.query(`CREATE TABLE broker_reconciliation.broker_reconciled_trades (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL, broker_connection_id UUID NOT NULL,
      broker_provider VARCHAR(50) NOT NULL, broker_trade_id VARCHAR(255) NOT NULL, broker_order_id VARCHAR(255) NULL,
      instrument VARCHAR(50) NOT NULL, direction VARCHAR(4) NOT NULL, volume VARCHAR(50) NOT NULL,
      opened_at TIMESTAMPTZ NULL, closed_at TIMESTAMPTZ NOT NULL, entry_price VARCHAR(50) NULL, exit_price VARCHAR(50) NULL,
      realised_pnl BIGINT NOT NULL, commission BIGINT NOT NULL DEFAULT 0, swap BIGINT NOT NULL DEFAULT 0,
      net_realised_pnl BIGINT NOT NULL, currency VARCHAR(3) NOT NULL, reconciliation_run_id UUID NULL,
      ledger_entry_id UUID NULL, source_type VARCHAR(32) NOT NULL DEFAULT 'LIVE_BROKER',
      is_fee_eligible BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await dataSource.query(
      `CREATE UNIQUE INDEX broker_reconciled_trades_bkey_idx ON broker_reconciliation.broker_reconciled_trades (user_id, broker_connection_id, broker_trade_id)`,
    );
    await dataSource.query(`CREATE TABLE performance_fees.performance_fee_ledger_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL, assessment_id UUID NULL,
      broker_connection_id UUID NULL, entry_type VARCHAR(64) NOT NULL, currency VARCHAR(3) NOT NULL,
      amount BIGINT NOT NULL, source_reference VARCHAR(255) NULL, occurred_at TIMESTAMPTZ NOT NULL,
      metadata JSONB NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    service = new BrokerTradeReconciliationService(
      dataSource.getRepository(BrokerTradeReconciliationRun),
      dataSource.getRepository(BrokerReconciledTrade),
      dataSource.getRepository(PerformanceFeeLedgerEntry),
      dataSource,
      mockBrokerService as unknown as BrokerService,
      new ClosedTradeNormalizerService(),
      mockAuditService as unknown as AuditService,
    );
  });
  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });
  beforeEach(async () => {
    jest.clearAllMocks();
    await dataSource.query('DELETE FROM broker_reconciliation.broker_reconciled_trades');
    await dataSource.query('DELETE FROM performance_fees.performance_fee_ledger_entries');
    await dataSource.query('DELETE FROM broker_reconciliation.broker_trade_reconciliation_runs');
    mockBrokerService.findConnectionById.mockResolvedValue({
      id: brokerConnectionId,
      userId,
      brokerId: 'metatrader5',
      accountType: BrokerMode.LIVE,
      accountCurrency: 'USD',
      status: BrokerConnectionStatus.CONNECTED,
    });
  });
  function setupOneWinningTrade(realisedPnl = '100.00', commission = '-2.50', swap = '-0.50') {
    const past = new Date(Date.now() - 86400000);
    mockBrokerService.getClosedTradesForConnection.mockResolvedValue({
      connection: { accountCurrency: 'USD' },
      trades: [
        {
          externalOrderId: brokerTradeId,
          instrument: 'EURUSD',
          direction: 'BUY',
          lotSize: '1.00',
          openPrice: '1.10000',
          closePrice: '1.11000',
          stopLoss: '1.09000',
          takeProfit: '1.12000',
          realisedPnl,
          openedAt: new Date(Date.now() - 172800000),
          closedAt: past,
          commission,
          swap,
          closeReason: 'TP',
        },
      ],
    });
  }
  async function runOnce() {
    return service.runReconciliation(
      userId,
      brokerConnectionId,
      new Date(Date.now() - 604800000),
      new Date(Date.now() - 1000),
      'admin-1',
    );
  }
  async function counts() {
    const trades = await dataSource.query(
      'SELECT count(*)::int AS n FROM broker_reconciliation.broker_reconciled_trades WHERE user_id = $1 AND broker_connection_id = $2 AND broker_trade_id = $3',
      [userId, brokerConnectionId, brokerTradeId],
    );
    const ledgers = await dataSource.query(
      'SELECT count(*)::int AS n, (array_agg(id))[1] AS id, (array_agg(amount))[1] AS amount, (array_agg(entry_type))[1] AS entry_type FROM performance_fees.performance_fee_ledger_entries WHERE user_id = $1 AND broker_connection_id = $2 AND source_reference = $3',
      [userId, brokerConnectionId, brokerTradeId],
    );
    const link = await dataSource.query(
      'SELECT ledger_entry_id FROM broker_reconciliation.broker_reconciled_trades WHERE user_id = $1 AND broker_connection_id = $2 AND broker_trade_id = $3',
      [userId, brokerConnectionId, brokerTradeId],
    );
    return {
      tradeCount: trades[0].n,
      ledgerCount: ledgers[0].n,
      ledgerId: ledgers[0].id,
      ledgerAmount: ledgers[0].amount,
      ledgerType: ledgers[0].entry_type,
      linkId: link[0]?.ledger_entry_id ?? null,
    };
  }
  it('1. positive P&L → one trade + one PROFIT ledger', async () => {
    setupOneWinningTrade();
    await runOnce();
    const c = await counts();
    expect(c.tradeCount).toBe(1);
    expect(c.ledgerCount).toBe(1);
    expect(c.ledgerAmount).toBe('9700');
    expect(c.ledgerType).toBe('REALISED_TRADE_PROFIT');
    expect(c.linkId).toBe(c.ledgerId);
  });
  it('2. negative P&L → one trade + one LOSS ledger', async () => {
    setupOneWinningTrade('-100.00');
    await runOnce();
    const c = await counts();
    expect(c.tradeCount).toBe(1);
    expect(c.ledgerCount).toBe(1);
    expect(c.ledgerAmount).toBe('-10300');
    expect(c.ledgerType).toBe('REALISED_TRADE_LOSS');
  });
  it('3. zero P&L → one trade + zero ledgers', async () => {
    setupOneWinningTrade('0.00', '0', '0');
    await runOnce();
    const c = await counts();
    expect(c.tradeCount).toBe(1);
    expect(c.ledgerCount).toBe(0);
  });
  it('4. sequential duplicate → still one ledger', async () => {
    setupOneWinningTrade();
    await runOnce();
    await runOnce();
    const c = await counts();
    expect(c.tradeCount).toBe(1);
    expect(c.ledgerCount).toBe(1);
  });
  it('5. legacy partial row, no ledger → backfill', async () => {
    await dataSource.query(
      "INSERT INTO broker_reconciliation.broker_reconciled_trades (user_id, broker_connection_id, broker_provider, broker_trade_id, instrument, direction, volume, closed_at, realised_pnl, commission, swap, net_realised_pnl, currency, source_type, is_fee_eligible, ledger_entry_id) VALUES ($1,$2,'mt5',$3,'EURUSD','BUY','1.00', NOW(), 10000, -250, -50, 9700, 'USD', 'LIVE_BROKER', true, NULL)",
      [userId, brokerConnectionId, brokerTradeId],
    );
    setupOneWinningTrade();
    await runOnce();
    const c = await counts();
    expect(c.tradeCount).toBe(1);
    expect(c.ledgerCount).toBe(1);
    expect(c.linkId).toBe(c.ledgerId);
  });
  it('6. legacy partial row + matching ledger exists → link, zero new', async () => {
    await dataSource.query(
      "INSERT INTO broker_reconciliation.broker_reconciled_trades (user_id, broker_connection_id, broker_provider, broker_trade_id, instrument, direction, volume, closed_at, realised_pnl, commission, swap, net_realised_pnl, currency, source_type, is_fee_eligible, ledger_entry_id) VALUES ($1,$2,'mt5',$3,'EURUSD','BUY','1.00', NOW(), 10000, -250, -50, 9700, 'USD', 'LIVE_BROKER', true, NULL)",
      [userId, brokerConnectionId, brokerTradeId],
    );
    const li = await dataSource.query(
      "INSERT INTO performance_fees.performance_fee_ledger_entries (user_id, broker_connection_id, entry_type, currency, amount, source_reference, occurred_at) VALUES ($1,$2,'REALISED_TRADE_PROFIT','USD',9700,$3, NOW()) RETURNING id",
      [userId, brokerConnectionId, brokerTradeId],
    );
    setupOneWinningTrade();
    await runOnce();
    const c = await counts();
    expect(c.tradeCount).toBe(1);
    expect(c.ledgerCount).toBe(1);
    expect(c.ledgerId).toBe(li[0].id);
    expect(c.linkId).toBe(li[0].id);
  });
  it('7. concurrent same trade → 1 trade, 1 ledger', async () => {
    setupOneWinningTrade();
    const r = await Promise.allSettled([runOnce(), runOnce()]);
    for (const x of r) expect(x.status).toBe('fulfilled');
    const c = await counts();
    expect(c.tradeCount).toBe(1);
    expect(c.ledgerCount).toBe(1);
    expect(c.ledgerAmount).toBe('9700');
    expect(c.linkId).toBe(c.ledgerId);
  });
  it('8. three concurrent runs → 1 ledger', async () => {
    setupOneWinningTrade('250.00', '0', '0');
    const r = await Promise.allSettled([runOnce(), runOnce(), runOnce()]);
    for (const x of r) expect(x.status).toBe('fulfilled');
    const c = await counts();
    expect(c.tradeCount).toBe(1);
    expect(c.ledgerCount).toBe(1);
    expect(c.ledgerAmount).toBe('25000');
  });

  // ── 9. (GATE-3 §12) Rollback: failure after trade persistence, before ledger → no partial state
  it('9. injected failure after trade creation before ledger → transaction rolls back, no partial trade/ledger', async () => {
    setupOneWinningTrade('100.00', '-2.50', '-0.50');
    // Override the service's transaction to inject a failure after trade save
    // by wrapping the original dataSource.transaction
    const origTransaction = dataSource.transaction.bind(dataSource);
    dataSource.transaction = jest.fn(
      async (
        cb: (tx: {
          getRepository: (e: unknown) => {
            save: jest.Mock;
            findOne: jest.Mock;
            update: jest.Mock;
            create: jest.Mock;
          };
          query: jest.Mock;
        }) => Promise<unknown>,
      ) => {
        return origTransaction(async (realTx) => {
          // Wrap the real EntityManager to intercept ledgerRepo.save
          const origGetRepo = realTx.getRepository.bind(realTx);
          const wrappedTx = {
            getRepository: (entity: any) => {
              const repo = origGetRepo(entity);
              if (entity === PerformanceFeeLedgerEntry) {
                return {
                  ...repo,
                  save: jest.fn().mockRejectedValue(new Error('injected ledger failure')),
                };
              }
              return repo;
            },
            query: realTx.query.bind(realTx),
          };
          try {
            await cb(wrappedTx as any);
          } catch (e) {
            throw e;
          }
        });
      },
    ) as any;

    await service.runReconciliation(
      userId,
      brokerConnectionId,
      new Date(Date.now() - 604800000),
      new Date(Date.now() - 1000),
      'admin-1',
    );

    // Restore
    dataSource.transaction = origTransaction;

    // After the injected failure, the entire transaction must have rolled back:
    // NO partial trade row, NO orphan ledger.
    const c = await counts();
    expect(c.tradeCount).toBe(0);
    expect(c.ledgerCount).toBe(0);
  });

  // ── 10. (GATE-3 §12) Rollback: failure after ledger creation, before linkage → no orphan ledger
  it('10. injected failure after ledger creation before linkage → transaction rolls back, no orphan ledger', async () => {
    setupOneWinningTrade('100.00', '-2.50', '-0.50');
    // Override to inject failure AFTER ledger save but BEFORE trade.update (linkage)
    const origTransaction = dataSource.transaction.bind(dataSource);
    dataSource.transaction = jest.fn(async (cb: (tx: any) => Promise<unknown>) => {
      return origTransaction(async (realTx: any) => {
        const origGetRepo = realTx.getRepository.bind(realTx);
        const wrappedTx = {
          getRepository: (entity: any) => {
            const repo = origGetRepo(entity);
            if (entity === BrokerReconciledTrade) {
              return {
                ...repo,
                // The second call to update (linkage) will fail
                update: jest.fn().mockRejectedValueOnce(new Error('injected linkage failure')),
              };
            }
            return repo;
          },
          query: realTx.query.bind(realTx),
        };
        try {
          await cb(wrappedTx);
        } catch (e) {
          throw e;
        }
      });
    }) as any;

    await service.runReconciliation(
      userId,
      brokerConnectionId,
      new Date(Date.now() - 604800000),
      new Date(Date.now() - 1000),
      'admin-1',
    );

    // Restore
    dataSource.transaction = origTransaction;

    // After the injected linkage failure, the entire transaction must have rolled back:
    // NO orphan ledger, NO partial trade linkage.
    const c = await counts();
    expect(c.tradeCount).toBe(0);
    expect(c.ledgerCount).toBe(0);
  });

  it('11. legacy partial row + mismatched existing ledger → fail closed, never link unsafe ledger', async () => {
    await dataSource.query(
      "INSERT INTO broker_reconciliation.broker_reconciled_trades (user_id, broker_connection_id, broker_provider, broker_trade_id, instrument, direction, volume, closed_at, realised_pnl, commission, swap, net_realised_pnl, currency, source_type, is_fee_eligible, ledger_entry_id) VALUES ($1,$2,'mt5',$3,'EURUSD','BUY','1.00', NOW(), 10000, -250, -50, 9700, 'USD', 'LIVE_BROKER', true, NULL)",
      [userId, brokerConnectionId, brokerTradeId],
    );
    await dataSource.query(
      "INSERT INTO performance_fees.performance_fee_ledger_entries (user_id, broker_connection_id, entry_type, currency, amount, source_reference, occurred_at) VALUES ($1,$2,'REALISED_TRADE_LOSS','EUR',-1,$3, NOW())",
      [userId, brokerConnectionId, brokerTradeId],
    );

    setupOneWinningTrade();
    await runOnce();

    const c = await counts();
    expect(c.tradeCount).toBe(1);
    expect(c.ledgerCount).toBe(1);
    expect(c.linkId).toBeNull();
    expect(c.ledgerType).toBe('REALISED_TRADE_LOSS');
    expect(c.ledgerAmount).toBe('-1');
  });
});
