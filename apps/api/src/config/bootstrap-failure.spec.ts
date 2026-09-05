import { handleBootstrapFailure } from './bootstrap-failure';

describe('handleBootstrapFailure', () => {
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it('logs only a fixed secret-safe message and marks the process as failed', () => {
    const logger = { error: jest.fn() };
    process.exitCode = 0;

    handleBootstrapFailure(logger);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('iRexPro API bootstrap failed');
    expect(process.exitCode).toBe(1);
  });
});
