import * as fs from 'fs';
import * as path from 'path';

describe('Sprint 45 — age and KYC readiness migration contract', () => {
  const migrationPath = path.join(
    __dirname,
    'migrations',
    '1752800000000-CreateAgeKycReadinessGate.ts',
  );
  const source = fs.readFileSync(migrationPath, 'utf8');
  const upSource = source.slice(
    source.indexOf('public async up'),
    source.indexOf('public async down'),
  );
  const downSource = source.slice(source.indexOf('public async down'));

  it('creates a reviewer evidence ledger bound to the reviewed DOB', () => {
    expect(upSource).toContain('identity.user_kyc_reviews');
    expect(upSource).toContain('date_of_birth');
    expect(upSource).toContain('reviewer_user_id');
    expect(upSource).toContain("decision IN ('APPROVED', 'REJECTED')");
    expect(upSource).toContain('ON DELETE RESTRICT');
    expect(upSource).not.toMatch(/ON DELETE CASCADE/i);
  });

  it('indexes the authoritative lookup by user, reviewed DOB, and recency', () => {
    expect(upSource).toContain('idx_user_kyc_reviews_lookup');
    expect(upSource).toContain('(user_id, date_of_birth, created_at DESC)');
  });

  it('enforces append-only KYC review evidence at PostgreSQL', () => {
    expect(upSource).toContain('identity.reject_kyc_evidence_mutation');
    expect(upSource).toContain('trg_user_kyc_reviews_immutable');
    expect(upSource).toContain('BEFORE UPDATE OR DELETE OR TRUNCATE');
    expect(upSource).toContain('FOR EACH STATEMENT');
    expect(upSource).toContain("ERRCODE = '55000'");
  });

  it('reuses existing profile KYC fields instead of duplicating mutable identity state', () => {
    expect(upSource).not.toMatch(/ALTER TABLE identity\.user_profiles/i);
    expect(upSource).not.toMatch(/ADD COLUMN/i);
  });

  it('has non-cascading reversible cleanup', () => {
    expect(downSource).toContain('DROP TABLE IF EXISTS identity.user_kyc_reviews');
    expect(downSource).toContain('DROP FUNCTION IF EXISTS identity.reject_kyc_evidence_mutation()');
    expect(downSource).not.toMatch(/CASCADE/i);
  });
});
