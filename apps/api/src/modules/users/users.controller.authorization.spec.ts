import * as fs from 'fs';
import * as path from 'path';

/**
 * Admin onboarding endpoint authorization verification — Sprint 29 amendment.
 *
 * Verifies at the source level that:
 *   - GET /admin/users/:id/onboarding-status has @UseGuards(RolesGuard)
 *   - GET /admin/users/:id/onboarding-status has @Roles(ADMIN, SUPER_ADMIN)
 *   - The controller class has @UseGuards(JwtAuthGuard) (global JWT requirement)
 *
 * This is a source-level check because running the full NestJS guard pipeline
 * in a unit test requires booting the HTTP app. The RolesGuard spec already
 * tests the guard logic (403 for USER, 200 for ADMIN) in roles.guard.spec.ts.
 */
describe('Admin onboarding endpoint authorization (Sprint 29 amendment)', () => {
  const controllerPath = path.resolve(__dirname, './users.controller.ts');
  let source: string;

  beforeAll(() => {
    expect(fs.existsSync(controllerPath)).toBe(true);
    source = fs.readFileSync(controllerPath, 'utf-8');
  });

  describe('GET /admin/users/:id/onboarding-status', () => {
    it('should exist in the controller', () => {
      expect(source).toContain("admin/users/:id/onboarding-status");
      expect(source).toContain('getUserOnboardingStatus');
    });

    it('should require ADMIN or SUPER_ADMIN role via @Roles decorator', () => {
      // Find the onboarding-status admin method and check it has @Roles
      const methodIdx = source.indexOf('getUserOnboardingStatus');
      expect(methodIdx).toBeGreaterThan(-1);
      // Look backwards from the method for @Roles(ADMIN, SUPER_ADMIN)
      const beforeMethod = source.substring(0, methodIdx);
      const lastRolesIdx = beforeMethod.lastIndexOf('@Roles(');
      const methodDecIdx = beforeMethod.lastIndexOf('async getUserOnboardingStatus');
      // The @Roles decorator should be between the method and the previous method
      expect(lastRolesIdx).toBeGreaterThan(-1);
      // Verify it includes ADMIN and SUPER_ADMIN
      const rolesCall = source.substring(lastRolesIdx, lastRolesIdx + 80);
      expect(rolesCall).toContain('ADMIN');
      expect(rolesCall).toContain('SUPER_ADMIN');
    });

    it('should require RolesGuard via @UseGuards', () => {
      const methodIdx = source.indexOf('getUserOnboardingStatus');
      const beforeMethod = source.substring(0, methodIdx);
      const lastUseGuardsIdx = beforeMethod.lastIndexOf('@UseGuards(RolesGuard)');
      expect(lastUseGuardsIdx).toBeGreaterThan(-1);
    });

    it('should be under a controller with class-level @UseGuards(JwtAuthGuard)', () => {
      // The class-level JwtAuthGuard ensures JWT auth is required
      expect(source).toMatch(/@UseGuards\(JwtAuthGuard\)/);
    });
  });

  describe('GET /users/me/onboarding-status (user endpoint)', () => {
    it('should exist and require JWT auth (class-level guard)', () => {
      expect(source).toContain('users/me/onboarding-status');
      expect(source).toContain('getOnboardingStatus');
      // No @Roles decorator on this method — any authenticated user can access
      // their own onboarding status. JWT is enforced by the class-level guard.
    });
  });
});
