import { ISmsProvider, SmsDeliveryResult, SmsSendParams } from '../interfaces/sms-provider.interface';
export declare class HubtelSmsProvider implements ISmsProvider {
    readonly providerId = "hubtel_sms";
    readonly displayName = "Hubtel SMS";
    readonly supportedCountries: string[];
    readonly isLive = false;
    sendSms(_params: SmsSendParams): Promise<SmsDeliveryResult>;
}
