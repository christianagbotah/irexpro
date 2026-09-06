import { runGate } from './required-ci-gate.mjs';

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_SECONDS = 2;
const DEFAULT_MAX_DELAY_SECONDS = 20;
const DEFAULT_OVERALL_TIMEOUT_SECONDS = 2400;

function positiveIntegerEnvironment(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function isTransientGateError(error) {
  const message = errorMessage(error);
  const statusMatch = message.match(/GitHub API request failed \((\d{3})\)/);
  if (statusMatch) {
    const status = Number.parseInt(statusMatch[1], 10);
    return status === 408 || status === 425 || status === 429 || status >= 500;
  }

  return /(?:fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|UND_ERR_(?:CONNECT|HEADERS|BODY)_TIMEOUT|socket hang up)/i.test(
    message,
  );
}

export function retryDelaySeconds(attempt, baseDelaySeconds, maxDelaySeconds) {
  return Math.min(maxDelaySeconds, baseDelaySeconds * 2 ** Math.max(0, attempt - 1));
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

export function runSelfTests() {
  assertEqual(
    isTransientGateError(new Error('GitHub API request failed (502) for /actions/runs')),
    true,
    '502 is transient',
  );
  assertEqual(
    isTransientGateError(new Error('GitHub API request failed (429) for /actions/runs')),
    true,
    '429 is transient',
  );
  assertEqual(
    isTransientGateError(new TypeError('fetch failed: UND_ERR_CONNECT_TIMEOUT')),
    true,
    'network timeout is transient',
  );
  assertEqual(
    isTransientGateError(new Error('GitHub API request failed (404) for /pulls/123')),
    false,
    '404 is not transient',
  );
  assertEqual(
    isTransientGateError(new Error('GitHub API request failed (403) for /actions/runs')),
    false,
    '403 is not blindly retried',
  );
  assertEqual(
    isTransientGateError(new Error('API CI failed the required gate: conclusion=failure')),
    false,
    'real workflow failure is not transient',
  );
  assertEqual(retryDelaySeconds(1, 2, 20), 2, 'attempt 1 delay');
  assertEqual(retryDelaySeconds(2, 2, 20), 4, 'attempt 2 delay');
  assertEqual(retryDelaySeconds(5, 2, 20), 20, 'delay is capped');

  console.log('Required CI gate runner self-tests passed.');
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function runGateWithTransientRetries() {
  const maxAttempts = positiveIntegerEnvironment(
    'REQUIRED_GATE_API_RETRY_ATTEMPTS',
    DEFAULT_MAX_ATTEMPTS,
  );
  const baseDelaySeconds = positiveIntegerEnvironment(
    'REQUIRED_GATE_API_RETRY_BASE_SECONDS',
    DEFAULT_BASE_DELAY_SECONDS,
  );
  const maxDelaySeconds = positiveIntegerEnvironment(
    'REQUIRED_GATE_API_RETRY_MAX_SECONDS',
    DEFAULT_MAX_DELAY_SECONDS,
  );
  const overallTimeoutSeconds = positiveIntegerEnvironment(
    'REQUIRED_WORKFLOW_TIMEOUT_SECONDS',
    DEFAULT_OVERALL_TIMEOUT_SECONDS,
  );

  const originalTimeout = process.env.REQUIRED_WORKFLOW_TIMEOUT_SECONDS;
  const deadline = Date.now() + overallTimeoutSeconds * 1000;

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const remainingSeconds = Math.floor((deadline - Date.now()) / 1000);
      if (remainingSeconds <= 0) {
        throw new Error(
          `Timed out after ${overallTimeoutSeconds}s while retrying transient GitHub API failures`,
        );
      }

      // Preserve one overall deadline across retries instead of restarting the
      // gate's full polling timeout after each transient failure.
      process.env.REQUIRED_WORKFLOW_TIMEOUT_SECONDS = String(remainingSeconds);

      try {
        await runGate();
        return;
      } catch (error) {
        if (!isTransientGateError(error) || attempt === maxAttempts) {
          throw error;
        }

        const delaySeconds = retryDelaySeconds(
          attempt,
          baseDelaySeconds,
          maxDelaySeconds,
        );
        const delayMilliseconds = Math.min(
          delaySeconds * 1000,
          Math.max(0, deadline - Date.now()),
        );
        if (delayMilliseconds <= 0) throw error;

        console.warn(
          `Required CI Gate hit a transient GitHub API/network error on attempt ${attempt}/${maxAttempts}: ${errorMessage(error)}. Retrying in ${Math.ceil(delayMilliseconds / 1000)}s.`,
        );
        await sleep(delayMilliseconds);
      }
    }
  } finally {
    if (originalTimeout === undefined) {
      delete process.env.REQUIRED_WORKFLOW_TIMEOUT_SECONDS;
    } else {
      process.env.REQUIRED_WORKFLOW_TIMEOUT_SECONDS = originalTimeout;
    }
  }
}

if (process.argv.includes('--self-test')) {
  runSelfTests();
} else if (import.meta.url === `file://${process.argv[1]}`) {
  runGateWithTransientRetries().catch((error) => {
    console.error(`Required CI Gate failed: ${errorMessage(error)}`);
    process.exit(1);
  });
}
