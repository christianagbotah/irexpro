import { ForbiddenException } from '@nestjs/common';
import { BrokerReconciliationController } from './broker-reconciliation.controller';
import { RoleName } from '../users/entities/role.entity';

/**
 * Unit tests for BrokerReconciliationController access-control logic.
 *
 * The @Roles(ADMIN, SUPER_ADMIN) decorator on the run endpoint is enforced by
 * RolesGuard at the routing layer; these tests cover the in-handler scoping
 * that prevents normal users from reading another user's data.
 */
describe('BrokerReconciliationController', () => {
  let controller: BrokerReconciliationController;
  const svc = {
    runReconciliation: jest.fn(),
    getRuns: jest.fn(),
    getReconciledTrades: jest.fn(),
  };

  const adminUser = { id: 'admin-1', roles: [RoleName.ADMIN] } as any;
  const superAdminUser = { id: 'sa-1', roles: [RoleName.SUPER_ADMIN] } as any;
  const normalUser = { id: 'user-1', roles: [RoleName.USER] } as any;
  const rolelessUser = { id: 'user-2' } as any;

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
      controller.runReconciliation(dto as any, adminUser, { ip: '1.2.3.4' });
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
      controller.getRuns(adminUser, 'target-user');
      expect(svc.getRuns).toHaveBeenCalledWith('target-user');
    });

    it('super-admin can query any userId', () => {
      controller.getRuns(superAdminUser, 'target-user');
      expect(svc.getRuns).toHaveBeenCalledWith('target-user');
    });

    it('normal user is always scoped to own id (query param ignored)', () => {
      controller.getRuns(normalUser, 'someone-else');
      expect(svc.getRuns).toHaveBeenCalledWith('user-1');
    });

    it('user with no roles is scoped to own id', () => {
      controller.getRuns(rolelessUser, 'someone-else');
      expect(svc.getRuns).toHaveBeenCalledWith('user-2');
    });
  });

  describe('getReconciledTrades', () => {
    it('admin can query any userId and brokerConnectionId', () => {
      controller.getReconciledTrades(adminUser, 'target-user', 'conn-9');
      expect(svc.getReconciledTrades).toHaveBeenCalledWith('target-user', 'conn-9');
    });

    it('normal user querying own id is allowed', () => {
      controller.getReconciledTrades(normalUser, 'user-1', 'conn-1');
      expect(svc.getReconciledTrades).toHaveBeenCalledWith('user-1', 'conn-1');
    });

    it('normal user querying another user id is forbidden', () => {
      expect(() =>
        controller.getReconciledTrades(normalUser, 'someone-else'),
      ).toThrow(ForbiddenException);
      expect(svc.getReconciledTrades).not.toHaveBeenCalled();
    });

    it('normal user with no query userId is scoped to own id', () => {
      controller.getReconciledTrades(normalUser, undefined, 'conn-1');
      expect(svc.getReconciledTrades).toHaveBeenCalledWith('user-1', 'conn-1');
    });
  });
});
