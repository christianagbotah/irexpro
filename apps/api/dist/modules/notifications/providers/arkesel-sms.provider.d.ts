import { ISmsProvider, SmsDeliveryResult, SmsSendParams } from '../interfaces/sms-provider.interface';
export declare class ArkeselSmsProvider implements ISmsProvider {
    readonly providerId = "arkesel";
    readonly displayName = "Arkesel SMS";
    readonly supportedCountries: string[];
    readonly isLive = false;
    sendSms(_params: SmsSendParams): Promise<SmsDeliveryResult>;
}
