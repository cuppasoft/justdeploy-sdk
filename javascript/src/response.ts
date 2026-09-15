import type { JustDeployErrorOptions } from './errors.js';

function retryDelay(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function requestId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[^A-Za-z0-9_-]/.test(value) ? value : null;
}

/** The body owns diagnostics; headers recover missing or malformed fields. */
export function responseDetails(response: Response, payload?: unknown): JustDeployErrorOptions {
  const details = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const headerDelay = response.headers.get('retry-after');
  return {
    status: response.status,
    retryAfter: retryDelay(details.retryAfter) ?? (headerDelay !== null && headerDelay.length > 0 && !/[^0-9]/.test(headerDelay) ? retryDelay(Number(headerDelay)) : null),
    requestId: requestId(details.requestId) ?? requestId(response.headers.get('x-request-id')),
    details,
  };
}
