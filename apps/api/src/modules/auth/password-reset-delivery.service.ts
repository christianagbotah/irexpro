import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { ResetChannel } from './entities/password-reset-token.entity';

/**
 * EmailProviderInterface — abstraction over the email delivery mechanism.
 *
 * Sprint 28 amendment: extracted so the delivery service can be unit-tested
 * with a mock email provider (no real SMTP connection needed in tests).
 * The default implementation uses nodemailer with EMAIL_SMTP_URL.
 */
export interface EmailProviderInterface {
  sendResetEmail(params: { to: string; resetLink: string; fromAddress: string }): Promise<boolean>;
}

/**
 * NestJS DI token for the EmailProviderInterface. Use this symbol (not the
 * interface itself) when injecting — TypeScript interfaces are erased at
 * runtime, so a Symbol token is required for DI.
 */
export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

/**
 * NodemailerEmailProvider — real SMTP email delivery via nodemailer.
 *
 * Sprint 28 amendment: uses EMAIL_SMTP_URL from the environment. The transport
 * is lazily created on first use and reused. If the URL is invalid or the SMTP
 * server is unreachable, sendResetEmail returns false (the caller returns the
 * generic API response — no account enumeration).
 *
 * Security:
 *   - The raw reset token is embedded in the reset link fragment inside the email body.
 *   - Browser fragments are not transmitted in the initial HTTP navigation request.
 *   - The raw token is NEVER logged.
 *   - The email body is NOT logged (PII minimisation).
 *   - SMTP errors are logged at warn level WITHOUT the raw token or email body.
 */
@Injectable()
export class NodemailerEmailProvider implements EmailProviderInterface {
  private readonly logger = new Logger(NodemailerEmailProvider.name);
  private transporter: Transporter | null = null;
  private initialized = false;

  constructor(private configService: ConfigService) {}

  private getTransport(): Transporter | null {
    if (this.initialized) return this.transporter;
    this.initialized = true;

    const smtpUrl = this.configService.get<string>('email.smtpUrl');
    if (!smtpUrl) {
      return null;
    }

    try {
      this.transporter = createTransport(smtpUrl);
      this.logger.log('SMTP email provider initialized');
    } catch (err) {
      this.logger.error(
        `Failed to initialize SMTP transport: ${(err as Error).message}. ` +
          'Email delivery will be unavailable until EMAIL_SMTP_URL is corrected.',
      );
      this.transporter = null;
    }
    return this.transporter;
  }

  async sendResetEmail(params: {
    to: string;
    resetLink: string;
    fromAddress: string;
  }): Promise<boolean> {
    const transport = this.getTransport();
    if (!transport) {
      return false;
    }

    try {
      await transport.sendMail({
        from: params.fromAddress,
        to: params.to,
        subject: 'iRexPro — Password reset',
        text: this.buildTextBody(params.resetLink),
        html: this.buildHtmlBody(params.resetLink),
      });
      // Do NOT log the reset link (it contains the raw token).
      this.logger.log(`Password reset email sent to ${this.maskEmail(params.to)}`);
      return true;
    } catch (err) {
      // Log the SMTP error but NOT the email body or reset link.
      this.logger.warn(
        `SMTP send failed: ${(err as Error).message}. ` +
          'The reset token hash remains stored — the user can request a new reset.',
      );
      return false;
    }
  }

  private buildTextBody(resetLink: string): string {
    return [
      'You requested a password reset for your iRexPro account.',
      '',
      'Click the link below to set a new password:',
      resetLink,
      '',
      'This link expires in 15 minutes.',
      '',
      'If you did not request this reset, you can safely ignore this email.',
      '',
      '— iRexPro',
    ].join('\n');
  }

  private buildHtmlBody(resetLink: string): string {
    return [
      '<div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">',
      '<h2 style="color: #d97706;">iRexPro — Password reset</h2>',
      '<p>You requested a password reset for your iRexPro account.</p>',
      '<p>Click the button below to set a new password:</p>',
      `<p><a href="${resetLink}" style="display:inline-block;background:#d97706;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Reset password</a></p>`,
      `<p style="color:#6b7693;font-size:0.85rem;">Or copy this link: ${resetLink}</p>`,
      '<p style="color:#6b7693;font-size:0.85rem;">This link expires in 15 minutes.</p>',
      '<p style="color:#6b7693;font-size:0.85rem;">If you did not request this reset, you can safely ignore this email.</p>',
      '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">',
      '<p style="color:#6b7693;font-size:0.8rem;">— iRexPro</p>',
      '</div>',
    ].join('\n');
  }

  /** Mask email for safe logging: u***@example.com */
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!local || !domain) return '(invalid)';
    const masked =
      local.length <= 2 ? local[0] + '***' : local[0] + '***' + local[local.length - 1];
    return `${masked}@${domain}`;
  }
}

/**
 * PasswordResetDeliveryService — delivers password reset tokens to users.
 *
 * Sprint 28 amendment: now uses a REAL nodemailer SMTP provider when
 * EMAIL_SMTP_URL is configured. If not configured, logs a safe warning and
 * returns false (the API still returns the generic message).
 *
 * Email flow:
 *   - Builds reset link: `${WEB_BASE_URL}/reset-password#token=<rawToken>`
 *   - The fragment is kept client-side by the browser and is not sent in the navigation request.
 *   - Sends via nodemailer (EMAIL_SMTP_URL).
 *   - If EMAIL_SMTP_URL or WEB_BASE_URL is missing → safe warning, returns false.
 *   - If SMTP send fails → safe warning (no raw token), returns false.
 *
 * Phone flow:
 *   - SMS providers are placeholders (throw NotImplementedException).
 *   - Logs a safe warning (no raw code) and returns false.
 *   - Phone-only users cannot recover via SMS until a live provider is wired.
 *
 * Security:
 *   - Raw token/code is NEVER logged.
 *   - Email body is NEVER logged (PII minimisation).
 *   - SMTP errors are logged without the raw token or email body.
 *   - If delivery fails, the token hash remains in the DB — user can retry.
 */
@Injectable()
export class PasswordResetDeliveryService {
  private readonly logger = new Logger(PasswordResetDeliveryService.name);

  constructor(
    private configService: ConfigService,
    @Inject(EMAIL_PROVIDER) private emailProvider: EmailProviderInterface,
  ) {}

  /**
   * Deliver a password reset token to the user.
   * @returns true if delivery succeeded, false if the provider is not
   *          configured or delivery failed.
   */
  async deliver(params: DeliverParams): Promise<boolean> {
    if (params.channel === ResetChannel.EMAIL) {
      return this.deliverEmail(params.destination, params.rawToken, params.userId);
    }
    return this.deliverPhone(params.destination, params.rawToken, params.userId);
  }

  /**
   * Email flow: build the reset link and send via the email provider.
   *
   * Sprint 28 amendment: uses the injected EmailProviderInterface (default:
   * NodemailerEmailProvider). The raw token is embedded in the reset link
   * fragment inside the email body — it is NEVER logged or placed in the
   * navigation request query string.
   */
  private async deliverEmail(email: string, rawToken: string, userId: string): Promise<boolean> {
    const webBaseUrl = this.configService.get<string>('app.webBaseUrl');
    if (!webBaseUrl) {
      this.logger.warn(
        'Password reset email NOT sent: WEB_BASE_URL is not configured. ' +
          'Set WEB_BASE_URL in .env so reset links point to the correct web app. ' +
          'The reset token hash is stored — the user can request a new reset once configured.',
      );
      return false;
    }

    const smtpUrl = this.configService.get<string>('email.smtpUrl');
    if (!smtpUrl) {
      this.logger.warn(
        `Password reset email NOT sent: EMAIL_SMTP_URL is not configured. ` +
          `Reset link was generated for user ${userId} but NOT delivered. ` +
          `Set EMAIL_SMTP_URL in .env to enable email reset delivery. ` +
          `The reset token hash is stored — the user can request a new reset once configured.`,
      );
      // Do NOT log the reset link (it contains the raw token).
      return false;
    }

    // Keep the secret in the fragment so it is not sent to the Web server or
    // reverse proxy as part of the initial navigation request URL.
    const resetLink = `${webBaseUrl.replace(/\/$/u, '')}/reset-password#token=${encodeURIComponent(rawToken)}`;
    const fromAddress = this.configService.get<string>('email.fromAddress', 'no-reply@irexpro.com');

    // Send via the email provider. If it returns false (SMTP failure),
    // we return false — the caller returns the generic API message (no enumeration).
    const sent = await this.emailProvider.sendResetEmail({ to: email, resetLink, fromAddress });
    if (!sent) {
      // The email provider already logged the SMTP error (no raw token).
      return false;
    }
    return true;
  }

  /**
   * Phone flow: send a 6-digit code via SMS.
   *
   * LIMITATION: all SMS providers (Twilio/Hubtel/Arkesel) are currently
   * placeholders that throw NotImplementedException. Phone-only users CANNOT
   * receive reset codes until a live SMS provider is wired. The API still
   * returns the generic response to avoid account enumeration.
   *
   * When a live SMS provider is available, wire it here:
   *   const provider = this.smsRegistry.selectProvider(countryCode);
   *   await provider.sendSms({ to: phone, messageType: SmsMessageType.PASSWORD_RESET, templateData: { code: rawCode } });
   */
  private async deliverPhone(phone: string, rawCode: string, userId: string): Promise<boolean> {
    // Do NOT log the raw code.
    this.logger.warn(
      `Password reset SMS NOT sent: SMS providers are currently placeholders ` +
        `(Twilio/Hubtel/Arkesel throw NotImplementedException). ` +
        `User ${userId} requested phone reset but SMS delivery is not available. ` +
        `Phone-only users cannot recover via SMS until a live SMS provider is configured. ` +
        `The reset code hash is stored — the user can request a new reset once SMS is configured.`,
    );
    return false;
  }
}

export interface DeliverParams {
  channel: ResetChannel;
  destination: string;
  rawToken: string;
  userId: string;
  userName: string;
}
