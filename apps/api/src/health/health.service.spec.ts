import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { HealthRedisProbe, HealthService } from './health.service';

describe('HealthService', () => {
  const createService = () => {
    const dataSource = {
      query: jest.fn(),
    } as unknown as DataSource;

    const configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, string> = {
          'app.env': 'test',
          'app.version': '47.0.0-test',
        };
        return values[key] ?? fallback;
      }),
    } as unknown as ConfigService;

    const redisProbe = jest.fn<ReturnType<HealthRedisProbe>, []>();

    return {
      service: new HealthService(dataSource, configService, redisProbe),
      dataSource,
      redisProbe,
    };
  };

  it('reports liveness without touching PostgreSQL or Redis', () => {
    const { service, dataSource, redisProbe } = createService();

    expect(service.liveness()).toEqual({
      status: 'alive',
      timestamp: expect.any(String),
      version: '47.0.0-test',
    });
    expect(dataSource.query).not.toHaveBeenCalled();
    expect(redisProbe).not.toHaveBeenCalled();
  });

  it('reports ready only when PostgreSQL and Redis are both available', async () => {
    const { service, dataSource, redisProbe } = createService();
    (dataSource.query as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
    redisProbe.mockResolvedValue(true);

    await expect(service.readiness()).resolves.toEqual({
      status: 'ready',
      timestamp: expect.any(String),
      database: 'connected',
      redis: 'connected',
    });
  });

  it('fails readiness closed when PostgreSQL is unavailable', async () => {
    const { service, dataSource, redisProbe } = createService();
    (dataSource.query as jest.Mock).mockRejectedValue(new Error('db unavailable'));
    redisProbe.mockResolvedValue(true);

    await expect(service.readiness()).resolves.toEqual({
      status: 'not_ready',
      timestamp: expect.any(String),
      database: 'disconnected',
      redis: 'connected',
    });
  });

  it('fails readiness closed when Redis is unavailable', async () => {
    const { service, dataSource, redisProbe } = createService();
    (dataSource.query as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
    redisProbe.mockResolvedValue(false);

    await expect(service.readiness()).resolves.toEqual({
      status: 'not_ready',
      timestamp: expect.any(String),
      database: 'connected',
      redis: 'disconnected',
    });
  });

  it('treats a Redis probe exception as unavailable without leaking details', async () => {
    const { service, dataSource, redisProbe } = createService();
    (dataSource.query as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
    redisProbe.mockRejectedValue(new Error('redis://user:secret@internal-host:6379'));

    const result = await service.readiness();

    expect(result).toEqual({
      status: 'not_ready',
      timestamp: expect.any(String),
      database: 'connected',
      redis: 'disconnected',
    });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('internal-host');
  });

  it('keeps the aggregate endpoint backward compatible while reporting Redis state', async () => {
    const { service, dataSource, redisProbe } = createService();
    (dataSource.query as jest.Mock).mockRejectedValue(new Error('db unavailable'));
    redisProbe.mockResolvedValue(true);

    await expect(service.check()).resolves.toEqual({
      status: 'degraded',
      timestamp: expect.any(String),
      environment: 'test',
      version: '47.0.0-test',
      database: 'disconnected',
      redis: 'connected',
    });
  });
});
