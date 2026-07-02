import { ForbiddenException } from '@nestjs/common';
import { PerformanceBillingController } from './performance-billing.controller';
import { BillingCycleStatus } from './entities/performance-fee-billing-cycle.entity';
import { RoleName } from '../users/entities/role.entity';

const FROM = '2026-01-01T00:00:00Z';
const TO = '2026-05-31T23:59:59Z';

const adminUser = { id: 'admin-1', roles: [RoleName.ADMIN] } as any;
const superAdmin = { id: 'sa-1', roles: [RoleName.SUPER_ADMIN] } as any;
const normalUser = { id: 'user-1', roles: [RoleName.USER] } as any;
const noRoles = { id: 'user-2' } as any;

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
      adminUser,
      { ip: '1.2.3.4' },
    );
    expect(svc.createBillingCycle).toHaveBeenCalledWith(
      'u1', 'c1', new Date(FROM), new Date(TO), 'USD', 'admin-1', '1.2.3.4',
    );
  });

  it('passes null when brokerConnectionId is omitted', () => {
    controller.createCycle(
      { userId: 'u1', periodStart: FROM, periodEnd: TO, currency: 'USD' } as any,
      adminUser,
      {},
    );
    expect(svc.createBillingCycle).toHaveBeenCalledWith(
      'u1', null, new Date(FROM), new Date(TO), 'USD', 'admin-1', undefined,
    );
  });
});

describe('runCycle', () => {
  it('delegates to service with cycleId', () => {
    controller.runCycle('cycle-1', adminUser, { ip: '5.5.5.5' });
    expect(svc.runBillingCycle).toHaveBeenCalledWith('cycle-1', 'admin-1', '5.5.5.5');
  });
});

describe('runDirect', () => {
  it('delegates to runBillingCycleForUserPeriod', () => {
    controller.runDirect(
      { userId: 'u1', brokerConnectionId: 'c1', periodStart: FROM, periodEnd: TO, currency: 'EUR' },
      superAdmin,
      {},
    );
    expect(svc.runBillingCycleForUserPeriod).toHaveBeenCalledWith(
      'u1', 'c1', new Date(FROM), new Date(TO), 'EUR', 'sa-1', undefined,
    );
  });
});

describe('listCycles', () => {
  it('admin can list with any userId', () => {
    controller.listCycles(adminUser, 'target-user', undefined);
    expect(svc.listBillingCycles).toHaveBeenCalledWith({ userId: 'target-user', status: undefined });
  });

  it('super-admin can list with any userId', () => {
    controller.listCycles(superAdmin, 'any-user', BillingCycleStatus.INVOICED);
    expect(svc.listBillingCycles).toHaveBeenCalledWith({
      userId: 'any-user', status: BillingCycleStatus.INVOICED,
    });
  });

  it('normal user with no queryUserId is scoped to own id', () => {
    controller.listCycles(normalUser, undefined, undefined);
    expect(svc.listBillingCycles).toHaveBeenCalledWith({ userId: 'user-1', status: undefined });
  });

  it('normal user cannot read another user\'s cycles (ForbiddenException)', () => {
    expect(() => {
      controller.listCycles(normalUser, 'other-user', undefined);
    }).toThrow(ForbiddenException);
    expect(svc.listBillingCycles).not.toHaveBeenCalled();
  });

  it('user with no roles is scoped to own id', () => {
    controller.listCycles(noRoles, undefined, undefined);
    expect(svc.listBillingCycles).toHaveBeenCalledWith({ userId: 'user-2', status: undefined });
  });
});

describe('getCycle', () => {
  it('admin can get any cycle', async () => {
    svc.getBillingCycle.mockResolvedValue({ id: 'cycle-1', userId: 'other-user' });
    const result = await controller.getCycle('cycle-1', adminUser);
    expect(result.id).toBe('cycle-1');
  });

  it('normal user can get own cycle', async () => {
    svc.getBillingCycle.mockResolvedValue({ id: 'cycle-1', userId: 'user-1' });
    const result = await controller.getCycle('cycle-1', normalUser);
    expect(result.id).toBe('cycle-1');
  });

  it('normal user cannot get another user\'s cycle', async () => {
    svc.getBillingCycle.mockResolvedValue({ id: 'cycle-2', userId: 'other-user' });
    await expect(controller.getCycle('cycle-2', normalUser)).rejects.toThrow(ForbiddenException);
  });
});

describe('cancelCycle', () => {
  it('admin can cancel a cycle', () => {
    controller.cancelCycle('cycle-1', { reason: 'Admin decision' }, adminUser, {});
    expect(svc.cancelBillingCycle).toHaveBeenCalledWith('cycle-1', 'Admin decision', 'admin-1', undefined);
  });
});
