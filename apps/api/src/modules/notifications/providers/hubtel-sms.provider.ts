import { Injectable, NotImplementedException } from '@nestjs/common';
import {
  ISmsProvider,
  SmsDeliveryResult,
  SmsSendParams,
} from '../interfaces/sms-provider.interface';

/**
 * HubtelSmsProvider — PLACEHOLDER (Sprint 5-6 implementation)
 *
 * Ghana-primary SMS provider. High local delivery reliability.
 * See: https://developers.hubtel.com/docs/sms
 *
 * Live implementation: Sprint 5-6
 * See: docs/architecture/22-sms-provider-architecture.md
 */
@Injectable()
export class HubtelSmsProvider implements ISmsProvider {
  readonly providerId = 'hubtel_sms';
  readonly displayName = 'Hubtel SMS';
  readonly supportedCountries = ['GH'];
  readonly isLive = false;

  async sendSms(_params: SmsSendParams): Promise<SmsDeliveryResult> {
    throw new NotImplementedException('HubtelSmsProvider: live SMS sending not yet implemented');
  }
}
