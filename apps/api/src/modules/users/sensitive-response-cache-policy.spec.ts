import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readController(name: string): string {
  return readFileSync(resolve(__dirname, name), 'utf8');
}

function routeDecoratorBlock(source: string, routeDecorator: string, methodName: string): string {
  const start = source.indexOf(routeDecorator);
  const asyncMethod = source.indexOf(`async ${methodName}(`, start);
  const syncMethod = source.indexOf(`${methodName}(`, start);
  const end = asyncMethod >= 0 ? asyncMethod : syncMethod;

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}

function expectNoStorePolicy(block: string): void {
  expect(block).toContain("@Header('Cache-Control', 'no-store')");
  expect(block).toContain("@Header('Pragma', 'no-cache')");
}

describe('sensitive user/account response cache policy', () => {
  const users = readController('users.controller.ts');
  const eligibility = readController('eligibility.controller.ts');
  const governance = readController('account-governance.controller.ts');

  it.each([
    ["@Get('users/me')", 'getMe'],
    ["@Patch('users/me')", 'updateMe'],
    ["@Get('users/me/onboarding-status')", 'getOnboardingStatus'],
    ["@Get('admin/users')", 'listUsers'],
    ["@Get('admin/users/:id')", 'getUserById'],
    ["@Get('admin/users/:id/onboarding-status')", 'getUserOnboardingStatus'],
  ])('marks UsersController route %s non-cacheable', (route, method) => {
    expectNoStorePolicy(routeDecoratorBlock(users, route, method));
  });

  it.each([
    ["@Get('users/me/eligibility')", 'getMyEligibility'],
    ["@Post('users/me/eligibility/disclosures')", 'acceptDisclosures'],
    ["@Get('admin/eligibility/reviews')", 'listReviews'],
    ["@Post('admin/eligibility/users/:id/review')", 'reviewUser'],
    ["@Get('admin/identity/kyc/reviews')", 'listKycReviews'],
    ["@Post('admin/identity/users/:id/kyc-review')", 'reviewKyc'],
  ])('marks EligibilityController route %s non-cacheable', (route, method) => {
    expectNoStorePolicy(routeDecoratorBlock(eligibility, route, method));
  });

  it.each([
    ["@Get('admin/account-appeals')", 'listAppeals'],
    ["@Post('admin/account-appeals/:id/resolve')", 'resolveAppeal'],
    ["@Patch('admin/users/:id/account-status')", 'updateAccountStatus'],
  ])('marks AccountGovernanceController route %s non-cacheable', (route, method) => {
    expectNoStorePolicy(routeDecoratorBlock(governance, route, method));
  });

  it('leaves the public generic account-appeal acknowledgement unchanged', () => {
    const block = routeDecoratorBlock(governance, "@Post('account-appeals')", 'submitAppeal');
    expect(block).not.toContain("@Header('Cache-Control', 'no-store')");
    expect(block).not.toContain("@Header('Pragma', 'no-cache')");
  });
});
