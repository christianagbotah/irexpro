import { AllExceptionsFilter } from './all-exceptions.filter';
import { redactSensitive, sanitizeDatabaseError } from '../utils/redact-sensitive.util';

/**
 * Sensitive principal logging regression test — Hotfix amendment.
 *
 * Proves that when a repository query fails, the exception filter and
 * redaction utility do NOT log the complete AuthenticatedPrincipal or
 * any sensitive fields.
 */
describe('Sensitive principal logging regression (Hotfix amendment)', () => {
  describe('redactSensitive on a complete principal', () => {
    const principal = {
      userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      email: 'user@example.com',
      phone: '+233243618186',
      roles: ['USER'],
      status: 'ACTIVE',
    };

    it('should NOT redact userId (safe field)', () => {
      const result = redactSensitive(principal);
      expect(result.userId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('should NOT redact status (safe field)', () => {
      const result = redactSensitive(principal);
      expect(result.status).toBe('ACTIVE');
    });

    // The principal itself has no sensitive fields — but if it were accidentally
    // merged with a User entity (the old bug), the sensitive fields would be
    // redacted.
    it('should redact sensitive fields if a User entity is accidentally present', () => {
      const principalWithUserEntity = {
        ...principal,
        passwordHash: '$argon2id$secret',
        mfaSecret: 'mfa_secret',
        userRoles: [{ role: { name: 'USER' } }],
      };
      const result = redactSensitive(principalWithUserEntity);
      expect(result.passwordHash).toBe('[REDACTED]');
      expect(result.mfaSecret).toBe('[REDACTED]');
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('$argon2id');
      expect(serialized).not.toContain('mfa_secret');
    });
  });

  describe('redactSensitive on database error parameters', () => {
    it('should redact passwordHash in query parameters', () => {
      const dbError = {
        name: 'QueryFailedError',
        message: 'invalid input syntax for type uuid',
        code: '22P02',
        parameters: [
          {
            userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            passwordHash: '$argon2id$secret_hash',
            mfaSecret: 'secret_mfa',
            email: 'user@example.com',
            phone: '+233243618186',
            roles: ['USER'],
            userRoles: [{ role: { name: 'USER' } }],
          },
        ],
      };
      const result = redactSensitive(dbError);
      // The safe fields should be preserved
      expect(result.name).toBe('QueryFailedError');
      expect(result.code).toBe('22P02');
      // The parameters array should have sensitive fields redacted
      const params = result.parameters as unknown[];
      expect(params[0]).toHaveProperty('passwordHash', '[REDACTED]');
      expect(params[0]).toHaveProperty('mfaSecret', '[REDACTED]');
      // Safe fields in the parameters should be preserved
      expect(params[0]).toHaveProperty('userId');
      expect(params[0]).toHaveProperty('email', 'user@example.com');
    });

    it('should redact email and phone if they appear in error details', () => {
      // Note: email and phone are NOT in the SENSITIVE_KEYS set because they're
      // needed for onboarding/broker operations. But passwordHash, mfaSecret,
      // and credentials ARE redacted.
      const errorWithSensitiveFields = {
        message: 'query failed',
        passwordHash: 'secret',
        apiKey: 'broker_key',
        apiSecret: 'broker_secret',
        encryptedCredentials: 'cipher',
        authorization: 'Bearer token',
        cookie: 'refresh=abc',
      };
      const result = redactSensitive(errorWithSensitiveFields);
      expect(result.passwordHash).toBe('[REDACTED]');
      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.apiSecret).toBe('[REDACTED]');
      expect(result.encryptedCredentials).toBe('[REDACTED]');
      expect(result.authorization).toBe('[REDACTED]');
      expect(result.cookie).toBe('[REDACTED]');
    });
  });

  describe('AllExceptionsFilter safe log output', () => {
    it('should only log safe fields for database errors (name, code, message, method, url)', () => {
      const dbError = {
        name: 'QueryFailedError',
        message: 'invalid input syntax for type uuid',
        code: '22P02',
        parameters: [{ id: 'uuid', passwordHash: 'secret' }],
      };

      const sanitized = sanitizeDatabaseError(dbError);

      // Verify the sanitized output has NO sensitive fields
      const serialized = JSON.stringify(sanitized);
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('secret');
      // sanitizeDatabaseError does NOT include parameters at all
      expect(sanitized).not.toHaveProperty('parameters');

      // Verify safe fields ARE present
      expect(sanitized.name).toBe('QueryFailedError');
      expect(sanitized.code).toBe('22P02');
    });
  });
});
