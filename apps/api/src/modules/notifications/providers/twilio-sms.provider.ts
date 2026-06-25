import { Injectable, NotImplementedException } from '@nestjs/common';
import {
  ISmsProvider,
  SmsDeliveryResult,
  SmsSendParams,
} from '../interfaces/sms-provider.interface';

/**
 * TwilioSmsProvider — PLACEHOLDER (Sprint 5-6 implementation)
 *
 * Global fallback SMS provider. Covers all countries.
 * Live implementation: Sprint 5-6
 * See: docs/architecture/22-sms-provider-architecture.md
 */
@Injectable()
export class TwilioSmsProvider implements ISmsProvider {
  readonly providerId = 'twilio';
  readonly displayName = 'Twilio';
  readonly supportedCountries = ['*'];
  readonly isLive = false;

  async sendSms(_params: SmsSendParams): Promise<SmsDeliveryResult> {
    throw new NotImplementedException('TwilioSmsProvider: live SMS sending not yet implemented');
  }
}
