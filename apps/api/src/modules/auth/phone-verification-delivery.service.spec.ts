import { ConfigService } from '@nestjs/config';
import { PhoneVerificationDeliveryService } from './phone-verification-delivery.service';

describe('PhoneVerificationDeliveryService', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function config(values: Record<string, string | undefined>): ConfigService {
    return {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;
  }

  it('fails closed for placeholder provider configuration without making a network request', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as typeof fetch;
    const service = new PhoneVerificationDeliveryService(
      config({
        'sms.twilio.accountSid': 'PLACEHOLDER',
        'sms.twilio.authToken': 'PLACEHOLDER',
        'sms.twilio.fromNumber': '+15005550006',
      }),
    );

    expect(service.isConfigured()).toBe(false);
    await expect(service.sendVerificationCode('+233244000000', '123456')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts only the required Twilio message fields with authenticated provider access', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 201 });
    globalThis.fetch = fetchMock as typeof fetch;
    const accountSid = `AC${'a'.repeat(32)}`;
    const apiKey = `SK${'b'.repeat(32)}`;
    const service = new PhoneVerificationDeliveryService(
      config({
        'sms.twilio.accountSid': accountSid,
        'sms.twilio.apiKey': apiKey,
        'sms.twilio.apiSecret': 'api-secret-value-0123456789abcdef',
        'sms.twilio.fromNumber': '+233200000000',
      }),
    );

    expect(service.isConfigured()).toBe(true);
    await expect(service.sendVerificationCode('+233244000000', '123456')).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`);
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual(
      expect.objectContaining({
        Authorization: expect.stringMatching(/^Basic /u),
        'Content-Type': 'application/x-www-form-urlencoded',
      }),
    );

    const body = new URLSearchParams(options.body as string);
    expect(body.get('To')).toBe('+233244000000');
    expect(body.get('From')).toBe('+233200000000');
    expect(body.get('Body')).toContain('123456');
    expect(body.get('Body')).toContain('10 minutes');
  });

  it('rejects malformed destinations and challenge values before provider access', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as typeof fetch;
    const service = new PhoneVerificationDeliveryService(
      config({
        'sms.twilio.accountSid': `AC${'a'.repeat(32)}`,
        'sms.twilio.authToken': '0123456789abcdef0123456789abcdef',
        'sms.twilio.fromNumber': '+233200000000',
      }),
    );

    await expect(service.sendVerificationCode('0244000000', '123456')).resolves.toBe(false);
    await expect(service.sendVerificationCode('+233244000000', '12345')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
