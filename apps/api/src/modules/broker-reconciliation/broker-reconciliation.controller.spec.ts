import { ForbiddenException } from '@nestjs/common';
import { BrokerReconciliationController } from './broker-reconciliation.controller';
import { RoleName } from '../users/entities/role.entity';
import { UserStatus } from '../users/entities/user.entity';
import { AuthenticatedPrincipal } from '../../common/interfaces/authenticated-principal.interface';

/**
 * Unit tests for BrokerReconciliationController access-control logic.
 *
 * The @Roles(ADMIN, SUPER_ADMIN) decorator on the run endpoint is enforced by
 * RolesGuard at the routing layer; these tests cover the in-handler scoping
 * that prevents normal users from reading another user's data.
 *
 * Hotfix: controller methods now accept `@CurrentUserId() actorId: string`
 * (for runReconciliation) or `@CurrentUser() principal: AuthenticatedPrincipal`
 * (for getRuns/getReconciledTrades which check roles inline).
 */
describe('BrokerReconciliationController', () => {
  let controller: BrokerReconciliationController;
  const svc = {
    runReconciliation: jest.fn(),
    getRuns: jest.fn(),
    getReconciledTrades: jest.fn(),
  };

  const adminPrincipal: AuthenticatedPrincipal = {
    userId: 'admin-1', email: null, phone: null, roles: [RoleName.ADMIN], status: UserStatus.ACTIVE,
  };
  const superAdminPrincipal: AuthenticatedPrincipal = {
    userId: 'sa-1', email: null, phone: null, roles: [RoleName.SUPER_ADMIN], status: UserStatus.ACTIVE,
  };
  const normalPrincipal: AuthenticatedPrincipal = {
    userId: 'user-1', email: null, phone: null, roles: [RoleName.USER], status: UserStatus.ACTIVE,
  };
  const rolelessPrincipal: AuthenticatedPrincipal = {
    userId: 'user-2', email: null, phone: null, roles: [], status: UserStatus.ACTIVE,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new BrokerReconciliationController(svc as any);
  });

  describe('runReconciliation', () => {
    it('delegates to the service with parsed dates and actor id', () => {
      const dto = {
        userId: 'user-1',
        brokerConnectionId: 'conn-1',
        fromTime: '2026-01-01T00:00:00Z',
        toTime: '2026-02-01T00:00:00Z',
      };
      controller.runReconciliation(dto as any, 'admin-1', { ip: '1.2.3.4' });
      expect(svc.runReconciliation).toHaveBeenCalledWith(
        'user-1',
        'conn-1',
        new Date(dto.fromTime),
        new Date(dto.toTime),
        'admin-1',
        '1.2.3.4',
      );
    });
  });

  describe('getRuns', () => {
    it('admin can query any userId', () => {
      controller.getRuns(adminPrincipal, 'target-user');
      expect(svc.getRuns).toHaveBeenCalledWith('target-user');
    });

    it('super-admin can query any userId', () => {
      controller.getRuns(superAdminPrincipal, 'target-user');
      expect(svc.getRuns).toHaveBeenCalledWith('target-user');
    });

    it('normal user is always scoped to own id (query param ignored)', () => {
      controller.getRuns(normalPrincipal, 'someone-else');
      expect(svc.getRuns).toHaveBeenCalledWith('user-1');
    });

    it('user with no roles is scoped to own id', () => {
      controller.getRuns(rolelessPrincipal, 'someone-else');
      expect(svc.getRuns).toHaveBeenCalledWith('user-2');
    });
  });

  describe('getReconciledTrades', () => {
    it('admin can query any userId and brokerConnectionId', () => {
      controller.getReconciledTrades(adminPrincipal, 'target-user', 'conn-9');
      expect(svc.getReconciledTrades).toHaveBeenCalledWith('target-user', 'conn-9');
    });

    it('normal user querying own id is allowed', () => {
      controller.getReconciledTrades(normalPrincipal, 'user-1', 'conn-1');
      expect(svc.getReconciledTrades).toHaveBeenCalledWith('user-1', 'conn-1');
    });

    it('normal user querying another user id is forbidden', () => {
      expect(() =>
        controller.getReconciledTrades(normalPrincipal, 'someone-else'),
      ).toThrow(ForbiddenException);
      expect(svc.getReconciledTrades).not.toHaveBeenCalled();
    });

    it('normal user with no query userId is scoped to own id', () => {
      controller.getReconciledTrades(normalPrincipal, undefined, 'conn-1');
      expect(svc.getReconciledTrades).toHaveBeenCalledWith('user-1', 'conn-1');
    });
  });
});
