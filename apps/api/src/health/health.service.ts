import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export const HEALTH_REDIS_PROBE = Symbol('HEALTH_REDIS_PROBE');

export type HealthRedisProbe = () => Promise<boolean>;

export interface LivenessView {
  status: 'alive';
  timestamp: string;
  version: string;
}

export interface ReadinessView {
  status: 'ready' | 'not_ready';
  timestamp: string;
  database: 'connected' | 'disconnected';
  redis: 'connected' | 'disconnected';
}

export interface AggregateHealthView {
  status: 'ok' | 'degraded';
  timestamp: string;
  environment: string;
  version: string;
  database: 'connected' | 'disconnected';
  redis: 'connected' | 'disconnected';
}

@Injectable()
export class HealthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    @Inject(HEALTH_REDIS_PROBE) private readonly redisProbe: HealthRedisProbe,
  ) {}

  liveness(): LivenessView {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      version: this.configService.get<string>('app.version', '0.1.0'),
    };
  }

  async readiness(): Promise<ReadinessView> {
    const [databaseReady, redisReady] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    return {
      status: databaseReady && redisReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      database: databaseReady ? 'connected' : 'disconnected',
      redis: redisReady ? 'connected' : 'disconnected',
    };
  }

  async check(): Promise<AggregateHealthView> {
    const readiness = await this.readiness();

    return {
      status: readiness.status === 'ready' ? 'ok' : 'degraded',
      timestamp: readiness.timestamp,
      environment: this.configService.get<string>('app.env', 'development'),
      version: this.configService.get<string>('app.version', '0.1.0'),
      database: readiness.database,
      redis: readiness.redis,
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      return await this.redisProbe();
    } catch {
      return false;
    }
  }
}
