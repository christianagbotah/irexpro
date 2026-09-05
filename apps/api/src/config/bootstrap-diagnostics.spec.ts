import { getBootstrapLogLevels, isSwaggerAvailable } from './bootstrap-diagnostics';

describe('bootstrap diagnostics policy', () => {
  it('omits debug logging in production', () => {
    expect(getBootstrapLogLevels('production')).toEqual(['log', 'error', 'warn']);
  });

  it.each(['development', 'test', 'staging', undefined])(
    'retains debug logging outside production (%s)',
    (environment) => {
      expect(getBootstrapLogLevels(environment)).toEqual(['log', 'error', 'warn', 'debug']);
    },
  );

  it('never exposes Swagger in production', () => {
    expect(isSwaggerAvailable('production', true)).toBe(false);
    expect(isSwaggerAvailable('production', false)).toBe(false);
  });

  it.each(['development', 'test', 'staging'])(
    'respects the Swagger configuration outside production (%s)',
    (environment) => {
      expect(isSwaggerAvailable(environment, true)).toBe(true);
      expect(isSwaggerAvailable(environment, false)).toBe(false);
    },
  );
});
