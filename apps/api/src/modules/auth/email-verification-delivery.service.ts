import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

@Injectable()
export class EmailVerificationDeliveryService {
  private readonly logger = new Logger(EmailVerificationDeliveryService.name);
  private transporter: Transporter | null = null;
  private initialized = false;

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.configService.get<string>('email.smtpUrl') &&
      this.configService.get<string>('app.webBaseUrl'),
    );
  }

  async send(params: {
    to: string;
    verificationLink: string;
    fromAddress: string;
  }): Promise<boolean> {
    const transport = this.getTransport();
    if (!transport) return false;

    try {
      await transport.sendMail({
        from: params.fromAddress,
        to: params.to,
        subject: 'iRexPro — Verify your email',
        text: [
          'Verify the email address for your iRexPro account.',
          '',
          'Open this single-use link:',
          params.verificationLink,
          '',
          'This link expires in 15 minutes.',
          '',
          'If you did not request this, you can ignore this email.',
        ].join('\n'),
        html: [
          '<div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">',
          '<h2>Verify your iRexPro email</h2>',
          '<p>Confirm the email address for your account.</p>',
          `<p><a href="${params.verificationLink}" style="display:inline-block;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Verify email</a></p>`,
          '<p style="font-size:0.85rem;">This single-use link expires in 15 minutes.</p>',
          '</div>',
        ].join('\n'),
      });
      this.logger.log(`Verification email sent to ${this.maskEmail(params.to)}`);
      return true;
    } catch (error) {
      this.logger.warn(
        `Verification email delivery failed: ${(error as Error).message}. ` +
          'No verification token or message body was logged.',
      );
      return false;
    }
  }

  private getTransport(): Transporter | null {
    if (this.initialized) return this.transporter;
    this.initialized = true;

    const smtpUrl = this.configService.get<string>('email.smtpUrl');
    if (!smtpUrl) return null;

    try {
      this.transporter = createTransport(smtpUrl);
      return this.transporter;
    } catch (error) {
      this.logger.error(
        `Failed to initialize verification SMTP transport: ${(error as Error).message}`,
      );
      this.transporter = null;
      return null;
    }
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!local || !domain) return '(invalid)';
    return `${local[0]}***@${domain}`;
  }
}
