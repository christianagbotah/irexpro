import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PhoneVerificationDeliveryService {
  private readonly logger = new Logger(PhoneVerificationDeliveryService.name);

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    const accountSid = this.configService.get<string>('sms.twilio.accountSid');
    const authToken = this.configService.get<string>('sms.twilio.authToken');
    const apiKey = this.configService.get<string>('sms.twilio.apiKey');
    const apiSecret = this.configService.get<string>('sms.twilio.apiSecret');
    const fromNumber = this.configService.get<string>('sms.twilio.fromNumber');

    const accountValid = Boolean(accountSid && /^AC[0-9a-f]{32}$/iu.test(accountSid));
    const fromValid = Boolean(fromNumber && /^\+[1-9]\d{7,14}$/u.test(fromNumber));
    const apiKeyPairValid = Boolean(
      apiKey && apiSecret && /^SK[0-9a-f]{32}$/iu.test(apiKey) && this.isUsableSecret(apiSecret),
    );
    const accountTokenValid = Boolean(authToken && this.isUsableSecret(authToken));

    return accountValid && fromValid && (apiKeyPairValid || accountTokenValid);
  }

  async sendVerificationCode(to: string, code: string): Promise<boolean> {
    if (!this.isConfigured() || !/^\+[1-9]\d{7,14}$/u.test(to) || !/^\d{6}$/u.test(code)) {
      return false;
    }

    const accountSid = this.configService.get<string>('sms.twilio.accountSid')!;
    const authToken = this.configService.get<string>('sms.twilio.authToken');
    const apiKey = this.configService.get<string>('sms.twilio.apiKey');
    const apiSecret = this.configService.get<string>('sms.twilio.apiSecret');
    const fromNumber = this.configService.get<string>('sms.twilio.fromNumber')!;
    const username = apiKey && apiSecret ? apiKey : accountSid;
    const password = apiKey && apiSecret ? apiSecret : authToken!;

    const form = new URLSearchParams({
      To: to,
      From: fromNumber,
      Body: `Your iRexPro verification code is ${code}. It expires in 10 minutes.`,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        this.logger.warn(
          `Phone verification delivery rejected by provider (status=${response.status})`,
        );
        return false;
      }
      return true;
    } catch {
      this.logger.warn('Phone verification delivery failed before provider acceptance');
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private isUsableSecret(value: string): boolean {
    const normalized = value.trim().toUpperCase();
    return (
      value.trim().length >= 16 &&
      !normalized.includes('PLACEHOLDER') &&
      !normalized.includes('CHANGE_ME')
    );
  }
}
