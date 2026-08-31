import * as fs from 'fs';
import * as path from 'path';

/** Source-level guard for the additive account-governance migration. */
describe('Sprint 43 — account governance migration contract', () => {
  const migrationPath = path.join(
    __dirname,
    'migrations',
    '1752600000000-CreateAccountGovernanceSchema.ts',
  );
  const userEntityPath = path.join(
    __dirname,
    '..',
    'modules',
    'users',
    'entities',
    'user.entity.ts',
  );
  const source = fs.readFileSync(migrationPath, 'utf8');
  const userEntitySource = fs.readFileSync(userEntityPath, 'utf8');
  const upSource = source.slice(
    source.indexOf('public async up'),
    source.indexOf('public async down'),
  );
  const downSource = source.slice(source.indexOf('public async down'));

  it('creates an appeal record linked to the existing user without a duplicate identifier store', () => {
    expect(upSource).toMatch(/CREATE TABLE IF NOT EXISTS identity\.account_appeals/i);
    expect(upSource).toMatch(
      /user_id\s+uuid\s+NOT NULL REFERENCES identity\.users\(id\) ON DELETE RESTRICT/i,
    );
    expect(upSource).toMatch(
      /reviewer_user_id\s+uuid REFERENCES identity\.users\(id\) ON DELETE RESTRICT/i,
    );
    expect(upSource).not.toMatch(/\bemail\b/i);
    expect(upSource).not.toMatch(/\bphone\b/i);
  });

  it('enforces a valid review lifecycle and one pending request per account', () => {
    expect(upSource).toContain("status IN ('PENDING', 'RESOLVED')");
    expect(upSource).toContain("decision IN ('REACTIVATE', 'PERMANENTLY_LOCK', 'DELETE')");
    expect(upSource).toContain('chk_account_appeals_resolution_shape');
    expect(upSource).toContain('reviewer_note IS NULL');
    expect(upSource).toContain('uq_account_appeals_one_pending_per_user');
    expect(upSource).toContain('idx_account_appeals_user_status');
    expect(upSource).toMatch(/WHERE status = 'PENDING'/i);
  });

  it('adds the permanent lock state without converting the legacy varchar column to a database enum', () => {
    expect(upSource).toContain('chk_users_account_status');
    expect(upSource).toContain("'PERMANENTLY_LOCKED'");
    expect(upSource).toContain('unexpected existing statuses');
    expect(upSource).not.toMatch(/CREATE\s+TYPE/i);
    expect(upSource).not.toMatch(/ALTER\s+COLUMN\s+\w+\s+TYPE/i);
  });

  it('keeps the User entity aligned to the legacy varchar status column', () => {
    expect(userEntitySource).toMatch(
      /@Column\(\{\s*type:\s*'varchar',\s*length:\s*30,\s*enum:\s*UserStatus,/,
    );
  });

  it('has a reversible, non-cascading down migration', () => {
    expect(downSource).toContain('DROP CONSTRAINT IF EXISTS chk_users_account_status');
    expect(downSource).toContain('DROP TABLE IF EXISTS identity.account_appeals');
    expect(downSource).not.toMatch(/CASCADE/i);
  });
});
