import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { HealthController } from './health.controller';
import {
  HEALTH_REDIS_PROBE,
  HealthRedisProbe,
  HealthService,
} from './health.service';

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    {
      provide: HEALTH_REDIS_PROBE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): HealthRedisProbe => async () => {
        const client = new Redis({
          host: configService.get<string>('redis.host', 'localhost'),
          port: configService.get<number>('redis.port', 6379),
          password: configService.get<string>('redis.password') || undefined,
          db: configService.get<number>('redis.db', 0),
          lazyConnect: true,
          connectTimeout: 1_000,
          commandTimeout: 1_000,
          maxRetriesPerRequest: 0,
          retryStrategy: () => null,
        });

        client.on('error', () => undefined);

        try {
          await client.connect();
          return (await client.ping()) === 'PONG';
        } catch {
          return false;
        } finally {
          client.disconnect();
        }
      },
    },
  ],
})
export class HealthModule {}
