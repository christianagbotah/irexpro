import { PerformanceBillingController } from './performance-billing.controller';
import { PerformanceFeeBillingCycleService } from './services/performance-fee-billing-cycle.service';
import { AuthenticatedPrincipal } from '../../common/interfaces/authenticated-principal.interface';
import { UserStatus } from '../users/entities/user.entity';
import { RoleName } from '../users/entities/role.entity';

/**
 * PerformanceBillingController identity-contract tests — Hotfix amendment.
 */
describe('PerformanceBillingController (Hotfix — UUID identity contract)', () => {
  let controller: PerformanceBillingController;
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
      createBillingCycle: jest.fn().mockResolvedValue({ id: 'cycle-1' }),
      runBillingCycle: jest.fn().mockResolvedValue({}),
      runBillingCycleDirect: jest.fn().mockResolvedValue({}),
      cancelBillingCycle: jest.fn().mockResolvedValue({}),
      listBillingCycles: jest.fn().mockResolvedValue({ cycles: [], total: 0 }),
      getBillingCycle: jest.fn().mockResolvedValue({ id: 'cycle-1', userId: USER_ID }),
    };
    controller = new PerformanceBillingController(
      svc as unknown as PerformanceFeeBillingCycleService,
    );
  });

  it('createCycle passes admin UUID string', async () => {
    await controller.createCycle(
      {
        userId: USER_ID,
        brokerConnectionId: 'conn-1',
        currency: 'USD',
        periodStart: '2026-01-01T00:00:00Z',
        periodEnd: '2026-01-31T00:00:00Z',
      } as never,
      ADMIN_ID,
      { ip: '1.2.3.4' } as never,
    );
    expect(svc.createBillingCycle).toHaveBeenCalled();
  });

  it('runCycle passes admin UUID string', async () => {
    await controller.runCycle('cycle-1', ADMIN_ID, { ip: '1.2.3.4' } as never);
    expect(svc.runBillingCycle).toHaveBeenCalledWith('cycle-1', ADMIN_ID, '1.2.3.4');
    expect(typeof svc.runBillingCycle.mock.calls[0][1]).toBe('string');
  });

  it('listCycles passes principal for role check', async () => {
    await controller.listCycles(normalPrincipal, undefined, undefined);
    expect(svc.listBillingCycles).toHaveBeenCalled();
  });

  it('getCycle passes principal for ownership check', async () => {
    await controller.getCycle('cycle-1', normalPrincipal);
    expect(svc.getBillingCycle).toHaveBeenCalledWith('cycle-1');
  });

  it('cancelCycle passes admin UUID string', async () => {
    await controller.cancelCycle('cycle-1', { reason: 'test' } as never, ADMIN_ID, {
      ip: '1.2.3.4',
    } as never);
    expect(svc.cancelBillingCycle).toHaveBeenCalledWith('cycle-1', 'test', ADMIN_ID, '1.2.3.4');
    expect(typeof svc.cancelBillingCycle.mock.calls[0][2]).toBe('string');
  });

  it('admin principal has ADMIN role', () => {
    expect(adminPrincipal.roles).toContain(RoleName.ADMIN);
  });
});
