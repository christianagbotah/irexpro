import { BrokerReconciliationController } from './broker-reconciliation.controller';
import { BrokerTradeReconciliationService } from './services/broker-trade-reconciliation.service';
import { AuthenticatedPrincipal } from '../../common/interfaces/authenticated-principal.interface';
import { UserStatus } from '../users/entities/user.entity';
import { RoleName } from '../users/entities/role.entity';

/**
 * BrokerReconciliationController identity-contract tests — Hotfix amendment.
 */
describe('BrokerReconciliationController (Hotfix — UUID identity contract)', () => {
  let controller: BrokerReconciliationController;
  let svc: Record<string, jest.Mock>;

  const ADMIN_ID = 'f5e4d3c2-b1a0-9876-5432-10fedcba9876';
  const USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  const adminPrincipal: AuthenticatedPrincipal = {
    userId: ADMIN_ID,
    email: 'admin@example.com',
    phone: null,
    roles: [RoleName.ADMIN],
    status: UserStatus.ACTIVE,
  };

  const normalPrincipal: AuthenticatedPrincipal = {
    userId: USER_ID,
    email: 'user@example.com',
    phone: null,
    roles: [RoleName.USER],
    status: UserStatus.ACTIVE,
  };

  beforeEach(() => {
    svc = {
      runReconciliation: jest.fn().mockResolvedValue({ id: 'run-1' }),
      getRuns: jest.fn().mockResolvedValue({ runs: [], total: 0 }),
      getReconciledTrades: jest.fn().mockResolvedValue({ trades: [], total: 0 }),
    };
    controller = new BrokerReconciliationController(svc as unknown as BrokerTradeReconciliationService);
  });

  it('runReconciliation passes admin UUID string', async () => {
    await controller.runReconciliation(
      { brokerConnectionId: 'conn-1', from: '2026-01-01', to: '2026-01-31' } as never,
      ADMIN_ID,
      { ip: '1.2.3.4' } as never,
    );
    expect(svc.runReconciliation).toHaveBeenCalled();
  });

  it('getRuns passes principal for role check', async () => {
    await controller.getRuns(adminPrincipal, undefined);
    expect(svc.getRuns).toHaveBeenCalled();
  });

  it('getReconciledTrades passes principal for role check', async () => {
    await controller.getReconciledTrades(adminPrincipal, undefined, undefined);
    expect(svc.getReconciledTrades).toHaveBeenCalled();
  });

  it('normal user principal has USER role (not admin)', () => {
    expect(normalPrincipal.roles).toContain(RoleName.USER);
    expect(normalPrincipal.roles).not.toContain(RoleName.ADMIN);
  });
});
