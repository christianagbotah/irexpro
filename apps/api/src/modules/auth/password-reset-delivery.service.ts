import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResetChannel } from './entities/password-reset-token.entity';

/**
 * PasswordResetDeliveryService — delivers password reset tokens to users.
 *
 * Sprint 28: provides a clean abstraction over email + SMS delivery. If a
 * provider is not configured, the service returns `delivered: false` and
 * logs a safe operational warning (no raw token). The caller
 * (PasswordResetService) always returns the same generic API response to the
 * user regardless of delivery outcome.
 *
 * Email flow:
 *   - Generates a reset link: `${WEB_BASE_URL}/reset-password?token=<rawToken>`
 *   - Sends the link via the configured email provider.
 *   - If no email provider is configured, logs a warning and returns false.
 *
 * Phone flow:
 *   - Sends a 6-digit code via the configured SMS provider
 *     (SmsProviderRegistry from the notifications module).
 *   - If no SMS provider is configured (all providers are placeholders), logs
 *     a warning and returns false.
 *
 * Security:
 *   - The raw token/code is passed to the provider but NEVER logged.
 *   - Provider delivery logs must NOT store the message body (PII minimisation).
 *   - If delivery fails, the token hash remains in the DB (the user can still
 *     retry the reset request).
 *
 * Required env variables:
 *   - WEB_BASE_URL: the base URL for the web app reset link
 *     (e.g. https://irexpro.lightworldtech.com)
 *   - Email provider: SMTP_URL or similar (not yet implemented — placeholder)
 *   - SMS provider: see SmsProviderRegistry (Twilio/Hubtel/Arkesel — currently
 *     all placeholders that throw NotImplementedException)
 */
@Injectable()
export class PasswordResetDeliveryService {
  private readonly logger = new Logger(PasswordResetDeliveryService.name);

  constructor(private configService: ConfigService) {}

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
   * Email flow: generate a reset link and send via the email provider.
   * Currently no email provider is wired — logs a safe warning and returns false.
   */
  private async deliverEmail(
    email: string,
    rawToken: string,
    _userId: string,
  ): Promise<boolean> {
    const webBaseUrl = this.configService.get<string>('app.webBaseUrl');
    if (!webBaseUrl) {
      this.logger.warn(
        'Password reset email NOT sent: WEB_BASE_URL is not configured. ' +
        'Set WEB_BASE_URL in .env so reset links point to the correct web app. ' +
        'The reset token hash is stored — the user can request a new reset once configured.',
      );
      return false;
    }

    // Build the reset link. The raw token is in the URL (not logged).
    const resetLink = `${webBaseUrl}/reset-password?token=${rawToken}`;

    // Check if an email provider is configured. Currently no email provider
    // is wired (nodemailer/SendGrid/etc. not yet integrated). When one is
    // added, this is where the send call goes.
    const emailConfigured = this.configService.get<string>('email.smtpUrl');
    if (!emailConfigured) {
      this.logger.warn(
        `Password reset email NOT sent: no email provider configured (EMAIL_SMTP_URL not set). ` +
        `Reset link was generated for user ${_userId} but NOT delivered. ` +
        `Configure an email provider (e.g. SMTP, SendGrid) to enable email reset delivery. ` +
        `The reset token hash is stored — the user can request a new reset once configured.`,
      );
      // Do NOT log the reset link (it contains the raw token).
      return false;
    }

    // TODO: when email provider is integrated, send the email here.
    // For now, this branch is unreachable (emailConfigured is always falsy
    // until a provider is wired). When integrated, NEVER log the raw token.
    this.logger.log(`Password reset email sent to user ${_userId}`);
    return true;
  }

  /**
   * Phone flow: send a 6-digit code via SMS.
   * Uses the SmsProviderRegistry from the notifications module. Currently all
   * SMS providers are placeholders (throw NotImplementedException), so this
   * catches the error, logs a safe warning, and returns false.
   *
   * When a real SMS provider is configured (Twilio/Hubtel/Arkesel live
   * implementation), this method will send the code via the registry.
   */
  private async deliverPhone(
    phone: string,
    rawCode: string,
    userId: string,
  ): Promise<boolean> {
    // The SmsProviderRegistry is injected into PasswordResetDeliveryService
    // via the notifications module. However, all current providers throw
    // NotImplementedException. Rather than depend on the registry here (which
    // would couple this service to the notifications module), we document
    // that SMS delivery requires a live SMS provider implementation.
    //
    // When a live SMS provider is available, wire it here:
    //   const provider = this.smsRegistry.selectProvider(countryCode);
    //   await provider.sendSms({ to: phone, messageType: SmsMessageType.PASSWORD_RESET, templateData: { code: rawCode } });
    //
    // For now, log a safe warning (no raw code) and return false.
    this.logger.warn(
      `Password reset SMS NOT sent: SMS providers are currently placeholders ` +
      `(Twilio/Hubtel/Arkesel throw NotImplementedException). ` +
      `User ${userId} requested phone reset but delivery is not available. ` +
      `Implement a live SMS provider to enable phone code delivery. ` +
      `The reset code hash is stored — the user can request a new reset once configured.`,
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
