import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { DecryptedBrokerCredentials } from '../interfaces/broker-adapter.interface';
import { BrokerAdapterError, BrokerErrorCode } from '../interfaces/broker-adapter.errors';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

export interface EncryptedCredentialBundle {
  ciphertext: string;
  iv: string;
  tag: string;
  keyId: string;
}

/**
 * CredentialEncryptionService — AES-256-GCM symmetric encryption for broker credentials.
 *
 * ARCHITECTURE RULES:
 * - Encryption key is sourced from environment variable BROKER_ENCRYPTION_KEY
 * - In production, this key must be managed by AWS KMS or HashiCorp Vault (envelope encryption)
 * - Decrypted credentials are NEVER logged, NEVER returned in API responses
 * - This service is only ever called from BrokerService — never from controllers
 *
 * For production KMS envelope encryption:
 *   - A Data Encryption Key (DEK) is generated per credential set
 *   - The DEK is encrypted by KMS (Key Encryption Key / KEK)
 *   - Only the encrypted DEK is stored (encryptionKeyId field)
 *   - Decryption requires a call to KMS to unwrap the DEK first
 *   - This sprint uses a simpler symmetric approach with a single env-var key
 *
 * See: docs/architecture/09-broker-integration-architecture.md §6
 */
@Injectable()
export class CredentialEncryptionService {
  private readonly logger = new Logger(CredentialEncryptionService.name);
  private readonly encryptionKey: Buffer;
  private readonly keyId: string;

  constructor(private readonly configService: ConfigService) {
    const rawKey = this.configService.get<string>('BROKER_ENCRYPTION_KEY', '');

    if (!rawKey || rawKey.length < KEY_LENGTH) {
      throw new InternalServerErrorException(
        'BROKER_ENCRYPTION_KEY must be set and at least 32 characters long',
      );
    }

    this.encryptionKey = Buffer.from(rawKey.slice(0, KEY_LENGTH), 'utf8');
    this.keyId = 'env-key-v1';
  }

  /**
   * Encrypt broker credentials.
   * Returns ciphertext, IV, auth tag, and key identifier — all safe to persist.
   */
  encrypt(credentials: DecryptedBrokerCredentials): EncryptedCredentialBundle {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.encryptionKey, iv);

    const plaintext = JSON.stringify(credentials);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('hex'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      keyId: this.keyId,
    };
  }

  /**
   * Decrypt broker credentials.
   * The result is in-memory only — NEVER log or serialize the return value.
   */
  decrypt(bundle: EncryptedCredentialBundle): DecryptedBrokerCredentials {
    try {
      const iv = Buffer.from(bundle.iv, 'hex');
      const tag = Buffer.from(bundle.tag, 'hex');
      const ciphertext = Buffer.from(bundle.ciphertext, 'hex');

      const decipher = createDecipheriv(ALGORITHM, this.encryptionKey, iv);
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return JSON.parse(decrypted.toString('utf8')) as DecryptedBrokerCredentials;
    } catch (err) {
      // Log the error type only — never log the key, IV, or any credential data
      this.logger.error('Credential decryption failed', (err as Error).message);
      throw new BrokerAdapterError(
        BrokerErrorCode.DECRYPTION_FAILED,
        'Failed to decrypt broker credentials',
        undefined,
        false,
      );
    }
  }
}
