import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter security boundary', () => {
  function createHost(url: string, path: string) {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const request = { method: 'GET', url, path };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;
    return { host, status, json };
  }

  it('does not log raw 5xx messages, stacks, or query strings', () => {
    const filter = new AllExceptionsFilter();
    const logger = { error: jest.fn(), warn: jest.fn() };
    (filter as unknown as { logger: typeof logger }).logger = logger;

    const error = new Error('token=super-secret database failed');
    error.stack = 'STACK password=hidden';
    const { host, json } = createHost('/health?token=query-secret', '/health');

    filter.catch(error, host);

    const logged = JSON.stringify(logger.error.mock.calls);
    expect(logged).not.toContain('super-secret');
    expect(logged).not.toContain('password=hidden');
    expect(logged).not.toContain('query-secret');
    expect(logged).toContain('/health');

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        path: '/health',
        message: 'Internal server error',
      }),
    );
  });

  it('removes secret-like values embedded in safe HTTP response strings', () => {
    const filter = new AllExceptionsFilter();
    const logger = { error: jest.fn(), warn: jest.fn() };
    (filter as unknown as { logger: typeof logger }).logger = logger;

    const { host, json } = createHost('/test?accessToken=query-secret', '/test');

    filter.catch(new BadRequestException('token=response-secret'), host);

    const responseBody = json.mock.calls[0][0];
    expect(JSON.stringify(responseBody)).not.toContain('response-secret');
    expect(JSON.stringify(responseBody)).not.toContain('query-secret');
    expect(responseBody.path).toBe('/test');
  });
});
