import { ISmsProvider, SmsDeliveryResult, SmsSendParams } from '../interfaces/sms-provider.interface';
export declare class TwilioSmsProvider implements ISmsProvider {
    readonly providerId = "twilio";
    readonly displayName = "Twilio";
    readonly supportedCountries: string[];
    readonly isLive = false;
    sendSms(_params: SmsSendParams): Promise<SmsDeliveryResult>;
}
