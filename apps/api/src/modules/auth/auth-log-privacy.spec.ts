import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Auth routine log privacy', () => {
  const authServiceSource = readFileSync(resolve(__dirname, 'auth.service.ts'), 'utf8');
  const passwordResetSource = readFileSync(resolve(__dirname, 'password-reset.service.ts'), 'utf8');
  const passwordResetDeliverySource = readFileSync(
    resolve(__dirname, 'password-reset-delivery.service.ts'),
    'utf8',
  );
  const emailVerificationDeliverySource = readFileSync(
    resolve(__dirname, 'email-verification-delivery.service.ts'),
    'utf8',
  );

  it('keeps registration success logging identifier-free', () => {
    expect(authServiceSource).toContain("this.logger.log('New user registered');");
    expect(authServiceSource).not.toContain('New user registered: ${user.email}');
    expect(authServiceSource).not.toContain('New user registered: ${user.phone}');
  });

  it('does not interpolate raw email or phone fields into AuthService logger calls', () => {
    expect(authServiceSource).not.toMatch(
      /this\.logger\.(?:log|warn|error|debug|verbose)\([^;]*(?:user|dto)\.(?:email|phone)/s,
    );
  });

  it('keeps password-reset completion logging identifier-free', () => {
    expect(passwordResetSource).toContain("this.logger.log('Password reset completed');");
    expect(passwordResetSource).not.toMatch(
      /this\.logger\.(?:log|warn|error|debug|verbose)\([^;]*(?:userId|user\.(?:id|email|phone))/s,
    );
  });

  it('keeps password-reset delivery warnings free of raw account identifiers', () => {
    expect(passwordResetDeliverySource).not.toMatch(
      /this\.logger\.(?:log|warn|error|debug|verbose)\([^;]*\buserId\b/s,
    );
  });

  it('does not serialize raw provider exception messages into password-reset delivery logs', () => {
    expect(passwordResetDeliverySource).not.toMatch(
      /this\.logger\.(?:log|warn|error|debug|verbose)\([^;]*(?:err|error)[^;]*\.message/s,
    );
  });

  it('does not serialize raw provider exception messages into verification-email logs', () => {
    expect(emailVerificationDeliverySource).not.toMatch(
      /this\.logger\.(?:log|warn|error|debug|verbose)\([^;]*(?:err|error)[^;]*\.message/s,
    );
    expect(emailVerificationDeliverySource).not.toMatch(
      /this\.logger\.(?:log|warn|error|debug|verbose)\([^;]*(?:err|error)\b/s,
    );
  });

  it('retains only masked recipient logging for successful verification email delivery', () => {
    expect(emailVerificationDeliverySource).toContain(
      'this.logger.log(`Verification email sent to ${this.maskEmail(params.to)}`);',
    );
    expect(emailVerificationDeliverySource).not.toContain(
      'this.logger.log(`Verification email sent to ${params.to}`);',
    );
  });
});
