import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { CheckoutDto, CancelSubscriptionDto } from './dto/checkout.dto';
import { ManualActivateDto } from './dto/manual-activate.dto';
import { AuthenticatedPrincipal } from '../../common/interfaces/authenticated-principal.interface';
import { UserStatus } from '../users/entities/user.entity';

/**
 * SubscriptionsController identity-contract tests — Hotfix amendment.
 */
describe('SubscriptionsController (Hotfix — UUID identity contract)', () => {
  let controller: SubscriptionsController;
  let svc: Record<string, jest.Mock>;

  const USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const ADMIN_ID = 'f5e4d3c2-b1a0-9876-5432-10fedcba9876';

  const principal: AuthenticatedPrincipal = {
    userId: USER_ID,
    email: 'user@example.com',
    phone: '+233243618186',
    roles: ['USER'],
    status: UserStatus.ACTIVE,
  };

  beforeEach(() => {
    svc = {
      findUserSubscription: jest.fn().mockResolvedValue(null),
      initiateCheckout: jest.fn().mockResolvedValue({ id: 'inv-1' }),
      cancelSubscription: jest.fn().mockResolvedValue({}),
      manualActivate: jest.fn().mockResolvedValue({}),
      manuallyActivate: jest.fn().mockResolvedValue({}),
    };
    controller = new SubscriptionsController(svc as unknown as SubscriptionsService);
  });

  it('getMySubscription passes UUID string', async () => {
    await controller.getMySubscription(USER_ID);
    expect(svc.findUserSubscription).toHaveBeenCalledWith(USER_ID);
    expect(typeof svc.findUserSubscription.mock.calls[0][0]).toBe('string');
  });

  it('checkout passes principal.userId (not the full principal)', async () => {
    const dto: CheckoutDto = { planId: 'plan-1', currency: 'USD' };
    await controller.checkout(dto, principal, { ip: '1.2.3.4' } as never, undefined);
    expect(svc.initiateCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, email: 'user@example.com' }),
    );
    // Verify the service didn't receive the raw principal object as userId
    const callArg = svc.initiateCheckout.mock.calls[0][0];
    expect(callArg.userId).toBe(USER_ID);
    expect(typeof callArg.userId).toBe('string');
  });

  it('cancelSubscription passes UUID string', async () => {
    const dto: CancelSubscriptionDto = { reason: 'test' };
    await controller.cancelSubscription(dto, USER_ID, { ip: '1.2.3.4' } as never);
    expect(svc.cancelSubscription).toHaveBeenCalledWith(USER_ID, 'test', '1.2.3.4');
    expect(typeof svc.cancelSubscription.mock.calls[0][0]).toBe('string');
  });

  it('manualActivate passes admin UUID string', async () => {
    const dto: ManualActivateDto = { userId: USER_ID, planId: 'plan-1' };
    await controller.manualActivate(dto, ADMIN_ID, { ip: '1.2.3.4' } as never);
    expect(svc.manualActivate).toHaveBeenCalledWith(USER_ID, 'plan-1', ADMIN_ID, '1.2.3.4');
    expect(typeof svc.manualActivate.mock.calls[0][2]).toBe('string');
  });
});
