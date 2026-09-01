import * as fs from 'fs';
import * as path from 'path';

describe('Sprint 44 — eligibility disclosure migration contract', () => {
  const migrationPath = path.join(
    __dirname,
    'migrations',
    '1752700000000-CreateEligibilityDisclosureGate.ts',
  );
  const source = fs.readFileSync(migrationPath, 'utf8');
  const upSource = source.slice(
    source.indexOf('public async up'),
    source.indexOf('public async down'),
  );
  const downSource = source.slice(source.indexOf('public async down'));

  it('creates disclosure evidence bound to exact version and content hash', () => {
    expect(upSource).toContain('identity.user_disclosure_consents');
    expect(upSource).toContain('disclosure_version');
    expect(upSource).toContain('content_sha256');
    expect(upSource).toContain('uq_user_disclosure_consents_evidence');
    expect(upSource).toContain("CHECK (content_sha256 ~ '^[a-f0-9]{64}$')");
    expect(upSource).toContain('ON DELETE RESTRICT');
    expect(upSource).not.toMatch(/ON DELETE CASCADE/i);
  });

  it('closes the disclosure-key domain at the database boundary', () => {
    for (const key of [
      'AUTOMATED_TRADING_RISK',
      'NO_PROFIT_GUARANTEE',
      'BROKER_EXECUTION_AUTHORITY',
      'LEGAL_ELIGIBILITY_ATTESTATION',
    ]) {
      expect(upSource).toContain(`'${key}'`);
    }
  });

  it('creates jurisdiction review evidence tied to country and policy version', () => {
    expect(upSource).toContain('identity.user_eligibility_reviews');
    expect(upSource).toContain('country_code');
    expect(upSource).toContain('policy_version');
    expect(upSource).toContain('reviewer_user_id');
    expect(upSource).toContain("decision IN ('APPROVED', 'DENIED')");
    expect(upSource).toContain('idx_user_eligibility_reviews_lookup');
  });

  it('enforces append-only evidence at PostgreSQL for update, delete, and truncate', () => {
    expect(upSource).toContain('identity.reject_eligibility_evidence_mutation');
    expect(upSource).toContain('trg_user_disclosure_consents_immutable');
    expect(upSource).toContain('trg_user_eligibility_reviews_immutable');
    expect(upSource.match(/BEFORE UPDATE OR DELETE OR TRUNCATE/g)).toHaveLength(2);
    expect(upSource.match(/FOR EACH STATEMENT/g)).toHaveLength(2);
    expect(upSource).toContain("ERRCODE = '55000'");
  });

  it('uses non-cascading reversible cleanup without mutating identity.users', () => {
    expect(downSource).toContain('DROP TABLE IF EXISTS identity.user_eligibility_reviews');
    expect(downSource).toContain('DROP TABLE IF EXISTS identity.user_disclosure_consents');
    expect(downSource).toContain(
      'DROP FUNCTION IF EXISTS identity.reject_eligibility_evidence_mutation()',
    );
    expect(downSource).not.toMatch(/CASCADE/i);
    expect(upSource).not.toMatch(/ALTER TABLE identity\.users/i);
  });
});
