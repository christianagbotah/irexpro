import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { extractUserId, extractPrincipal } from './current-user.decorator';
import { AuthenticatedPrincipal } from '../interfaces/authenticated-principal.interface';

/**
 * CurrentUser + CurrentUserId decorator tests — Hotfix.
 *
 * Tests the exported factory functions (extractUserId, extractPrincipal)
 * which are used internally by the createParamDecorator wrappers.
 */

function mockExecutionContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

const validPrincipal: AuthenticatedPrincipal = {
  userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  email: 'user@example.com',
  phone: '+233243618186',
  roles: ['USER'],
  status: 'ACTIVE' as never,
};

describe('extractUserId (CurrentUserId factory — Hotfix)', () => {
  it('should return the UUID string from a valid principal', () => {
    const ctx = mockExecutionContext(validPrincipal);
    const result = extractUserId(ctx);
    expect(result).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(typeof result).toBe('string');
  });

  it('should throw UnauthorizedException when request.user is missing', () => {
    const ctx = mockExecutionContext(undefined);
    expect(() => extractUserId(ctx)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when request.user is null', () => {
    const ctx = mockExecutionContext(null);
    expect(() => extractUserId(ctx)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when userId is missing', () => {
    const ctx = mockExecutionContext({ ...validPrincipal, userId: undefined });
    expect(() => extractUserId(ctx)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when userId is not a valid UUID', () => {
    const ctx = mockExecutionContext({ ...validPrincipal, userId: 'not-a-uuid' });
    expect(() => extractUserId(ctx)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when an entire object is passed as userId', () => {
    // This is the exact bug that caused the production 500 — the old decorator
    // returned the full User object instead of a UUID string.
    const fullUserObject = {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      email: 'user@example.com',
      passwordHash: 'secret',
      userRoles: [],
    };
    const ctx = mockExecutionContext(fullUserObject);
    // The full User object doesn't have a `userId` property, so this should throw
    expect(() => extractUserId(ctx)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when userId is an object (not a string)', () => {
    const ctx = mockExecutionContext({ ...validPrincipal, userId: { id: '123' } as never });
    expect(() => extractUserId(ctx)).toThrow(UnauthorizedException);
  });
});

describe('extractPrincipal (CurrentUser factory — Hotfix)', () => {
  it('should return the sanitized AuthenticatedPrincipal', () => {
    const ctx = mockExecutionContext(validPrincipal);
    const result = extractPrincipal(ctx);
    expect(result).toEqual(validPrincipal);
    expect(result.userId).toBe(validPrincipal.userId);
    expect(result.roles).toEqual(validPrincipal.roles);
  });

  it('should NOT contain passwordHash', () => {
    const ctx = mockExecutionContext(validPrincipal);
    const result = extractPrincipal(ctx);
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('should NOT contain mfaSecret', () => {
    const ctx = mockExecutionContext(validPrincipal);
    const result = extractPrincipal(ctx);
    expect(result).not.toHaveProperty('mfaSecret');
  });

  it('should NOT contain userRoles', () => {
    const ctx = mockExecutionContext(validPrincipal);
    const result = extractPrincipal(ctx);
    expect(result).not.toHaveProperty('userRoles');
  });
});
