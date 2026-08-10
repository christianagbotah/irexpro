import { SubscriptionsController } from './subscriptions.controller';
import { AuthenticatedPrincipal } from '../../common/interfaces/authenticated-principal.interface';
import { UserStatus } from '../users/entities/user.entity';

/**
 * Hotfix: controller methods now accept `@CurrentUserId() userId: string` and
 * `@CurrentUser() principal: AuthenticatedPrincipal` instead of `@CurrentUser()
 * user: User`. Tests pass a sanitized principal (or UUID string) directly.
 */
function principal(): AuthenticatedPrincipal {
  return {
    userId: 'user-1',
    email: 'user@test.com',
    phone: null,
    roles: [],
    status: UserStatus.ACTIVE,
  };
}

function reqWithIp(ip = '1.2.3.4') {
  return { ip } as any;
}

let svc: any;
let controller: SubscriptionsController;

beforeEach(() => {
  svc = {
    findActivePlans: jest.fn(async () => []),
    findUserSubscription: jest.fn(async () => null),
    initiateCheckout: jest.fn(async () => ({})),
    cancelSubscription: jest.fn(async () => ({})),
    manualActivate: jest.fn(async () => ({})),
  };
  controller = new SubscriptionsController(svc);
});

describe('SubscriptionsController#checkout — Idempotency-Key header/body precedence (Sprint 16 audit)', () => {
  const baseDto = { planId: 'plan-1', currency: 'USD', countryCode: 'US' };

  it('uses the Idempotency-Key header when both header and body field are present', async () => {
    await controller.checkout(
      { ...baseDto, idempotencyKey: 'body-key' },
      principal(),
      reqWithIp(),
      'header-key',
    );

    expect(svc.initiateCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'header-key' }),
    );
  });

  it('falls back to the body idempotencyKey field when no header is present', async () => {
    await controller.checkout(
      { ...baseDto, idempotencyKey: 'body-key' },
      principal(),
      reqWithIp(),
      undefined,
    );

    expect(svc.initiateCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'body-key' }),
    );
  });

  it('falls back to the body field when the header is an empty/whitespace-only string', async () => {
    // Audit fix: a proxy/client sending an empty header must not silently shadow a
    // valid body-supplied idempotency key.
    await controller.checkout(
      { ...baseDto, idempotencyKey: 'body-key' },
      principal(),
      reqWithIp(),
      '   ',
    );

    expect(svc.initiateCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'body-key' }),
    );
  });

  it('passes undefined when neither header nor body field is present', async () => {
    await controller.checkout({ ...baseDto }, principal(), reqWithIp(), undefined);

    expect(svc.initiateCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: undefined }),
    );
  });

  it('defaults countryCode to US when omitted, and forwards userId/email/ip/provider correctly', async () => {
    await controller.checkout(
      { planId: 'plan-2', currency: 'GHS' },
      principal(),
      reqWithIp('9.9.9.9'),
      undefined,
    );

    expect(svc.initiateCheckout).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'user@test.com',
      planId: 'plan-2',
      currency: 'GHS',
      countryCode: 'US',
      provider: undefined,
      ipAddress: '9.9.9.9',
      idempotencyKey: undefined,
    });
  });
});

describe('SubscriptionsController#cancelSubscription', () => {
  it('delegates to the service with userId, reason, and ip', async () => {
    await controller.cancelSubscription({ reason: 'no longer needed' }, 'user-1', reqWithIp());
    expect(svc.cancelSubscription).toHaveBeenCalledWith('user-1', 'no longer needed', '1.2.3.4');
  });
});
