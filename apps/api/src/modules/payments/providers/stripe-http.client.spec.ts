import { StripeHttpClient } from './stripe-http.client';

function mockFetchResponse(opts: { ok: boolean; status: number; json: unknown }) {
  return {
    ok: opts.ok,
    status: opts.status,
    json: jest.fn().mockResolvedValue(opts.json),
  } as unknown as Response;
}

describe('StripeHttpClient', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns ok=true with parsed body on a successful 2xx response', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        ok: true,
        status: 200,
        json: { id: 'cs_test_1', url: 'https://checkout.stripe.com/x' },
      }),
    );
    const client = new StripeHttpClient();

    const result = await client.request('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      secretKey: 'sk_test_x',
      body: { mode: 'payment' },
    });

    expect(result.ok).toBe(true);
    expect((result.body as any).id).toBe('cs_test_1');
  });

  it('sends the request body as application/x-www-form-urlencoded, not JSON', async () => {
    let capturedInit: RequestInit | undefined;
    global.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedInit = init;
      return Promise.resolve(
        mockFetchResponse({ ok: true, status: 200, json: { id: 'cs_test_1' } }),
      );
    });
    const client = new StripeHttpClient();

    await client.request('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      secretKey: 'sk_test_x',
      body: {
        mode: 'payment',
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: 2900 } }],
        metadata: { userId: 'user-1' },
      },
    });

    expect(capturedInit?.headers).toMatchObject({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    const body = capturedInit?.body as string;
    expect(typeof body).toBe('string');
    expect(body).toContain('mode=payment');
    expect(body).toContain('line_items%5B0%5D%5Bquantity%5D=1');
    expect(body).toContain('line_items%5B0%5D%5Bprice_data%5D%5Bcurrency%5D=usd');
    expect(body).toContain('line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=2900');
    expect(body).toContain('metadata%5BuserId%5D=user-1');
  });

  it('never includes the Authorization header value in the returned result', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(mockFetchResponse({ ok: true, status: 200, json: {} }));
    const client = new StripeHttpClient();
    const result = await client.request('https://api.stripe.com/v1/checkout/sessions/cs_1', {
      method: 'GET',
      secretKey: 'sk_test_super_secret',
    });
    expect(JSON.stringify(result)).not.toContain('sk_test_super_secret');
  });

  it('handles non-2xx responses safely, extracting the Stripe error.message shape', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        ok: false,
        status: 402,
        json: { error: { message: 'Your card was declined.', type: 'card_error' } },
      }),
    );
    const client = new StripeHttpClient();
    const result = await client.request('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      secretKey: 'sk_bad',
      body: {},
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(402);
    expect(result.errorMessage).toBe('Your card was declined.');
  });

  it('falls back to a generic message when the error body has no message field', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(mockFetchResponse({ ok: false, status: 500, json: {} }));
    const client = new StripeHttpClient();
    const result = await client.request('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      secretKey: 'sk_bad',
      body: {},
    });
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe('Stripe request failed with status 500');
  });

  it('handles network failure safely', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND api.stripe.com'));
    const client = new StripeHttpClient();
    const result = await client.request('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      secretKey: 'sk_x',
      body: {},
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
    expect(result.errorMessage).toBe('Stripe request failed: network error');
  });

  it('handles request timeout safely via AbortController', async () => {
    global.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const err = new Error('This operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
    const client = new StripeHttpClient();
    const result = await client.request('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      secretKey: 'sk_x',
      body: {},
      timeoutMs: 20,
    });
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe('Stripe request timed out');
  });

  it('handles a non-JSON response body without throwing', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockRejectedValue(new Error('Unexpected token')),
    } as unknown as Response);
    const client = new StripeHttpClient();
    const result = await client.request('https://api.stripe.com/v1/checkout/sessions/cs_1', {
      method: 'GET',
      secretKey: 'sk_x',
    });
    expect(result.ok).toBe(true);
    expect(result.body).toBeNull();
  });
});
