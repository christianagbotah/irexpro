import { ForbiddenException } from '@nestjs/common';
import { PerformanceBillingController } from './performance-billing.controller';
import { BillingCycleStatus } from './entities/performance-fee-billing-cycle.entity';
import { RoleName } from '../users/entities/role.entity';
import { UserStatus } from '../users/entities/user.entity';
import { AuthenticatedPrincipal } from '../../common/interfaces/authenticated-principal.interface';

const FROM = '2026-01-01T00:00:00Z';
const TO = '2026-05-31T23:59:59Z';

/**
 * Hotfix: controller methods now accept `@CurrentUserId() actorId: string`
 * (for id-only methods) or `@CurrentUser() principal: AuthenticatedPrincipal`
 * (for methods that also check roles via isAdmin()).
 */
const adminPrincipal: AuthenticatedPrincipal = {
  userId: 'admin-1', email: null, phone: null, roles: [RoleName.ADMIN], status: UserStatus.ACTIVE,
};
const superAdminPrincipal: AuthenticatedPrincipal = {
  userId: 'sa-1', email: null, phone: null, roles: [RoleName.SUPER_ADMIN], status: UserStatus.ACTIVE,
};
const normalPrincipal: AuthenticatedPrincipal = {
  userId: 'user-1', email: null, phone: null, roles: [RoleName.USER], status: UserStatus.ACTIVE,
};
const noRolesPrincipal: AuthenticatedPrincipal = {
  userId: 'user-2', email: null, phone: null, roles: [], status: UserStatus.ACTIVE,
};

const svc = {
  createBillingCycle: jest.fn(),
  runBillingCycle: jest.fn(),
  runBillingCycleForUserPeriod: jest.fn(),
  getBillingCycle: jest.fn(),
  listBillingCycles: jest.fn(),
  cancelBillingCycle: jest.fn(),
};

let controller: PerformanceBillingController;

beforeEach(() => {
  jest.clearAllMocks();
  controller = new PerformanceBillingController(svc as any);
});

describe('createCycle', () => {
  it('delegates to service with parsed dates', () => {
    controller.createCycle(
      { userId: 'u1', brokerConnectionId: 'c1', periodStart: FROM, periodEnd: TO, currency: 'USD' },
      'admin-1',
      { ip: '1.2.3.4' },
    );
    expect(svc.createBillingCycle).toHaveBeenCalledWith(
      'u1', 'c1', new Date(FROM), new Date(TO), 'USD', 'admin-1', '1.2.3.4',
    );
  });

  it('passes null when brokerConnectionId is omitted', () => {
    controller.createCycle(
      { userId: 'u1', periodStart: FROM, periodEnd: TO, currency: 'USD' } as any,
      'admin-1',
      {},
    );
    expect(svc.createBillingCycle).toHaveBeenCalledWith(
      'u1', null, new Date(FROM), new Date(TO), 'USD', 'admin-1', undefined,
    );
  });
});

describe('runCycle', () => {
  it('delegates to service with cycleId', () => {
    controller.runCycle('cycle-1', 'admin-1', { ip: '5.5.5.5' });
    expect(svc.runBillingCycle).toHaveBeenCalledWith('cycle-1', 'admin-1', '5.5.5.5');
  });
});

describe('runDirect', () => {
  it('delegates to runBillingCycleForUserPeriod', () => {
    controller.runDirect(
      { userId: 'u1', brokerConnectionId: 'c1', periodStart: FROM, periodEnd: TO, currency: 'EUR' },
      'sa-1',
      {},
    );
    expect(svc.runBillingCycleForUserPeriod).toHaveBeenCalledWith(
      'u1', 'c1', new Date(FROM), new Date(TO), 'EUR', 'sa-1', undefined,
    );
  });
});

describe('listCycles', () => {
  it('admin can list with any userId', () => {
    controller.listCycles(adminPrincipal, 'target-user', undefined);
    expect(svc.listBillingCycles).toHaveBeenCalledWith({ userId: 'target-user', status: undefined });
  });

  it('super-admin can list with any userId', () => {
    controller.listCycles(superAdminPrincipal, 'any-user', BillingCycleStatus.INVOICED);
    expect(svc.listBillingCycles).toHaveBeenCalledWith({
      userId: 'any-user', status: BillingCycleStatus.INVOICED,
    });
  });

  it('normal user with no queryUserId is scoped to own id', () => {
    controller.listCycles(normalPrincipal, undefined, undefined);
    expect(svc.listBillingCycles).toHaveBeenCalledWith({ userId: 'user-1', status: undefined });
  });

  it('normal user cannot read another user\'s cycles (ForbiddenException)', () => {
    expect(() => {
      controller.listCycles(normalPrincipal, 'other-user', undefined);
    }).toThrow(ForbiddenException);
    expect(svc.listBillingCycles).not.toHaveBeenCalled();
  });

  it('user with no roles is scoped to own id', () => {
    controller.listCycles(noRolesPrincipal, undefined, undefined);
    expect(svc.listBillingCycles).toHaveBeenCalledWith({ userId: 'user-2', status: undefined });
  });
});

describe('getCycle', () => {
  it('admin can get any cycle', async () => {
    svc.getBillingCycle.mockResolvedValue({ id: 'cycle-1', userId: 'other-user' });
    const result = await controller.getCycle('cycle-1', adminPrincipal);
    expect(result.id).toBe('cycle-1');
  });

  it('normal user can get own cycle', async () => {
    svc.getBillingCycle.mockResolvedValue({ id: 'cycle-1', userId: 'user-1' });
    const result = await controller.getCycle('cycle-1', normalPrincipal);
    expect(result.id).toBe('cycle-1');
  });

  it('normal user cannot get another user\'s cycle', async () => {
    svc.getBillingCycle.mockResolvedValue({ id: 'cycle-2', userId: 'other-user' });
    await expect(controller.getCycle('cycle-2', normalPrincipal)).rejects.toThrow(ForbiddenException);
  });
});

describe('cancelCycle', () => {
  it('admin can cancel a cycle', () => {
    controller.cancelCycle('cycle-1', { reason: 'Admin decision' }, 'admin-1', {});
    expect(svc.cancelBillingCycle).toHaveBeenCalledWith('cycle-1', 'Admin decision', 'admin-1', undefined);
  });
});
