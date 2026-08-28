import { Repository } from 'typeorm';
import { BrokerAccount } from '../entities/broker-account.entity';
import { BrokerConnection } from '../entities/broker-connection.entity';
import { BrokerConnectionStatus, BrokerMode } from '../interfaces/broker-adapter.interface';
import {
  PortfolioSnapshotFreshness,
  PortfolioSnapshotUnavailableReason,
} from '../dto/portfolio-account-snapshot-response.dto';
import { PortfolioReadService } from './portfolio-read.service';

describe('PortfolioReadService', () => {
  let connectionRepo: Pick<Repository<BrokerConnection>, 'find'> & { find: jest.Mock };
  let accountRepo: Pick<Repository<BrokerAccount>, 'find'> & { find: jest.Mock };
  let service: PortfolioReadService;

  const USER_ID = '11111111-1111-4111-8111-111111111111';
  const CONNECTION_ID = '22222222-2222-4222-8222-222222222222';
  const NOW = new Date('2026-08-28T21:05:00.000Z');

  function connection(overrides: Partial<BrokerConnection> = {}): BrokerConnection {
    return {
      id: CONNECTION_ID,
      userId: USER_ID,
      brokerId: 'metatrader5',
      brokerName: 'MetaTrader 5',
      displayName: 'Primary demo',
      accountId: 'provider-account-id',
      accountType: BrokerMode.DEMO,
      accountCurrency: 'USD',
      accountLeverage: null,
      status: BrokerConnectionStatus.CONNECTED,
      encryptedCredentials: 'secret-ciphertext',
      credentialIv: 'secret-iv',
      credentialTag: 'secret-tag',
      encryptionKeyId: 'secret-key-ref',
      lastHealthCheckAt: new Date('2026-08-28T21:04:30.000Z'),
      lastSyncAt: null,
      consecutiveFailureCount: 0,
      lastErrorMessage: null,
      demoValidated: true,
      liveTradingEnabled: false,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-28T21:04:30.000Z'),
      deletedAt: null,
      ...overrides,
    } as BrokerConnection;
  }

  function account(overrides: Partial<BrokerAccount> = {}): BrokerAccount {
    return {
      id: '33333333-3333-4333-8333-333333333333',
      brokerConnectionId: CONNECTION_ID,
      balance: '10000.00000000',
      equity: '10125.50000000',
      margin: '0.00000000',
      freeMargin: '0.00000000',
      marginLevel: '0.0000',
      currency: 'USD',
      leverage: null,
      openPositionsCount: 0,
      syncedAt: new Date('2026-08-28T21:04:31.000Z'),
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-28T21:04:31.000Z'),
      connection: connection(),
      ...overrides,
    } as BrokerAccount;
  }

  beforeEach(() => {
    connectionRepo = { find: jest.fn().mockResolvedValue([connection()]) };
    accountRepo = { find: jest.fn().mockResolvedValue([account()]) };
    service = new PortfolioReadService(
      connectionRepo as unknown as Repository<BrokerConnection>,
      accountRepo as unknown as Repository<BrokerAccount>,
    );
  });

  it('scopes connection discovery to the authenticated user', async () => {
    await service.listAccounts(USER_ID, NOW);

    expect(connectionRepo.find).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      order: { createdAt: 'DESC' },
    });
  });

  it('returns no account query when the authenticated user has no broker connections', async () => {
    connectionRepo.find.mockResolvedValue([]);

    await expect(service.listAccounts(USER_ID, NOW)).resolves.toEqual([]);
    expect(accountRepo.find).not.toHaveBeenCalled();
  });

  it('ignores broker-account rows that do not belong to an authenticated-user connection', async () => {
    accountRepo.find.mockResolvedValue([
      account(),
      account({
        id: '44444444-4444-4444-8444-444444444444',
        brokerConnectionId: '55555555-5555-4555-8555-555555555555',
        balance: '999999.00000000',
      }),
    ]);

    const result = await service.listAccounts(USER_ID, NOW);

    expect(result).toHaveLength(1);
    expect(result[0].connectionId).toBe(CONNECTION_ID);
    expect(result[0].snapshot?.balance).toBe('10000.00000000');
  });

  it('returns a fresh currency-bearing snapshot only after a verified account sync', async () => {
    const [result] = await service.listAccounts(USER_ID, NOW);

    expect(result.snapshot).toEqual({
      currency: 'USD',
      balance: '10000.00000000',
      equity: '10125.50000000',
      freshness: PortfolioSnapshotFreshness.FRESH,
      syncedAt: new Date('2026-08-28T21:04:31.000Z'),
      ageSeconds: 29,
    });
    expect(result.snapshotUnavailableReason).toBeNull();
  });

  it('normalizes a valid lowercase account currency before exposure', async () => {
    accountRepo.find.mockResolvedValue([account({ currency: 'eur' })]);

    const [result] = await service.listAccounts(USER_ID, NOW);
    expect(result.snapshot?.currency).toBe('EUR');
  });

  it('fails closed when account currency is absent or invalid', async () => {
    accountRepo.find.mockResolvedValue([account({ currency: null })]);

    const [result] = await service.listAccounts(USER_ID, NOW);
    expect(result.snapshot).toBeNull();
    expect(result.snapshotUnavailableReason).toBe(
      PortfolioSnapshotUnavailableReason.CURRENCY_UNAVAILABLE,
    );
  });

  it('does not expose a connect-time zero placeholder as broker financial truth', async () => {
    accountRepo.find.mockResolvedValue([
      account({
        balance: '0.00000000',
        equity: '0.00000000',
        syncedAt: new Date('2026-08-28T21:04:29.000Z'),
      }),
    ]);

    const [result] = await service.listAccounts(USER_ID, NOW);
    expect(result.snapshot).toBeNull();
    expect(result.snapshotUnavailableReason).toBe(
      PortfolioSnapshotUnavailableReason.UNVERIFIED_ZERO_PLACEHOLDER,
    );
  });

  it('marks last-known non-zero financial state stale after a newer failed health marker', async () => {
    accountRepo.find.mockResolvedValue([
      account({ syncedAt: new Date('2026-08-28T21:04:00.000Z') }),
    ]);

    const [result] = await service.listAccounts(USER_ID, NOW);
    expect(result.snapshot?.freshness).toBe(PortfolioSnapshotFreshness.STALE);
    expect(result.snapshot?.ageSeconds).toBe(60);
  });

  it('marks a verified snapshot stale after three missed health intervals', async () => {
    connectionRepo.find.mockResolvedValue([
      connection({ lastHealthCheckAt: new Date('2026-08-28T20:59:00.000Z') }),
    ]);
    accountRepo.find.mockResolvedValue([
      account({ syncedAt: new Date('2026-08-28T20:59:01.000Z') }),
    ]);

    const [result] = await service.listAccounts(USER_ID, NOW);
    expect(result.snapshot?.freshness).toBe(PortfolioSnapshotFreshness.STALE);
  });

  it('marks financial state stale whenever the connection is not CONNECTED', async () => {
    connectionRepo.find.mockResolvedValue([
      connection({ status: BrokerConnectionStatus.DISCONNECTED }),
    ]);

    const [result] = await service.listAccounts(USER_ID, NOW);
    expect(result.snapshot?.freshness).toBe(PortfolioSnapshotFreshness.STALE);
  });

  it('returns NO_SYNC when no synchronized broker account exists', async () => {
    accountRepo.find.mockResolvedValue([]);

    const [result] = await service.listAccounts(USER_ID, NOW);
    expect(result.snapshot).toBeNull();
    expect(result.snapshotUnavailableReason).toBe(PortfolioSnapshotUnavailableReason.NO_SYNC);
  });

  it('never exposes credentials, provider account IDs, errors, margin defaults, or internal ownership', async () => {
    const [result] = await service.listAccounts(USER_ID, NOW);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('provider-account-id');
    expect(serialized).not.toContain('secret-ciphertext');
    expect(serialized).not.toContain('secret-iv');
    expect(serialized).not.toContain('secret-tag');
    expect(serialized).not.toContain('secret-key-ref');
    expect(Object.keys(result)).not.toContain('userId');
    expect(Object.keys(result)).not.toContain('accountId');
    expect(Object.keys(result)).not.toContain('lastErrorMessage');
    expect(Object.keys(result.snapshot ?? {})).not.toContain('margin');
    expect(Object.keys(result.snapshot ?? {})).not.toContain('freeMargin');
    expect(Object.keys(result.snapshot ?? {})).not.toContain('marginLevel');
    expect(Object.keys(result.snapshot ?? {})).not.toContain('leverage');
    expect(Object.keys(result.snapshot ?? {})).not.toContain('openPositionsCount');
  });
});
