import { OnModuleInit } from '@nestjs/common';
import { SmsProviderRegistry } from './registry/sms-provider.registry';
import { TwilioSmsProvider } from './providers/twilio-sms.provider';
import { HubtelSmsProvider } from './providers/hubtel-sms.provider';
import { ArkeselSmsProvider } from './providers/arkesel-sms.provider';
export declare class NotificationsModule implements OnModuleInit {
    private registry;
    private twilio;
    private hubtelSms;
    private arkesel;
    constructor(registry: SmsProviderRegistry, twilio: TwilioSmsProvider, hubtelSms: HubtelSmsProvider, arkesel: ArkeselSmsProvider);
    onModuleInit(): void;
}
