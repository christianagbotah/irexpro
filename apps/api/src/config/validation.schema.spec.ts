import { validationSchema } from './validation.schema';

describe('production MFA configuration validation', () => {
  const productionBase = {
    NODE_ENV: 'production',
    JWT_SECRET: 'j'.repeat(32),
    DB_HOST: 'localhost',
    DB_NAME: 'irexpro_test',
    DB_USER: 'irexpro',
    DB_PASSWORD: 'database-password',
    COOKIE_SECRET: 'c'.repeat(16),
    BROKER_ENCRYPTION_KEY: 'b'.repeat(32),
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

  it('accepts a dedicated 32+ character MFA encryption key', () => {
    const { error } = validationSchema.validate({
      ...productionBase,
      MFA_ENCRYPTION_KEY: 'm'.repeat(32),
    });
    expect(error).toBeUndefined();
  });
});
