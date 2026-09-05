import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, 'auth.controller.ts'), 'utf8');

function routeDecoratorBlock(routeDecorator: string, methodName: string): string {
  const start = source.indexOf(routeDecorator);
  const end = source.indexOf(`async ${methodName}(`, start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}

function expectNoStorePolicy(block: string): void {
  expect(block).toContain("@Header('Cache-Control', 'no-store')");
  expect(block).toContain("@Header('Pragma', 'no-cache')");
}

describe('AuthController sensitive response cache policy', () => {
  it('marks the authenticated identity response non-cacheable', () => {
    expectNoStorePolicy(routeDecoratorBlock("@Get('me')", 'me'));
  });

  it.each([
    ["@Post('register')", 'register'],
    ["@Post('login')", 'login'],
    ["@Post('refresh')", 'refresh'],
    ["@Post('mfa/setup')", 'beginMfaSetup'],
  ])('retains no-store/no-cache on existing sensitive endpoint %s', (route, method) => {
    expectNoStorePolicy(routeDecoratorBlock(route, method));
  });
});
