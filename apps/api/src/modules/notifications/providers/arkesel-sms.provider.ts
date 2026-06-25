import { Injectable, NotImplementedException } from '@nestjs/common';
import {
  ISmsProvider,
  SmsDeliveryResult,
  SmsSendParams,
} from '../interfaces/sms-provider.interface';

/**
 * ArkeselSmsProvider — PLACEHOLDER (Sprint 5-6 implementation)
 *
 * Africa-wide SMS provider covering Ghana, Nigeria, Kenya, and others.
 * See: https://arkesel.com
 *
 * Live implementation: Sprint 5-6
 * See: docs/architecture/22-sms-provider-architecture.md
 */
@Injectable()
export class ArkeselSmsProvider implements ISmsProvider {
  readonly providerId = 'arkesel';
  readonly displayName = 'Arkesel SMS';
  readonly supportedCountries = ['GH', 'NG', 'KE', 'GH', 'CI', 'SN'];
  readonly isLive = false;

  async sendSms(_params: SmsSendParams): Promise<SmsDeliveryResult> {
    throw new NotImplementedException('ArkeselSmsProvider: live SMS sending not yet implemented');
  }
}
