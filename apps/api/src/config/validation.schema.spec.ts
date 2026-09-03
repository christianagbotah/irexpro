import { validationSchema } from './validation.schema';

describe('production authentication configuration validation', () => {
  const productionBase = {
    NODE_ENV: 'production',
    JWT_SECRET: 'j'.repeat(32),
    DB_HOST: 'localhost',
    DB_NAME: 'irexpro_test',
    DB_USER: 'irexpro',
    DB_PASSWORD: 'database-password',
    COOKIE_SECRET: 'c'.repeat(16),
    BROKER_ENCRYPTION_KEY: 'b'.repeat(32),
    AUTH_VERIFICATION_PEPPER: 'p'.repeat(32),
  };

  it('rejects production boot when MFA_ENCRYPTION_KEY is absent', () => {
    const { error } = validationSchema.validate(productionBase);
    expect(error?.message).toContain('MFA_ENCRYPTION_KEY');
  });

  it('rejects production boot when MFA_ENCRYPTION_KEY is blank', () => {
    const { error } = validationSchema.validate({
      ...productionBase,
      MFA_ENCRYPTION_KEY: '',
    });
    expect(error?.message).toContain('MFA_ENCRYPTION_KEY');
  });

  it('accepts dedicated 32+ character MFA and verification keys', () => {
    const { error } = validationSchema.validate({
      ...productionBase,
      MFA_ENCRYPTION_KEY: 'm'.repeat(32),
    });
    expect(error).toBeUndefined();
  });

  it('rejects production boot when AUTH_VERIFICATION_PEPPER is absent', () => {
    const { error } = validationSchema.validate({
      ...productionBase,
      MFA_ENCRYPTION_KEY: 'm'.repeat(32),
      AUTH_VERIFICATION_PEPPER: undefined,
    });
    expect(error?.message).toContain('AUTH_VERIFICATION_PEPPER');
  });

  it('rejects production boot when AUTH_VERIFICATION_PEPPER is blank', () => {
    const { error } = validationSchema.validate({
      ...productionBase,
      MFA_ENCRYPTION_KEY: 'm'.repeat(32),
      AUTH_VERIFICATION_PEPPER: '',
    });
    expect(error?.message).toContain('AUTH_VERIFICATION_PEPPER');
  });
});
