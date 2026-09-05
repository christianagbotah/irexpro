import type { LogLevel } from '@nestjs/common';

const PRODUCTION_LOG_LEVELS: LogLevel[] = ['log', 'error', 'warn'];

export function getBootstrapLogLevels(environment?: string): LogLevel[] {
  const levels = [...PRODUCTION_LOG_LEVELS];

  if (environment !== 'production') {
    levels.push('debug');
  }

  return levels;
}

export function isSwaggerAvailable(environment: string, configuredEnabled: boolean): boolean {
  return environment !== 'production' && configuredEnabled;
}
