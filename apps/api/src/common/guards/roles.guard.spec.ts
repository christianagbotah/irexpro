import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { RoleName } from '../../modules/users/entities/role.entity';
import { ROLES_KEY } from '../constants/roles.constants';

/**
 * RolesGuard tests — verifies admin endpoint role enforcement.
 *
 * Hotfix: these tests confirm that admin endpoints (which use @Roles(ADMIN,
 * SUPER_ADMIN)) reject normal USER-role users with 403 Forbidden. The guard
 * is the real security boundary — the admin frontend sidebar hiding is just UX.
 */
describe('RolesGuard — admin endpoint enforcement', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockExecutionContext(user: unknown, roles: RoleName[] | undefined): ExecutionContext {
    const context = {
      getHandler: () => mockHandler,
      getClass: () => mockClass,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
    return context;
  }

  // Simulate @Roles(ADMIN, SUPER_ADMIN) on the handler
  const mockHandler = function adminHandler() { /* noop */ };
  const mockClass = class AdminController { };

  beforeEach(() => {
    // Mock reflector to return ADMIN, SUPER_ADMIN for the handler
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
      RoleName.ADMIN,
      RoleName.SUPER_ADMIN,
    ]);
  });

  it('should allow access for a user with ADMIN role', () => {
    const ctx = mockExecutionContext(
      { id: 'user-1', roles: [RoleName.ADMIN] },
      [RoleName.ADMIN],
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow access for a user with SUPER_ADMIN role', () => {
    const ctx = mockExecutionContext(
      { id: 'user-1', roles: [RoleName.SUPER_ADMIN] },
      [RoleName.SUPER_ADMIN],
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should REJECT a normal USER role (403 Forbidden)', () => {
    const ctx = mockExecutionContext(
      { id: 'user-2', roles: [RoleName.USER] },
      [RoleName.USER],
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow('Insufficient permissions');
  });

  it('should REJECT a user with no roles array', () => {
    const ctx = mockExecutionContext(
      { id: 'user-3', roles: [] },
      [],
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should REJECT when there is no user on the request (not authenticated)', () => {
    const ctx = mockExecutionContext(undefined, undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow('Access denied');
  });

  it('should allow access when no roles are required (no @Roles decorator)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = mockExecutionContext(
      { id: 'user-4', roles: [RoleName.USER] },
      [RoleName.USER],
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow a user with both USER and ADMIN roles (has ADMIN)', () => {
    const ctx = mockExecutionContext(
      { id: 'user-5', roles: [RoleName.USER, RoleName.ADMIN] },
      [RoleName.USER, RoleName.ADMIN],
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
