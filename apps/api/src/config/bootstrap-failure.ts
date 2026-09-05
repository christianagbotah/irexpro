export interface BootstrapFailureLogger {
  error(message: string): void;
}

/**
 * Fail closed when API bootstrap rejects.
 *
 * Startup exceptions can contain connection strings, provider details, or
 * other configuration-derived values. Keep the operator-facing message fixed
 * and do not serialize the rejected value here; detailed diagnosis belongs in
 * secret-safe startup probes and configuration validation.
 */
export function handleBootstrapFailure(logger: BootstrapFailureLogger): void {
  logger.error('iRexPro API bootstrap failed');
  process.exitCode = 1;
}
