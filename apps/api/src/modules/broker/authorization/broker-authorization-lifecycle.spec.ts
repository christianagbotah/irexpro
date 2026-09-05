import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { BrokerService } from '../broker.service';
import { BrokerConnection } from '../entities/broker-connection.entity';
import { BrokerAccount } from '../entities/broker-account.entity';
import { BrokerAdapterRegistry } from '../adapters/broker-adapter.registry';
import { BrokerProviderRegistryService } from '../registry/broker-provider-registry.service';
import { CredentialEncryptionService } from '../services/credential-encryption.service';
import { AuditService } from '../../audit/audit.service';
import { DomainEventBus } from '../../events/event-bus.service';
import { BrokerAuthorizationStatus } from '../authorization/broker-authorization-status';
import { BrokerCredentialStatus } from '../authorization/broker-credential-status';
import { BrokerConnectionStatus, BrokerMode } from '../interfaces/broker-adapter.interface';

/**
 * Sprint 50 — BrokerService authorization lifecycle integration tests.
 *
 * Directive §15 (explicit authorization state machine), §14 (credential
 * lifecycle), §16 (DEMO/PAPER/LIVE isolation — a demo account must never
 * reach live execution infrastructure), §37 (credentials never returned).
 */

const mockAdapter = (over: Record<string, unknown> = {}) => ({
  brokerId: 'metatrader5',
  brokerName: 'MetaTrader 5 (via MetaAPI)',
  supportsDemo: true,
  setMode: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  testConnection: jest.fn(),
  ...over,
});

const baseConnection = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'conn-1',
  userId: 'user-1',
  brokerId: 'metatrader5',
  brokerName: 'MetaTrader 5 (via MetaAPI)',
  accountType: BrokerMode.LIVE,
  status: BrokerConnectionStatus.DISCONNECTED,
  authorizationStatus: BrokerAuthorizationStatus.NOT_CONNECTED,
  credentialStatus: BrokerCredentialStatus.CREATED,
  demoValidated: false,
  liveTradingEnabled: false,
  encryptedCredentials: 'cipher',
  credentialIv: 'iv',
  credentialTag: 'tag',
  encryptionKeyId: 'env-key-v1',
  consecutiveFailureCount: 0,
  ...over,
});

describe('BrokerService — Sprint 50 authorization lifecycle', () => {
  let service: BrokerService;
  let connectionRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    softDelete: jest.Mock;
  };
  let accountRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock; update: jest.Mock };
  let adapter: ReturnType<typeof mockAdapter>;
  let providerRegistry: { supportsEnvironment: jest.Mock; isConnectable: jest.Mock };
  let encryption: { encrypt: jest.Mock; decrypt: jest.Mock };
  let audit: { log: jest.Mock };
  let eventBus: { publish: jest.Mock };

  beforeEach(async () => {
    adapter = mockAdapter();
    connectionRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn().mockImplementation((o) => o),
      save: jest.fn().mockImplementation(async (o) => ({ ...o, id: 'saved-1' })),
      softDelete: jest.fn(),
    };
    accountRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((o) => o),
      save: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    providerRegistry = {
      supportsEnvironment: jest.fn().mockReturnValue(true),
      isConnectable: jest.fn().mockReturnValue(true),
    };
    encryption = {
      encrypt: jest.fn().mockReturnValue({ ciphertext: 'c1', iv: 'i1', tag: 't1', keyId: 'k1' }),
      decrypt: jest.fn().mockReturnValue({ apiKey: 'k', accountId: '123' }),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    eventBus = { publish: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrokerService,
        { provide: getRepositoryToken(BrokerConnection), useValue: connectionRepo },
        { provide: getRepositoryToken(BrokerAccount), useValue: accountRepo },
        {
          provide: BrokerAdapterRegistry,
          useValue: {
            getAdapter: jest.fn().mockReturnValue(adapter),
            isSupported: jest.fn().mockReturnValue(true),
          },
        },
        { provide: BrokerProviderRegistryService, useValue: providerRegistry },
        { provide: CredentialEncryptionService, useValue: encryption },
        { provide: AuditService, useValue: audit },
        { provide: DomainEventBus, useValue: eventBus },
      ],
    }).compile();

    service = module.get(BrokerService);
  });

  describe('connectBroker() — state machine + credential advancement', () => {
    it('DEMO connect success → AUTHORIZED + demoValidated dual-write + VERIFIED credentials', async () => {
      connectionRepo.findOne
        .mockResolvedValueOnce(baseConnection({ accountType: BrokerMode.DEMO }))
        .mockResolvedValue(baseConnection());
      adapter.connect.mockResolvedValue({
        success: true,
        accountId: '123',
        accountType: BrokerMode.DEMO,
        currency: 'USD',
        serverTime: new Date(),
      });

      await service.connectBroker('conn-1', 'user-1');

      const updateCall = connectionRepo.update.mock.calls.find(
        (c) => c[1].status === BrokerConnectionStatus.CONNECTED,
      );
      expect(updateCall).toBeDefined();
      expect(updateCall![1].authorizationStatus).toBe(BrokerAuthorizationStatus.AUTHORIZED);
      expect(updateCall![1].credentialStatus).toBe(BrokerCredentialStatus.VERIFIED);
      expect(updateCall![1].demoValidated).toBe(true);
    });

    it('LIVE connect success → CONNECTED (NOT ACTIVE — explicit authorization still required)', async () => {
      connectionRepo.findOne
        .mockResolvedValueOnce(baseConnection())
        .mockResolvedValue(baseConnection());
      adapter.connect.mockResolvedValue({
        success: true,
        accountId: '123',
        accountType: BrokerMode.LIVE,
        currency: 'USD',
        serverTime: new Date(),
      });

      await service.connectBroker('conn-1', 'user-1');

      const updateCall = connectionRepo.update.mock.calls.find(
        (c) => c[1].status === BrokerConnectionStatus.CONNECTED,
      );
      expect(updateCall![1].authorizationStatus).toBe(BrokerAuthorizationStatus.CONNECTED);
      expect(updateCall![1].demoValidated).toBeUndefined();
    });

    it('connect failure → ERROR state + INVALID credentials on auth-class errors', async () => {
      connectionRepo.findOne
        .mockResolvedValueOnce(baseConnection())
        .mockResolvedValue(baseConnection());
      adapter.connect.mockResolvedValue({
        success: false,
        accountId: '',
        accountType: BrokerMode.LIVE,
        currency: '',
        serverTime: new Date(),
        error: 'AUTH_INVALID_TOKEN (401)',
      });

      await expect(service.connectBroker('conn-1', 'user-1')).rejects.toThrow(BadRequestException);

      const updateCall = connectionRepo.update.mock.calls.find(
        (c) => c[1].status === BrokerConnectionStatus.ERROR,
      );
      expect(updateCall).toBeDefined();
      expect(updateCall![1].authorizationStatus).toBe(BrokerAuthorizationStatus.ERROR);
      expect(updateCall![1].credentialStatus).toBe(BrokerCredentialStatus.INVALID);
    });
  });

  describe('createConnection() — environment registry gate (Directive §11)', () => {
    it('rejects LIVE when the provider does not support LIVE (fail closed)', async () => {
      providerRegistry.supportsEnvironment.mockReturnValue(false);

      await expect(
        service.createConnection(
          {
            brokerId: 'paper-broker',
            accountType: BrokerMode.LIVE,
            accountId: 'x',
          } as never,
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(providerRegistry.supportsEnvironment).toHaveBeenCalledWith(
        'paper-broker',
        BrokerMode.LIVE,
      );
    });

    it('initializes the state machine at NOT_CONNECTED / CREATED', async () => {
      await service.createConnection(
        { brokerId: 'metatrader5', accountType: BrokerMode.DEMO, accountId: '123' } as never,
        'user-1',
      );

      expect(connectionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizationStatus: BrokerAuthorizationStatus.NOT_CONNECTED,
          credentialStatus: BrokerCredentialStatus.CREATED,
        }),
      );
    });
  });

  describe('enableLiveTrading() — isolation gates (Directive §16)', () => {
    it('rejects when the provider lacks LIVE support even with demo validated', async () => {
      providerRegistry.supportsEnvironment.mockReturnValue(false);
      connectionRepo.findOne.mockResolvedValue(
        baseConnection({ authorizationStatus: BrokerAuthorizationStatus.CONNECTED }),
      );

      await expect(service.enableLiveTrading('conn-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects CONNECTED→ACTIVE transition when no DEMO was validated (unchanged invariant)', async () => {
      connectionRepo.findOne
        .mockResolvedValueOnce(
          baseConnection({ authorizationStatus: BrokerAuthorizationStatus.CONNECTED }),
        )
        .mockResolvedValueOnce(null); // no validated demo connection

      await expect(service.enableLiveTrading('conn-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(connectionRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('revokeAuthorization() (Directive §15)', () => {
    it('transitions ACTIVE → REVOKED and fail-closes liveTradingEnabled', async () => {
      connectionRepo.findOne.mockResolvedValue(
        baseConnection({
          authorizationStatus: BrokerAuthorizationStatus.ACTIVE,
          liveTradingEnabled: true,
        }),
      );

      await service.revokeAuthorization('conn-1', 'user-1');

      expect(connectionRepo.update).toHaveBeenCalledWith(
        'conn-1',
        expect.objectContaining({
          authorizationStatus: BrokerAuthorizationStatus.REVOKED,
          liveTradingEnabled: false,
          authorizationRevokedAt: expect.any(Date),
        }),
      );
      // Realtime event emitted so clients update immediately
      expect(eventBus.publish).toHaveBeenCalled();
    });

    it('rejects revocation from NOT_CONNECTED (invalid transition)', async () => {
      connectionRepo.findOne.mockResolvedValue(
        baseConnection({ authorizationStatus: BrokerAuthorizationStatus.NOT_CONNECTED }),
      );

      await expect(service.revokeAuthorization('conn-1', 'user-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('rotateCredentials() (Directive §14)', () => {
    it('validates new credentials BEFORE persisting — failure keeps old set', async () => {
      connectionRepo.findOne.mockResolvedValue(baseConnection());
      adapter.testConnection.mockResolvedValue({
        success: false,
        errorCode: 'AUTH_FAILED',
        errorMessage: 'invalid key',
      });

      await expect(
        service.rotateCredentials(
          'conn-1',
          { brokerId: 'metatrader5', accountType: BrokerMode.LIVE, accountId: '123' } as never,
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);

      expect(connectionRepo.update).not.toHaveBeenCalled();
    });

    it('replaces ciphertext and marks credentials ROTATED on success — no plaintext persisted', async () => {
      connectionRepo.findOne.mockResolvedValue(baseConnection());
      adapter.testConnection.mockResolvedValue({ success: true, accountId: '123' });

      await service.rotateCredentials(
        'conn-1',
        { brokerId: 'metatrader5', accountType: BrokerMode.LIVE, accountId: '123' } as never,
        'user-1',
      );

      expect(encryption.encrypt).toHaveBeenCalled();
      expect(connectionRepo.update).toHaveBeenCalledWith(
        'conn-1',
        expect.objectContaining({
          encryptedCredentials: 'c1',
          credentialStatus: BrokerCredentialStatus.ROTATED,
        }),
      );
      // The update payload must never contain plaintext credential fields
      const payload = JSON.stringify(connectionRepo.update.mock.calls[0][1]);
      expect(payload).not.toMatch(/"apiKey"|"apiSecret"/);
    });

    it('refuses rotation to a different broker or account type', async () => {
      connectionRepo.findOne.mockResolvedValue(baseConnection());

      await expect(
        service.rotateCredentials(
          'conn-1',
          { brokerId: 'oanda', accountType: BrokerMode.LIVE, accountId: '123' } as never,
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('isConnectionExecutable() — fail-closed gate (Directive §48)', () => {
    it('allows ONLY ACTIVE connections', () => {
      expect(
        service.isConnectionExecutable(
          baseConnection({ authorizationStatus: BrokerAuthorizationStatus.ACTIVE }) as never,
        ),
      ).toBe(true);
      expect(
        service.isConnectionExecutable(
          baseConnection({ authorizationStatus: BrokerAuthorizationStatus.CONNECTED }) as never,
        ),
      ).toBe(false);
      expect(
        service.isConnectionExecutable(
          baseConnection({ authorizationStatus: BrokerAuthorizationStatus.AUTHORIZED }) as never,
        ),
      ).toBe(false);
    });

    it('fails closed on missing state (legacy rows / corrupted state)', () => {
      expect(service.isConnectionExecutable(baseConnection() as never)).toBe(false);
      expect(
        service.isConnectionExecutable(baseConnection({ authorizationStatus: undefined }) as never),
      ).toBe(false);
    });
  });
});
