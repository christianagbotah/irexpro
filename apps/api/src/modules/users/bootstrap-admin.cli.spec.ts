import * as fs from 'fs';
import * as path from 'path';

/**
 * Bootstrap CLI script verification tests.
 *
 * Hotfix: the previous version of apps/api/scripts/bootstrap-admin.ts called
 * `app.useGlobalPipes(new ValidationPipe(...))` on the INestApplicationContext
 * returned by NestFactory.createApplicationContext(). That method does NOT
 * exist on INestApplicationContext — it only exists on INestApplication
 * (HTTP apps). This caused TS2339 and the script could not run under ts-node.
 *
 * These tests verify:
 *   1. The script source does NOT call useGlobalPipes (the compile error is fixed).
 *   2. The script source does NOT import ValidationPipe.
 *   3. The script uses NestFactory.createApplicationContext (not create).
 *   4. The script closes the app context in both success and error paths.
 *   5. The script implements dry-run mode (BOOTSTRAP_ADMIN_DRY_RUN).
 *   6. The script never logs the raw password.
 *
 * These are source-level checks because the script is a CLI entry point that
 * boots a real NestJS context + TypeORM connection — running it fully in a
 * unit test would require a real database. The functional behavior of the
 * underlying service is covered by bootstrap-admin.service.spec.ts.
 */
describe('bootstrap-admin.ts CLI script (hotfix — no useGlobalPipes)', () => {
  // The script lives at apps/api/scripts/bootstrap-admin.ts.
  // Jest rootDir is apps/api/src, so __dirname is apps/api/src/modules/users.
  // We resolve the script path relative to the project root (apps/api).
  const scriptPath = path.resolve(__dirname, '../../../scripts/bootstrap-admin.ts');
  let source: string;

  beforeAll(() => {
    expect(fs.existsSync(scriptPath)).toBe(true);
    source = fs.readFileSync(scriptPath, 'utf-8');
  });

  describe('compile error fix (TS2339)', () => {
    it('should NOT call useGlobalPipes (the method that does not exist on INestApplicationContext)', () => {
      // This is the exact line that caused TS2339. It must be gone from CODE.
      // Comments explaining the fix are allowed, but there must be no actual
      // `app.useGlobalPipes(...)` call statement (a line that starts with
      // optional whitespace then `app.useGlobalPipes(`).
      const codeLines = source.split('\n').filter(
        (l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'),
      );
      const codeOnly = codeLines.join('\n');
      expect(codeOnly).not.toMatch(/app\.useGlobalPipes\s*\(/);
    });

    it('should NOT import ValidationPipe', () => {
      // ValidationPipe is an HTTP-pipeline concern; the CLI uses explicit
      // validation via validateBootstrapInput() instead.
      expect(source).not.toMatch(/import.*ValidationPipe/);
    });

    it('should use NestFactory.createApplicationContext (not create)', () => {
      expect(source).toContain('NestFactory.createApplicationContext');
      // Should NOT create a full HTTP app just for seeding
      expect(source).not.toMatch(/NestFactory\.create\(/);
    });
  });

  describe('app context cleanup', () => {
    it('should close the app context in the success path', () => {
      // There must be an app.close() before process.exit(0)
      expect(source).toMatch(/await app\.close\(\)/);
      expect(source).toContain('process.exit(0)');
    });

    it('should close the app context in the error path', () => {
      // The catch block must also close the app before exiting 1
      const catchBlockMatch = source.match(/catch\s*\(err\)\s*\{[\s\S]*?await app\.close\(\)[\s\S]*?process\.exit\(1\)/);
      expect(catchBlockMatch).not.toBeNull();
    });

    it('should close the app context in the dry-run path', () => {
      // The dry-run branch must also close the app before exiting 0
      const dryRunMatch = source.match(/isDryRun[\s\S]*?await app\.close\(\)[\s\S]*?process\.exit\(0\)/);
      expect(dryRunMatch).not.toBeNull();
    });
  });

  describe('dry-run mode', () => {
    it('should check BOOTSTRAP_ADMIN_DRY_RUN env var', () => {
      expect(source).toContain('BOOTSTRAP_ADMIN_DRY_RUN');
    });

    it('should NOT call bootstrapSuperAdmin in dry-run mode', () => {
      // The dry-run branch must return before calling the service.
      // We verify the dry-run block contains a process.exit(0) BEFORE
      // the service call. The service call (bootstrapService.bootstrapSuperAdmin)
      // must be in a separate branch that only runs when !isDryRun.
      const dryRunBlock = source.match(/if\s*\(isDryRun\)\s*\{[\s\S]*?process\.exit\(0\)/);
      expect(dryRunBlock).not.toBeNull();
    });

    it('should print a safe summary in dry-run mode (no password value)', () => {
      // The dry-run summary should mention the password length, not the value
      const dryRunSummary = source.match(/Dry-run validation passed[\s\S]*?process\.exit\(0\)/);
      expect(dryRunSummary).not.toBeNull();
      // Must reference "not printed" or similar for the password
      expect(source).toMatch(/[Pp]assword.*not printed|not print.*password/i);
    });
  });

  describe('password safety (never logged)', () => {
    it('should NOT log the raw password value', () => {
      // The script may log the password LENGTH but never the value itself.
      // Look for any logger.log or console.log that interpolates input.password
      // directly (not .length).
      const dangerousPattern = /logger\.(log|error|warn|debug)\s*\([^)]*\$\{[^}]*password[^}]*\}/;
      // Allow ${input.password.length} but NOT ${input.password} alone
      const lines = source.split('\n');
      for (const line of lines) {
        if (dangerousPattern.test(line)) {
          // Check it's only the .length, not the raw value
          expect(line).toMatch(/password\.length/);
          expect(line).not.toMatch(/\$\{input\.password\}/);
          expect(line).not.toMatch(/\$\{process\.env\.BOOTSTRAP_ADMIN_PASSWORD\}/);
        }
      }
    });

    it('should state that the raw password was not logged', () => {
      expect(source).toMatch(/[Rr]aw password was NOT logged|not.*log.*password/i);
    });
  });

  describe('explicit validation (no ValidationPipe)', () => {
    it('should import validateBootstrapInput', () => {
      expect(source).toContain('validateBootstrapInput');
    });

    it('should call validateBootstrapInput before booting Nest', () => {
      // Validation should happen BEFORE createApplicationContext (fail fast).
      // We look for the actual CALL (not the import or comment mentions).
      const validateCallIdx = source.indexOf('validateBootstrapInput(input)');
      const contextCallIdx = source.indexOf('NestFactory.createApplicationContext(BootstrapAppModule');
      expect(validateCallIdx).toBeGreaterThan(-1);
      expect(contextCallIdx).toBeGreaterThan(-1);
      expect(validateCallIdx).toBeLessThan(contextCallIdx);
    });
  });

  describe('no HTTP listener', () => {
    it('should NOT call app.listen()', () => {
      // The CLI is a one-shot script, not a server
      expect(source).not.toMatch(/app\.listen\(/);
    });
  });
});
