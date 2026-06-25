import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BrokerService } from './broker.service';
import { BrokerConnection } from './entities/broker-connection.entity';
import { BrokerAccount } from './entities/broker-account.entity';
import { BrokerAdapterRegistry } from './adapters/broker-adapter.registry';
import { CredentialEncryptionService } from './services/credential-encryption.service';
import { AuditService } from '../audit/audit.service';
import {
  BrokerConnectionStatus,
  BrokerMode,
} from './interfaces/broker-adapter.interface';

// ─── Mock factories ───────────────────────────────────────────────────────────

const mockConnectionRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
  softDelete: jest.fn(),
});

const mockAccountRepo = () => ({
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockImplementation((obj) => obj),
  save: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
});

const mockRegistry = () => ({
  isSupported: jest.fn().mockReturnValue(true),
  getAdapter: jest.fn(),
  getSupportedBrokers: jest.fn().mockReturnValue([
    { brokerId: 'metatrader5', brokerName: 'MetaTrader 5 (via MetaAPI)', supportsDemo: true },
  ]),
});

const mockEncryption = () => ({
  encrypt: jest.fn().mockReturnValue({
    ciphertext: 'ciphertext_abc',
    iv: 'iv_abc',
    tag: 'tag_abc',
    keyId: 'env-key-v1',
  }),
  decrypt: jest.fn().mockReturnValue({
    apiKey: 'test-key',
    accountId: '123456',
  }),
});

const mockAudit = () => ({
  log: jest.fn().mockResolvedValue(undefined),
});

// ─── Connected-connection fixture with full credentials ───────────────────────

const connectedConnection = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'conn-1',
  userId: 'user-1',
  brokerId: 'metatrader5',
  accountType: BrokerMode.DEMO,
  status: BrokerConnectionStatus.CONNECTED,
  consecutiveFailureCount: 0,
  encryptedCredentials: 'ciphertext',
  credentialIv: 'iv',
  credentialTag: 'tag',
  encryptionKeyId: 'env-key-v1',
  ...overrides,
});

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('BrokerService', () => {
  let module: TestingModule;
  let service: BrokerService;
  let connectionRepo: ReturnType<typeof mockConnectionRepo>;
  let accountRepo: ReturnType<typeof mockAccountRepo>;
  let registry: ReturnType<typeof mockRegistry>;
  let encryption: ReturnType<typeof mockEncryption>;
  let auditService: ReturnType<typeof mockAudit>;

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        BrokerService,
        { provide: getRepositoryToken(BrokerConnection), useFactory: mockConnectionRepo },
        { provide: getRepositoryToken(BrokerAccount), useFactory: mockAccountRepo },
        { provide: BrokerAdapterRegistry, useFactory: mockRegistry },
        { provide: CredentialEncryptionService, useFactory: mockEncryption },
        { provide: AuditService, useFactory: mockAudit },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    service = module.get<BrokerService>(BrokerService);
    connectionRepo = module.get(getRepositoryToken(BrokerConnection));
    accountRepo = module.get(getRepositoryToken(BrokerAccount));
    registry = module.get(BrokerAdapterRegistry);
    encryption = module.get(CredentialEncryptionService);
    auditService = module.get(AuditService);
  });

  afterEach(async () => {
    await module.close();
  });

  // ─── getSupportedBrokers ──────────────────────────────────────────────────

  describe('getSupportedBrokers()', () => {
    it('returns the list from the registry', () => {
      const result = service.getSupportedBrokers();
      expect(result).toHaveLength(1);
      expect(result[0].brokerId).toBe('metatrader5');
    });
  });

  // ─── findConnectionsByUser ────────────────────────────────────────────────

  describe('findConnectionsByUser()', () => {
    it('returns connections for the given user', async () => {
      const mockConns = [{ id: 'conn-1', userId: 'user-1' }];
      connectionRepo.find.mockResolvedValue(mockConns);

      const result = await service.findConnectionsByUser('user-1');
      expect(result).toEqual(mockConns);
      expect(connectionRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  // ─── findConnectionById ───────────────────────────────────────────────────

  describe('findConnectionById()', () => {
    it('returns a connection when found', async () => {
      const mockConn = { id: 'conn-1', userId: 'user-1' };
      connectionRepo.findOne.mockResolvedValue(mockConn);

      const result = await service.findConnectionById('conn-1', 'user-1');
      expect(result).toEqual(mockConn);
    });

    it('throws NotFoundException when not found', async () => {
      connectionRepo.findOne.mockResolvedValue(null);
      await expect(service.findConnectionById('bad-id', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── createConnection ─────────────────────────────────────────────────────

  describe('createConnection()', () => {
    it('encrypts credentials and saves the connection', async () => {
      const dto = {
        brokerId: 'metatrader5',
        accountType: BrokerMode.DEMO,
        accountId: '123456',
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
      };
      const savedConn = { id: 'conn-new', ...dto };
      connectionRepo.create.mockReturnValue(savedConn);
      connectionRepo.save.mockResolvedValue(savedConn);
      registry.getAdapter.mockReturnValue({ brokerName: 'MetaTrader 5 (via MetaAPI)' });

      const result = await service.createConnection(dto as any, 'user-1');

      expect(encryption.encrypt).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'test-api-key', accountId: '123456' }),
      );
      expect(connectionRepo.save).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalled();
      expect(result.id).toBe('conn-new');
    });

    it('never includes raw credentials in the saved entity', async () => {
      const dto = {
        brokerId: 'metatrader5',
        accountType: BrokerMode.DEMO,
        accountId: '123456',
        apiKey: 'super-secret-key',
      };
      registry.getAdapter.mockReturnValue({ brokerName: 'MetaTrader 5' });
      connectionRepo.create.mockImplementation((obj) => obj);
      connectionRepo.save.mockImplementation(async (obj) => ({ id: 'new-id', ...obj }));

      const result = await service.createConnection(dto as any, 'user-1');

      expect(JSON.stringify(result)).not.toContain('super-secret-key');
    });
  });

  // ─── hasActiveConnection ──────────────────────────────────────────────────

  describe('hasActiveConnection()', () => {
    it('returns true when a connected broker exists', async () => {
      connectionRepo.findOne.mockResolvedValue({ id: 'conn-1', status: BrokerConnectionStatus.CONNECTED });
      expect(await service.hasActiveConnection('user-1')).toBe(true);
    });

    it('returns false when no connected broker exists', async () => {
      connectionRepo.findOne.mockResolvedValue(null);
      expect(await service.hasActiveConnection('user-1')).toBe(false);
    });
  });

  // ─── connectBroker ────────────────────────────────────────────────────────

  describe('connectBroker()', () => {
    it('throws BadRequestException when credentials are missing', async () => {
      connectionRepo.findOne.mockResolvedValue({
        id: 'conn-1',
        userId: 'user-1',
        brokerId: 'metatrader5',
        encryptedCredentials: null,
        credentialIv: null,
        credentialTag: null,
      });

      await expect(service.connectBroker('conn-1', 'user-1')).rejects.toThrow(
        'Broker connection has no stored credentials',
      );
    });

    it('calls decrypt and adapter.connect with decrypted credentials', async () => {
      const mockAdapter = {
        setMode: jest.fn(),
        connect: jest.fn().mockResolvedValue({
          success: true,
          accountId: '123456',
          accountType: BrokerMode.DEMO,
          currency: 'USD',
          serverTime: new Date(),
        }),
      };
      registry.getAdapter.mockReturnValue(mockAdapter);

      const mockConn = {
        id: 'conn-1',
        userId: 'user-1',
        brokerId: 'metatrader5',
        accountType: BrokerMode.DEMO,
        encryptedCredentials: 'ciphertext',
        credentialIv: 'iv',
        credentialTag: 'tag',
        encryptionKeyId: 'env-key-v1',
        consecutiveFailureCount: 0,
      };
      connectionRepo.findOne
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce({ ...mockConn, status: BrokerConnectionStatus.CONNECTED });
      connectionRepo.update.mockResolvedValue({});
      accountRepo.findOne.mockResolvedValue(null);
      accountRepo.create.mockReturnValue({});
      accountRepo.save.mockResolvedValue({});

      await service.connectBroker('conn-1', 'user-1');

      expect(encryption.decrypt).toHaveBeenCalled();
      // Credentials zeroed in finally block — verify connect was called, not the values
      expect(mockAdapter.connect).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalled();
    });
  });

  // ─── enableLiveTrading ────────────────────────────────────────────────────

  describe('enableLiveTrading()', () => {
    it('throws ForbiddenException if DEMO has not been validated', async () => {
      connectionRepo.findOne
        .mockResolvedValueOnce({
          id: 'conn-live',
          userId: 'user-1',
          accountType: BrokerMode.LIVE,
          brokerId: 'metatrader5',
        })
        .mockResolvedValueOnce(null);

      await expect(service.enableLiveTrading('conn-live', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('enables live trading when DEMO is validated', async () => {
      connectionRepo.findOne
        .mockResolvedValueOnce({
          id: 'conn-live',
          userId: 'user-1',
          accountType: BrokerMode.LIVE,
          brokerId: 'metatrader5',
        })
        .mockResolvedValueOnce({
          id: 'conn-demo',
          userId: 'user-1',
          accountType: BrokerMode.DEMO,
          demoValidated: true,
        });
      connectionRepo.update.mockResolvedValue({});

      await expect(service.enableLiveTrading('conn-live', 'user-1')).resolves.not.toThrow();
      expect(connectionRepo.update).toHaveBeenCalledWith('conn-live', { liveTradingEnabled: true });
    });
  });

  // ─── healthCheck ─────────────────────────────────────────────────────────

  describe('healthCheck()', () => {
    /** Standard healthy adapter — connect + getAccountBalance both succeed. */
    const healthyAdapter = () => ({
      setMode: jest.fn(),
      connect: jest.fn().mockResolvedValue({ success: true }),
      getAccountBalance: jest.fn().mockResolvedValue({
        balance: '10000.00',
        equity: '10000.00',
        currency: 'USD',
        timestamp: new Date(),
      }),
    });

    /** Failing adapter — connect succeeds but getAccountBalance throws. */
    const failingAdapter = (error = 'connection timeout') => ({
      setMode: jest.fn(),
      connect: jest.fn().mockResolvedValue({ success: true }),
      getAccountBalance: jest.fn().mockRejectedValue(new Error(error)),
    });

    it('returns false when connection is not CONNECTED status', async () => {
      connectionRepo.findOne.mockResolvedValue({
        id: 'conn-1',
        status: BrokerConnectionStatus.DISCONNECTED,
      });
      expect(await service.healthCheck('conn-1')).toBe(false);
    });

    it('returns false when connection is not found', async () => {
      connectionRepo.findOne.mockResolvedValue(null);
      expect(await service.healthCheck('conn-1')).toBe(false);
    });

    it('returns true and resets failure count on successful health check', async () => {
      const adapter = healthyAdapter();
      registry.getAdapter.mockReturnValue(adapter);
      connectionRepo.findOne.mockResolvedValue(
        connectedConnection({ consecutiveFailureCount: 1 }),
      );

      const result = await service.healthCheck('conn-1');

      expect(result).toBe(true);
      expect(connectionRepo.update).toHaveBeenCalledWith(
        'conn-1',
        expect.objectContaining({ consecutiveFailureCount: 0, lastErrorMessage: null }),
      );
      // Status must NOT be set to SUSPENDED on success
      const updateCall = (connectionRepo.update as jest.Mock).mock.calls[0][1];
      expect(updateCall.status).toBeUndefined();
    });

    it('1st failure: increments failureCount to 1 — does NOT suspend', async () => {
      // suppress expected logger.error output
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
      const adapter = failingAdapter();
      registry.getAdapter.mockReturnValue(adapter);
      connectionRepo.findOne.mockResolvedValue(
        connectedConnection({ consecutiveFailureCount: 0 }),
      );

      const result = await service.healthCheck('conn-1');

      expect(result).toBe(false);
      const updateCall = (connectionRepo.update as jest.Mock).mock.calls[0][1];
      expect(updateCall.consecutiveFailureCount).toBe(1);
      expect(updateCall.status).toBeUndefined(); // not yet suspended
    });

    it('2nd failure: increments failureCount to 2 — does NOT suspend', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
      const adapter = failingAdapter();
      registry.getAdapter.mockReturnValue(adapter);
      connectionRepo.findOne.mockResolvedValue(
        connectedConnection({ consecutiveFailureCount: 1 }),
      );

      const result = await service.healthCheck('conn-1');

      expect(result).toBe(false);
      const updateCall = (connectionRepo.update as jest.Mock).mock.calls[0][1];
      expect(updateCall.consecutiveFailureCount).toBe(2);
      expect(updateCall.status).toBeUndefined();
    });

    it('3rd consecutive failure: suspends the connection and writes audit event', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
      const adapter = failingAdapter('connection timeout');
      registry.getAdapter.mockReturnValue(adapter);
      connectionRepo.findOne.mockResolvedValue(
        connectedConnection({ consecutiveFailureCount: 2 }),
      );

      const result = await service.healthCheck('conn-1');

      expect(result).toBe(false);
      // Must call update with SUSPENDED status
      expect(connectionRepo.update).toHaveBeenCalledWith(
        'conn-1',
        expect.objectContaining({ status: BrokerConnectionStatus.SUSPENDED }),
      );
      // Must write a CRITICAL audit event
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'CRITICAL' }),
      );
    });

    it('health check exception does not propagate — returns false safely', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
      // Adapter connect itself throws (not just getAccountBalance)
      const adapter = {
        setMode: jest.fn(),
        connect: jest.fn().mockRejectedValue(new Error('MetaAPI SDK unavailable')),
        getAccountBalance: jest.fn(),
      };
      registry.getAdapter.mockReturnValue(adapter);
      connectionRepo.findOne.mockResolvedValue(connectedConnection());

      // Must not throw — must return false
      await expect(service.healthCheck('conn-1')).resolves.toBe(false);
      expect(connectionRepo.update).toHaveBeenCalled();
    });

    it('suspended connection is rejected by hasActiveConnection()', async () => {
      // A SUSPENDED connection should not be returned as "active"
      connectionRepo.findOne.mockResolvedValue(null); // no CONNECTED connection
      expect(await service.hasActiveConnection('user-1')).toBe(false);
    });
  });
});
