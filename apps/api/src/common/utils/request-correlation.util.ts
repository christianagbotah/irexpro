import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

interface RequestCorrelationStore {
  correlationId: string;
}

const requestCorrelationStorage = new AsyncLocalStorage<RequestCorrelationStore>();

/**
 * Generate a server-owned correlation identifier.
 *
 * Incoming request IDs are deliberately not reused: callers must not be able
 * to forge log/audit correlation with another request. A fresh UUID is created
 * for every HTTP request and returned to the client via X-Correlation-Id.
 */
export function createCorrelationId(): string {
  return randomUUID();
}

/** Execute a request pipeline inside one correlation context. */
export function runWithCorrelationId<T>(correlationId: string, callback: () => T): T {
  return requestCorrelationStorage.run({ correlationId }, callback);
}

/** Return the current request correlation ID, or undefined for background work. */
export function getCorrelationId(): string | undefined {
  return requestCorrelationStorage.getStore()?.correlationId;
}
