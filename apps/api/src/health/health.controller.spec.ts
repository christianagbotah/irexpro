import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService, ReadinessView } from './health.service';

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

  it('returns a ready payload when all required dependencies are healthy', async () => {
    const { controller, healthService } = createController();
    const response: ReadinessView = {
      status: 'ready',
      timestamp: '2026-09-01T16:00:00.000Z',
      database: 'connected',
      redis: 'connected',
    };
    healthService.readiness.mockResolvedValue(response);

    await expect(controller.ready()).resolves.toEqual(response);
  });

  it('returns HTTP 503 semantics when a required dependency is unavailable', async () => {
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
      expect(exception.getResponse()).toEqual(response);
      expect(JSON.stringify(exception.getResponse())).not.toContain('password');
      expect(JSON.stringify(exception.getResponse())).not.toContain('hostname');
    }
  });

  it('delegates liveness without dependency checks', () => {
    const { controller, healthService } = createController();
    const response = {
      status: 'alive' as const,
      timestamp: '2026-09-01T16:00:00.000Z',
      version: '47.0.0-test',
    };
    healthService.liveness.mockReturnValue(response);

    expect(controller.live()).toEqual(response);
    expect(healthService.readiness).not.toHaveBeenCalled();
  });
});
