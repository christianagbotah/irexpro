import { redactSensitive, sanitizeDatabaseError } from './redact-sensitive.util';

/**
 * Redaction utility tests — Hotfix.
 *
 * Verifies that sensitive fields are recursively redacted from objects
 * before logging, and that database errors are sanitized.
 */
describe('redactSensitive (Hotfix)', () => {
  it('should redact password', () => {
    const result = redactSensitive({ password: 'secret123' });
    expect(result.password).toBe('[REDACTED]');
  });

  it('should redact passwordHash', () => {
    const result = redactSensitive({ passwordHash: '$argon2id$...' });
    expect(result.passwordHash).toBe('[REDACTED]');
  });

  it('should redact mfaSecret', () => {
    const result = redactSensitive({ mfaSecret: 'ABCDE12345' });
    expect(result.mfaSecret).toBe('[REDACTED]');
  });

  it('should redact refreshToken', () => {
    const result = redactSensitive({ refreshToken: 'token-abc' });
    expect(result.refreshToken).toBe('[REDACTED]');
  });

  it('should redact authorization header', () => {
    const result = redactSensitive({ authorization: 'Bearer token' });
    expect(result.authorization).toBe('[REDACTED]');
  });

  it('should redact cookie header', () => {
    const result = redactSensitive({ cookie: 'irexpro_refresh=abc' });
    expect(result.cookie).toBe('[REDACTED]');
  });

  it('should redact apiKey and apiSecret', () => {
    const result = redactSensitive({ apiKey: 'key', apiSecret: 'secret' });
    expect(result.apiKey).toBe('[REDACTED]');
    expect(result.apiSecret).toBe('[REDACTED]');
  });

  it('should redact encryptedCredentials, credentialIv, credentialTag', () => {
    const result = redactSensitive({
      encryptedCredentials: 'ciphertext',
      credentialIv: 'iv',
      credentialTag: 'tag',
    });
    expect(result.encryptedCredentials).toBe('[REDACTED]');
    expect(result.credentialIv).toBe('[REDACTED]');
    expect(result.credentialTag).toBe('[REDACTED]');
  });

  it('should redact case-insensitively', () => {
    const result = redactSensitive({ Password: 'x', PASSWORD: 'y', passwordHash: 'z' });
    expect(result.Password).toBe('[REDACTED]');
    expect(result.PASSWORD).toBe('[REDACTED]');
    expect(result.passwordHash).toBe('[REDACTED]');
  });

  it('should redact recursively in nested objects', () => {
    const result = redactSensitive({
      user: {
        email: 'user@example.com',
        passwordHash: 'hash',
        profile: { apiKey: 'key' },
      },
    });
    expect(result.user.email).toBe('user@example.com');
    expect(result.user.passwordHash).toBe('[REDACTED]');
    expect(result.user.profile.apiKey).toBe('[REDACTED]');
  });

  it('should redact in arrays', () => {
    const result = redactSensitive([{ password: 'a' }, { name: 'b' }]);
    expect(result[0].password).toBe('[REDACTED]');
    expect(result[1].name).toBe('b');
  });

  it('should NOT redact non-sensitive fields', () => {
    const result = redactSensitive({ email: 'user@example.com', phone: '+233243618186', status: 'ACTIVE' });
    expect(result.email).toBe('user@example.com');
    expect(result.phone).toBe('+233243618186');
    expect(result.status).toBe('ACTIVE');
  });

  it('should NOT mutate the original object', () => {
    const original = { password: 'secret', email: 'a@b.com' };
    redactSensitive(original);
    expect(original.password).toBe('secret');
    expect(original.email).toBe('a@b.com');
  });

  it('should handle null and undefined', () => {
    expect(redactSensitive(null)).toBeNull();
    expect(redactSensitive(undefined)).toBeUndefined();
  });

  it('should redact a complete User entity object (no secrets leak)', () => {
    const userEntity = {
      id: 'uuid',
      email: 'user@example.com',
      phone: '+233243618186',
      passwordHash: '$argon2id$super_secret',
      mfaSecret: 'secret_mfa',
      status: 'ACTIVE',
      userRoles: [{ role: { name: 'USER' } }],
    };
    const result = redactSensitive(userEntity);
    expect(result.passwordHash).toBe('[REDACTED]');
    expect(result.mfaSecret).toBe('[REDACTED]');
    expect(result.email).toBe('user@example.com');
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('$argon2id');
    expect(serialized).not.toContain('secret_mfa');
  });
});

describe('sanitizeDatabaseError (Hotfix)', () => {
  it('should extract safe fields from a QueryFailedError', () => {
    const err = {
      name: 'QueryFailedError',
      message: 'invalid input syntax for type uuid: "object"',
      code: '22P02',
      detail: 'some detail',
    };
    const result = sanitizeDatabaseError(err);
    expect(result.name).toBe('QueryFailedError');
    expect(result.code).toBe('22P02');
    expect(result.message).toContain('invalid input syntax');
    expect(result.detail).toBe('some detail');
  });

  it('should NOT include query parameters', () => {
    const err = {
      name: 'QueryFailedError',
      message: 'error',
      code: '42P01',
      parameters: [{ id: 'uuid', passwordHash: 'secret' }],
    };
    const result = sanitizeDatabaseError(err);
    expect(result).not.toHaveProperty('parameters');
  });

  it('should handle non-object errors', () => {
    const result = sanitizeDatabaseError('string error');
    expect(result.name).toBe('UnknownError');
    expect(result.message).toBe('Database error');
  });

  it('should redact credential-like values in messages', () => {
    const err = {
      name: 'QueryFailedError',
      message: 'password=secret123 connection failed',
      code: 'XX',
    };
    const result = sanitizeDatabaseError(err);
    expect(result.message).toContain('[REDACTED]');
    expect(result.message).not.toContain('secret123');
  });
});
