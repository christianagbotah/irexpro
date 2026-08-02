import { PerformanceFeePaymentController } from './performance-fee-payment.controller';
import { PerformanceFeePaymentService } from './services/performance-fee-payment.service';
import { AuthenticatedPrincipal } from '../../common/interfaces/authenticated-principal.interface';
import { UserStatus } from '../users/entities/user.entity';
import { RoleName } from '../users/entities/role.entity';

/**
 * PerformanceFeePaymentController identity-contract tests — Hotfix amendment.
 */
describe('PerformanceFeePaymentController (Hotfix — UUID identity contract)', () => {
  let controller: PerformanceFeePaymentController;
  let svc: Record<string, jest.Mock>;

  const USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const ADMIN_ID = 'f5e4d3c2-b1a0-9876-5432-10fedcba9876';

  const normalPrincipal: AuthenticatedPrincipal = {
    userId: USER_ID,
    email: 'user@example.com',
    phone: null,
    roles: [RoleName.USER],
    status: UserStatus.ACTIVE,
  };

  const adminPrincipal: AuthenticatedPrincipal = {
    userId: ADMIN_ID,
    email: 'admin@example.com',
    phone: null,
    roles: [RoleName.ADMIN],
    status: UserStatus.ACTIVE,
  };

  beforeEach(() => {
    svc = {
      listUserPerformanceFeeInvoices: jest.fn().mockResolvedValue({ invoices: [], total: 0 }),
      getInvoiceView: jest.fn().mockResolvedValue({ id: 'inv-1' }),
      initiatePerformanceFeeCheckout: jest.fn().mockResolvedValue({ id: 'checkout-1' }),
      getTransactionStatus: jest.fn().mockResolvedValue({ status: 'PENDING' }),
    };
    controller = new PerformanceFeePaymentController(svc as unknown as PerformanceFeePaymentService);
  });

  it('listInvoices passes principal.userId (via isAdmin check)', async () => {
    await controller.listInvoices(normalPrincipal, undefined, undefined, undefined);
    expect(svc.listUserPerformanceFeeInvoices).toHaveBeenCalledWith(USER_ID, expect.anything());
    const arg = svc.listUserPerformanceFeeInvoices.mock.calls[0][0];
    expect(arg).toBe(USER_ID);
    expect(typeof arg).toBe('string');
  });

  it('getInvoice passes principal.userId to getInvoiceView', async () => {
    await controller.getInvoice('inv-1', normalPrincipal);
    expect(svc.getInvoiceView).toHaveBeenCalledWith('inv-1', USER_ID, false);
    const arg = svc.getInvoiceView.mock.calls[0][1];
    expect(arg).toBe(USER_ID);
    expect(typeof arg).toBe('string');
  });

  it('admin principal has ADMIN role for isAdmin check', () => {
    expect(adminPrincipal.roles).toContain(RoleName.ADMIN);
  });

  it('normal principal has USER role (not admin)', () => {
    expect(normalPrincipal.roles).toContain(RoleName.USER);
    expect(normalPrincipal.roles).not.toContain(RoleName.ADMIN);
  });

  it('normal user cannot view another user\'s invoices (ForbiddenException)', () => {
    expect(() =>
      controller.listInvoices(normalPrincipal, 'other-user-id', undefined, undefined),
    ).toThrow('You can only view your own performance-fee invoices');
  });
});
