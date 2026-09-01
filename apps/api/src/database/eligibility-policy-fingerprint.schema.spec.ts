import * as fs from 'fs';
import * as path from 'path';

describe('Sprint 46 — eligibility policy fingerprint migration contract', () => {
  const migrationPath = path.join(
    __dirname,
    'migrations',
    '1752900000000-AddEligibilityPolicyFingerprint.ts',
  );
  const source = fs.readFileSync(migrationPath, 'utf8');
  const upSource = source.slice(
    source.indexOf('public async up'),
    source.indexOf('public async down'),
  );
  const downSource = source.slice(source.indexOf('public async down'));

  it('binds disclosure consent to policy version and SHA-256 fingerprint', () => {
    expect(upSource).toContain('identity.user_disclosure_consents');
    expect(upSource).toContain('policy_version');
    expect(upSource).toContain('policy_fingerprint');
    expect(upSource).toContain("DEFAULT 'legacy.unbound'");
    expect(upSource).toContain("DEFAULT '${'0'.repeat(64)}'");
    expect(upSource).toContain("CHECK (policy_fingerprint ~ '^[a-f0-9]{64}$')");
    expect(upSource).toContain('ALTER COLUMN policy_version DROP DEFAULT');
    expect(upSource).toContain('ALTER COLUMN policy_fingerprint DROP DEFAULT');
  });

  it('extends immutable consent uniqueness with the policy fingerprint', () => {
    expect(upSource).toContain('uq_user_disclosure_consents_evidence');
    expect(upSource).toMatch(
      /user_id,[\s\S]*policy_version,[\s\S]*policy_fingerprint,[\s\S]*disclosure_key,[\s\S]*disclosure_version,[\s\S]*content_sha256/,
    );
  });

  it('binds jurisdiction review lookup to the same policy fingerprint', () => {
    expect(upSource).toContain('identity.user_eligibility_reviews');
    expect(upSource).toContain('idx_user_eligibility_reviews_lookup');
    expect(upSource).toMatch(
      /user_id,[\s\S]*country_code,[\s\S]*policy_version,[\s\S]*policy_fingerprint,[\s\S]*created_at DESC/,
    );
  });

  it('preserves append-only evidence without bypassing mutation triggers', () => {
    expect(upSource).not.toMatch(
      /\bUPDATE\s+identity\.user_(?:disclosure_consents|eligibility_reviews)\b/i,
    );
    expect(upSource).not.toMatch(
      /\bDELETE\s+FROM\s+identity\.user_(?:disclosure_consents|eligibility_reviews)\b/i,
    );
    expect(upSource).not.toMatch(
      /\bTRUNCATE\s+identity\.user_(?:disclosure_consents|eligibility_reviews)\b/i,
    );
    expect(upSource).not.toMatch(/DISABLE\s+TRIGGER/i);
    expect(upSource).not.toMatch(/DROP\s+TRIGGER/i);
  });

  it('removes only Sprint 46 columns and restores the prior index shapes on rollback', () => {
    expect(downSource).toContain('DROP COLUMN IF EXISTS policy_fingerprint');
    expect(downSource).toContain('DROP COLUMN IF EXISTS policy_version');
    expect(downSource).toContain('uq_user_disclosure_consents_evidence');
    expect(downSource).toContain('idx_user_eligibility_reviews_lookup');
    expect(downSource).not.toMatch(/DROP TABLE/i);
    expect(downSource).not.toMatch(/CASCADE/i);
  });
});
