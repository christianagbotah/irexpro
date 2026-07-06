import { PaystackHttpClient } from './paystack-http.client';

function mockFetchResponse(opts: { ok: boolean; status: number; json: unknown }) {
  return {
    ok: opts.ok,
    status: opts.status,
    json: jest.fn().mockResolvedValue(opts.json),
  } as unknown as Response;
}

describe('PaystackHttpClient', () => {
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
      mockFetchResponse({ ok: true, status: 200, json: { status: true, data: { reference: 'r1' } } }),
    );
    const client = new PaystackHttpClient();

    const result = await client.request('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      secretKey: 'sk_test_x',
      body: { email: 'a@b.com' },
    });

    expect(result.ok).toBe(true);
    expect((result.body as any).data.reference).toBe('r1');
  });

  it('never includes the Authorization header value in the returned result', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({ ok: true, status: 200, json: { status: true, data: {} } }),
    );
    const client = new PaystackHttpClient();
    const result = await client.request('https://api.paystack.co/x', {
      method: 'GET',
      secretKey: 'sk_test_super_secret',
    });
    expect(JSON.stringify(result)).not.toContain('sk_test_super_secret');
  });

  it('handles non-2xx responses safely with a sanitised error message', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({ ok: false, status: 401, json: { message: 'Invalid key' } }),
    );
    const client = new PaystackHttpClient();
    const result = await client.request('https://api.paystack.co/x', { method: 'GET', secretKey: 'sk_bad' });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.errorMessage).toBe('Invalid key');
  });

  it('treats Paystack status=false as a failure even on HTTP 200', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({ ok: true, status: 200, json: { status: false, message: 'Duplicate reference' } }),
    );
    const client = new PaystackHttpClient();
    const result = await client.request('https://api.paystack.co/x', { method: 'POST', secretKey: 'sk_x' });
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe('Duplicate reference');
  });

  it('handles network failure safely', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND api.paystack.co'));
    const client = new PaystackHttpClient();
    const result = await client.request('https://api.paystack.co/x', { method: 'GET', secretKey: 'sk_x' });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
    expect(result.errorMessage).toBe('Paystack request failed: network error');
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
    const client = new PaystackHttpClient();
    const result = await client.request('https://api.paystack.co/x', {
      method: 'GET',
      secretKey: 'sk_x',
      timeoutMs: 20,
    });
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe('Paystack request timed out');
  });

  it('handles a non-JSON response body without throwing', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockRejectedValue(new Error('Unexpected token')),
    } as unknown as Response);
    const client = new PaystackHttpClient();
    const result = await client.request('https://api.paystack.co/x', { method: 'GET', secretKey: 'sk_x' });
    expect(result.ok).toBe(true);
    expect(result.body).toBeNull();
  });
});
