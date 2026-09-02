import { AuthManager, type AuthSession } from './auth.js';
import { JustDeployError, JustDeployValidationError } from './errors.js';
import type { RequestOptions } from './types.js';
import { SDK_HEADER } from './version.js';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
const API_TIMEOUT_MS = 30_000;

interface ApiRequestOptions extends RequestOptions {
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
}

async function responsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new JustDeployError('JustDeploy returned a response that was not valid JSON.', { status: response.status });
  }
}

function apiError(response: Response, payload: unknown): JustDeployError {
  const details = payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
  const message = typeof details.message === 'string' && details.message.length > 0 ? details.message : `JustDeploy request failed with status ${response.status}.`;
  return new JustDeployError(message, {
    status: response.status,
    retryAfter: typeof details.retryAfter === 'number' ? details.retryAfter : null,
    requestId: typeof details.requestId === 'string' ? details.requestId : (response.headers.get('x-request-id') ?? null),
    details,
  });
}

function assertInternalPath(path: string): void {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://') || path.includes('\\')) {
    throw new Error('Invalid internal JustDeploy API path.');
  }
}

export class Transport {
  readonly auth: AuthManager;
  private readonly fetcher: typeof fetch;

  constructor(auth: AuthManager, fetcher: typeof fetch = globalThis.fetch) {
    this.auth = auth;
    this.fetcher = fetcher;
  }

  async organizationRequest<T>(method: Method, path: string, options: ApiRequestOptions = {}): Promise<T> {
    assertInternalPath(path);
    const session = await this.auth.getSession();
    return this.send<T>(method, path, session, options, false);
  }

  private async send<T>(method: Method, path: string, session: AuthSession, options: ApiRequestOptions, replayed: boolean): Promise<T> {
    const resolved = new URL(`/organizations/${encodeURIComponent(session.organizationId)}${path}`, session.apiOrigin);
    const headers: Record<string, string> = {
      accept: 'application/json',
      authorization: `Bearer ${session.token}`,
      'x-justdeploy-sdk': SDK_HEADER,
    };
    for (const [name, value] of Object.entries(options.headers ?? {})) {
      const normalized = name.toLowerCase();
      if (normalized === 'authorization' || normalized === 'host' || normalized === 'x-justdeploy-sdk') {
        throw new Error(`The internal header ${name} cannot be overridden.`);
      }
      headers[normalized] = value;
    }
    let body: string | undefined;
    try {
      body =
        options.body === undefined
          ? undefined
          : JSON.stringify(options.body, (_key, value: unknown) => {
              if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('invalid number');
              return value;
            });
    } catch {
      throw new JustDeployValidationError('The request contains a value that cannot be encoded as JSON.');
    }
    if (body !== undefined) headers['content-type'] = 'application/json';

    const request: RequestInit = { method, headers, redirect: 'error' };
    if (body !== undefined) request.body = body;
    const timeout = AbortSignal.timeout(API_TIMEOUT_MS);
    const requestSignal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    request.signal = requestSignal;

    let response: Response;
    try {
      response = await this.fetcher(resolved, request);
    } catch {
      const message = options.signal?.aborted
        ? 'The JustDeploy request was canceled.'
        : requestSignal.aborted
          ? 'The JustDeploy request timed out.'
          : 'The JustDeploy request failed before the server returned a response.';
      throw new JustDeployError(message);
    }

    if (response.status === 401 && method === 'GET' && !replayed) {
      await response.body?.cancel().catch(() => undefined);
      const refreshed = await this.auth.refreshAfterUnauthorized(session.token);
      return this.send<T>(method, path, refreshed, options, true);
    }

    const payload = await responsePayload(response);
    if (!response.ok) throw apiError(response, payload);
    return payload as T;
  }

  async presigned(url: string, init: RequestInit): Promise<Response> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new JustDeployError('JustDeploy returned an invalid file URL.');
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
      throw new JustDeployError('JustDeploy returned an invalid file URL.');
    }

    try {
      return await this.fetcher(parsed, { ...init, redirect: 'error' });
    } catch {
      throw new JustDeployError(init.signal?.aborted ? 'The file transfer was canceled.' : 'The file transfer failed before the server returned a response.');
    }
  }

}
