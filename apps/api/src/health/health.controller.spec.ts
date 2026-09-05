import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService, ReadinessView } from './health.service';

const FORBIDDEN_PUBLIC_HEALTH_DETAILS =
  /version|environment|database|redis|hostname|password|secret|dsn|connection string/i;

function expectStatusOnly(response: unknown, status: string) {
  expect(response).toEqual({ status });
  expect(JSON.stringify(response)).not.toMatch(FORBIDDEN_PUBLIC_HEALTH_DETAILS);
}

describe('HealthController', () => {
  const createController = () => {
    const healthService = {
      check: jest.fn(),
      liveness: jest.fn(),
      readiness: jest.fn(),
    } as unknown as HealthService;

    return {
      controller: new HealthController(healthService),
      healthService: healthService as unknown as {
        check: jest.Mock;
        liveness: jest.Mock;
        readiness: jest.Mock;
      },
    };
  };

  it('returns a minimal aggregate public payload', async () => {
    const { controller, healthService } = createController();
    healthService.check.mockResolvedValue({
      status: 'ok',
      timestamp: '2026-09-01T16:00:00.000Z',
      environment: 'production',
      version: '49.0.0-test',
      database: 'connected',
      redis: 'connected',
    });

    const response = await controller.check();

    expectStatusOnly(response, 'ok');
  });

  it('returns a ready status without exposing dependency details', async () => {
    const { controller, healthService } = createController();
    const response: ReadinessView = {
      status: 'ready',
      timestamp: '2026-09-01T16:00:00.000Z',
      database: 'connected',
      redis: 'connected',
    };
    healthService.readiness.mockResolvedValue(response);

    const publicResponse = await controller.ready();

    expectStatusOnly(publicResponse, 'ready');
  });

  it('returns minimal HTTP 503 semantics when a required dependency is unavailable', async () => {
    const { controller, healthService } = createController();
    const response: ReadinessView = {
      status: 'not_ready',
      timestamp: '2026-09-01T16:00:00.000Z',
      database: 'connected',
      redis: 'disconnected',
    };
    healthService.readiness.mockResolvedValue(response);

    try {
      await controller.ready();
      fail('expected readiness failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      const exception = error as ServiceUnavailableException;
      expect(exception.getStatus()).toBe(503);
      expectStatusOnly(exception.getResponse(), 'not_ready');
    }
  });

  it('returns minimal liveness without performing dependency checks', () => {
    const { controller, healthService } = createController();
    healthService.liveness.mockReturnValue({
      status: 'alive',
      timestamp: '2026-09-01T16:00:00.000Z',
      version: '49.0.0-test',
    });

    const response = controller.live();

    expectStatusOnly(response, 'alive');
    expect(healthService.readiness).not.toHaveBeenCalled();
  });
});
