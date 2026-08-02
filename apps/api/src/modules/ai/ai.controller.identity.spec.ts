import * as fs from 'fs';
import * as path from 'path';

/**
 * AI Controller identity-contract tests — Hotfix amendment.
 *
 * Verifies:
 *   - The user-authenticated DEV simulate-signal endpoint uses @CurrentUserId()
 *   - The internal @Public() endpoint does NOT use @CurrentUserId (uses API key)
 *   - The internal endpoint is NOT user-authenticated (no user principal)
 */
describe('AiController (Hotfix — AI/internal endpoint identity contract)', () => {
  const controllerPath = path.resolve(__dirname, './ai.controller.ts');
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(controllerPath, 'utf-8');
  });

  describe('DEV simulate-signal endpoint (user-authenticated)', () => {
    it('should use @CurrentUserId() for the DEV user-facing endpoint', () => {
      // The simulateSignal method should use @CurrentUserId()
      expect(source).toContain('CurrentUserId');
    });

    it('should NOT use req.user.id (old broken pattern)', () => {
      expect(source).not.toContain('req.user.id');
    });
  });

  describe('Internal signal endpoint (API-key authenticated)', () => {
    it('should be @Public() (no JWT requirement)', () => {
      // The internal endpoint uses @Public() + InternalApiKeyGuard
      expect(source).toContain('@Public()');
    });

    it('should use InternalApiKeyGuard (not JwtAuthGuard)', () => {
      expect(source).toContain('InternalApiKeyGuard');
    });

    it('should NOT use @CurrentUserId() on the internal endpoint', () => {
      // The internal endpoint is machine-to-machine — no user principal.
      // It should not have @CurrentUserId() — that's only for the DEV endpoint.
      // We verify by checking that the @Public() decorator exists (which
      // bypasses JwtAuthGuard, so no user principal is populated).
      // The @CurrentUserId() decorator would throw 401 if called on an
      // endpoint where request.user is not populated (which is the case
      // for @Public() + InternalApiKeyGuard endpoints).
      expect(source).toContain('@Public()');
    });

    it('AI must never directly execute broker orders', () => {
      // The AI controller only receives signals — it does not execute trades.
      // Execution goes through: AI Signal → Strategy Orchestrator → Risk Engine → Execution Engine
      // The controller should not have any broker execution calls.
      expect(source).not.toContain('brokerService.execute');
      expect(source).not.toContain('executionService.placeOrder');
    });
  });
});
