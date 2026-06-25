import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CredentialEncryptionService } from './credential-encryption.service';
import { DecryptedBrokerCredentials } from '../interfaces/broker-adapter.interface';
import { BrokerAdapterError, BrokerErrorCode } from '../interfaces/broker-adapter.errors';

const TEST_ENCRYPTION_KEY = 'test-encryption-key-32-chars-pad!!';

describe('CredentialEncryptionService', () => {
  let module: TestingModule;
  let service: CredentialEncryptionService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        CredentialEncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, defaultVal?: string) => {
              if (key === 'BROKER_ENCRYPTION_KEY') return TEST_ENCRYPTION_KEY;
              return defaultVal;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<CredentialEncryptionService>(CredentialEncryptionService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('encrypt() / decrypt() round-trip', () => {
    it('successfully encrypts and decrypts credentials', () => {
      const credentials: DecryptedBrokerCredentials = {
        apiKey: 'test-api-key-abc123',
        apiSecret: 'test-secret-xyz987',
        accountId: '654321',
        serverUrl: 'https://mt-client-api.example.com',
      };

      const bundle = service.encrypt(credentials);
      const decrypted = service.decrypt(bundle);

      expect(decrypted.apiKey).toBe(credentials.apiKey);
      expect(decrypted.apiSecret).toBe(credentials.apiSecret);
      expect(decrypted.accountId).toBe(credentials.accountId);
      expect(decrypted.serverUrl).toBe(credentials.serverUrl);
    });

    it('produces different ciphertext for same plaintext (random IV)', () => {
      const credentials: DecryptedBrokerCredentials = { accountId: '123' };
      const bundle1 = service.encrypt(credentials);
      const bundle2 = service.encrypt(credentials);

      expect(bundle1.ciphertext).not.toBe(bundle2.ciphertext);
      expect(bundle1.iv).not.toBe(bundle2.iv);
    });

    it('never stores raw API key in the ciphertext output', () => {
      const credentials: DecryptedBrokerCredentials = {
        apiKey: 'SUPER_SECRET_API_KEY',
        accountId: '999',
      };
      const bundle = service.encrypt(credentials);

      // The raw API key must NEVER appear in ciphertext, IV, or tag
      expect(bundle.ciphertext).not.toContain('SUPER_SECRET_API_KEY');
      expect(bundle.iv).not.toContain('SUPER_SECRET_API_KEY');
      expect(bundle.tag).not.toContain('SUPER_SECRET_API_KEY');
    });
  });

  describe('decrypt() error handling', () => {
    beforeEach(() => { jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {}); });
    afterEach(() => { jest.restoreAllMocks(); });

    it('throws BrokerAdapterError with DECRYPTION_FAILED on tampered data', () => {
      const credentials: DecryptedBrokerCredentials = { accountId: '123' };
      const bundle = service.encrypt(credentials);

      // Tamper with the ciphertext
      const tamperedBundle = { ...bundle, ciphertext: bundle.ciphertext.slice(0, -4) + 'dead' };

      expect(() => service.decrypt(tamperedBundle)).toThrow(BrokerAdapterError);
      expect(() => service.decrypt(tamperedBundle)).toThrow(
        expect.objectContaining({ code: BrokerErrorCode.DECRYPTION_FAILED }),
      );
    });

    it('marks decryption errors as non-retryable', () => {
      const bundle = { ciphertext: 'bad', iv: 'badbad', tag: 'badtag', keyId: 'test' };
      try {
        service.decrypt(bundle);
      } catch (err) {
        expect((err as BrokerAdapterError).isRetryable).toBe(false);
      }
    });
  });
});
