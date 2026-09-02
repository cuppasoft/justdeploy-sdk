import { JustDeployValidationError } from './errors.js';

export function pathSegment(value: string, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new JustDeployValidationError(`${label} must be a non-empty string.`);
  }
  return encodeURIComponent(value);
}

export function pageQuery(options: { limit?: number; cursor?: number }, maxLimit: number): string {
  const params = new URLSearchParams();
  if (options.limit !== undefined) {
    if (!Number.isInteger(options.limit) || options.limit <= 0 || options.limit > maxLimit) {
      throw new JustDeployValidationError(`limit must be an integer between 1 and ${maxLimit}.`);
    }
    params.set('limit', String(options.limit));
  }
  if (options.cursor !== undefined) {
    if (!Number.isInteger(options.cursor) || options.cursor <= 0) {
      throw new JustDeployValidationError('cursor must be a positive integer.');
    }
    params.set('cursor', String(options.cursor));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}
