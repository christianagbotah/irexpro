/**
 * ISmsProvider — Core SMS provider abstraction for iRexPro.
 *
 * All SMS provider implementations (Twilio, Hubtel SMS, Arkesel, AWS SNS)
 * must implement this interface.
 *
 * RULE: Services must NEVER call SMS provider SDKs directly.
 * Always interact through this interface via SmsProviderRegistry.
 *
 * IMPORTANT: SMS delivery logs must NOT store message body (PII minimisation).
 *
 * See: docs/architecture/22-sms-provider-architecture.md
 */
export interface ISmsProvider {
  readonly providerId: string;
  readonly displayName: string;
  readonly supportedCountries: string[];
  readonly isLive: boolean;

  sendSms(params: SmsSendParams): Promise<SmsDeliveryResult>;
}

export interface SmsSendParams {
  to: string;
  messageType: SmsMessageType;
  templateData: Record<string, string>;
  countryCode?: string;
}

export interface SmsDeliveryResult {
  success: boolean;
  providerMessageId?: string;
  provider: string;
  errorCode?: string;
  errorMessage?: string;
}

export enum SmsMessageType {
  OTP = 'OTP',
  LOGIN_ALERT = 'LOGIN_ALERT',
  PASSWORD_RESET = 'PASSWORD_RESET',
  SUBSCRIPTION_ACTIVATED = 'SUBSCRIPTION_ACTIVATED',
  SUBSCRIPTION_EXPIRING = 'SUBSCRIPTION_EXPIRING',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  AI_TRADING_STARTED = 'AI_TRADING_STARTED',
  AI_TRADING_STOPPED = 'AI_TRADING_STOPPED',
  BROKER_CONNECTED = 'BROKER_CONNECTED',
  BROKER_DISCONNECTED = 'BROKER_DISCONNECTED',
  RISK_LIMIT_REACHED = 'RISK_LIMIT_REACHED',
  TRADE_OPENED = 'TRADE_OPENED',
  TRADE_CLOSED = 'TRADE_CLOSED',
}
