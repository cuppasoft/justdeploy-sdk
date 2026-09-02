import { createPrivateKey, sign } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { JustDeployAuthenticationError, JustDeployConfigurationError } from './errors.js';
import { SDK_HEADER } from './version.js';

const DEFAULT_API_ORIGIN = 'https://api.justdeploy.net';
const DEFAULT_IDENTITY_PATH = '/opt/justdeploy/identity.json';
const REFRESH_WINDOW_MS = 3 * 60 * 1000;
const AUTH_TIMEOUT_MS = 10_000;
const MAX_IDENTITY_BYTES = 16 * 1024;
const BUILD_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLATFORM_ID = /^[a-z0-9]{16}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

interface IdentityDocument {
  protocolVersion: number;
  buildId: string;
  privateKey: string;
  apiBaseUrl: string;
}

export interface AuthSession {
  token: string;
  organizationId: string;
  expiresAt: number;
  apiOrigin: string;
}

export interface AuthManagerOptions {
  env?: NodeJS.ProcessEnv;
  identityPath?: string;
  fetcher?: typeof fetch;
  now?: () => number;
}

interface ResolvedAuthentication {
  apiOrigin: string;
  credentials: { accessKey: string; secretKey: string } | null;
  identity: IdentityDocument | null;
}

function validateApiOrigin(value: unknown): string {
  if (typeof value !== 'string') throw new JustDeployConfigurationError('The JustDeploy API URL in the deployment identity is invalid.');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new JustDeployConfigurationError('The JustDeploy API URL in the deployment identity is invalid.');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new JustDeployConfigurationError('The JustDeploy API URL in the deployment identity must be an HTTPS origin.');
  }
  return parsed.origin;
}

function parseIdentity(path: string, requireBuildKey: boolean): IdentityDocument | null {
  let initialMetadata;
  try {
    initialMetadata = lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new JustDeployConfigurationError('The JustDeploy deployment identity could not be inspected.');
  }
  if (!initialMetadata.isFile() || initialMetadata.isSymbolicLink()) {
    throw new JustDeployConfigurationError('The JustDeploy deployment identity must be a regular file, not a link or directory.');
  }

  let descriptor: number;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new JustDeployConfigurationError('The JustDeploy deployment identity could not be opened safely.');
  }

  let raw: Buffer | null = null;
  let value: unknown;
  try {
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile() || metadata.dev !== initialMetadata.dev || metadata.ino !== initialMetadata.ino) {
      throw new JustDeployConfigurationError('The JustDeploy deployment identity must be a regular file, not a link or directory.');
    }
    const permissions = metadata.mode & 0o777;
    if ((permissions & 0o333) !== 0 || (permissions & 0o444) === 0) {
      throw new JustDeployConfigurationError('The JustDeploy deployment identity must be readable and have no write or execute permissions.');
    }
    if (metadata.size <= 0 || metadata.size > MAX_IDENTITY_BYTES) {
      throw new JustDeployConfigurationError('The JustDeploy deployment identity has an invalid size.');
    }
    raw = Buffer.allocUnsafe(metadata.size + 1);
    let bytesRead = 0;
    while (bytesRead < raw.length) {
      const count = readSync(descriptor, raw, bytesRead, raw.length - bytesRead, null);
      if (count === 0) break;
      bytesRead += count;
    }
    if (bytesRead !== metadata.size) {
      throw new JustDeployConfigurationError('The JustDeploy deployment identity changed while it was being read.');
    }
    try {
      value = JSON.parse(raw.subarray(0, bytesRead).toString('utf8'));
    } catch {
      throw new JustDeployConfigurationError('The JustDeploy deployment identity is not valid JSON.');
    }
  } catch (error) {
    if (error instanceof JustDeployConfigurationError) throw error;
    throw new JustDeployConfigurationError('The JustDeploy deployment identity could not be read.');
  } finally {
    raw?.fill(0);
    closeSync(descriptor);
  }
  if (!value || typeof value !== 'object') {
    throw new JustDeployConfigurationError('The JustDeploy deployment identity is invalid.');
  }
  const document = value as Partial<IdentityDocument>;
  const apiBaseUrl = validateApiOrigin(document.apiBaseUrl);
  if (document.protocolVersion !== 1) {
    throw new JustDeployConfigurationError('The JustDeploy deployment identity protocol is not supported by this SDK.');
  }

  if (requireBuildKey && (!document.buildId || !BUILD_UUID.test(document.buildId) || typeof document.privateKey !== 'string' || document.privateKey.length === 0)) {
    throw new JustDeployConfigurationError('The JustDeploy deployment identity is missing a valid build key.');
  }

  return {
    protocolVersion: 1,
    buildId: document.buildId ?? '',
    privateKey: document.privateKey ?? '',
    apiBaseUrl,
  };
}

async function authenticationError(response: Response): Promise<JustDeployAuthenticationError> {
  let details: Record<string, unknown> = {};
  try {
    const payload = (await response.json()) as unknown;
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) details = payload as Record<string, unknown>;
  } catch {
    // The status and request id still make a non-JSON rejection actionable.
  }
  const message = typeof details.message === 'string' && details.message.length > 0 ? details.message : 'JustDeploy authentication was rejected.';
  return new JustDeployAuthenticationError(message, {
    status: response.status,
    retryAfter: typeof details.retryAfter === 'number' ? details.retryAfter : null,
    requestId: typeof details.requestId === 'string' ? details.requestId : (response.headers.get('x-request-id') ?? null),
    details,
  });
}

export class AuthManager {
  private readonly env: NodeJS.ProcessEnv;
  private readonly identityPath: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private session: AuthSession | null = null;
  private refresh: Promise<AuthSession> | null = null;
  private credentialAuthentication: ResolvedAuthentication | null = null;

  constructor(options: AuthManagerOptions = {}) {
    this.env = { ...(options.env ?? process.env) };
    this.identityPath = options.identityPath ?? DEFAULT_IDENTITY_PATH;
    this.fetcher = options.fetcher ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
  }

  async getSession(forceRefresh = false): Promise<AuthSession> {
    if (!forceRefresh && this.session && this.session.expiresAt - this.now() > REFRESH_WINDOW_MS) {
      return this.session;
    }
    if (this.refresh) return this.refresh;

    this.refresh = this.exchange().then((session) => {
      this.session = session;
      return session;
    });
    try {
      return await this.refresh;
    } finally {
      this.refresh = null;
    }
  }

  invalidate(token: string): void {
    if (this.session?.token === token) this.session = null;
  }

  async refreshAfterUnauthorized(token: string): Promise<AuthSession> {
    if (this.session && this.session.token !== token) return this.getSession();
    this.invalidate(token);
    return this.getSession(true);
  }

  private resolveAuthentication(): ResolvedAuthentication {
    const access = this.env.JUSTDEPLOY_ACCESS_KEY;
    const secret = this.env.JUSTDEPLOY_SECRET_KEY;
    const hasAccess = access !== undefined;
    const hasSecret = secret !== undefined;

    if (hasAccess !== hasSecret || (hasAccess && (!access || !secret))) {
      throw new JustDeployAuthenticationError('Set both JUSTDEPLOY_ACCESS_KEY and JUSTDEPLOY_SECRET_KEY to non-empty values.');
    }
    if (hasAccess && hasSecret && this.credentialAuthentication) return this.credentialAuthentication;

    const identity = parseIdentity(this.identityPath, !hasAccess);
    const apiOrigin = identity?.apiBaseUrl ?? DEFAULT_API_ORIGIN;
    if (hasAccess && hasSecret) {
      this.credentialAuthentication ??= { apiOrigin, credentials: { accessKey: access, secretKey: secret }, identity: null };
      return this.credentialAuthentication;
    }
    if (!identity) {
      throw new JustDeployAuthenticationError(
        'JustDeploy authentication is not configured. Set JUSTDEPLOY_ACCESS_KEY and JUSTDEPLOY_SECRET_KEY for local development; deployed JustDeploy applications receive an identity automatically.',
      );
    }
    return { apiOrigin, credentials: null, identity };
  }

  private async exchange(): Promise<AuthSession> {
    const resolved = this.resolveAuthentication();
    if (resolved.credentials) return this.exchangeCredential(resolved.apiOrigin, resolved.credentials);
    return this.exchangeBuild(resolved.apiOrigin, resolved.identity!);
  }

  private async exchangeCredential(apiOrigin: string, credentials: { accessKey: string; secretKey: string }): Promise<AuthSession> {
    return this.requestSession(
      apiOrigin,
      `${apiOrigin}/auth/credential`,
      {
        authorization: `Bearer ${credentials.accessKey}:${credentials.secretKey}`,
        accept: 'application/json',
        'content-type': 'application/json',
        'x-justdeploy-sdk': SDK_HEADER,
      },
      '{}',
    );
  }

  private async exchangeBuild(apiOrigin: string, identity: IdentityDocument): Promise<AuthSession> {
    const issuedAt = Math.floor(this.now() / 1000);
    const signingInput = `justdeploy-build-auth-v1\n${apiOrigin}\nPOST\n/auth/build\n${identity.buildId}\n${issuedAt}`;
    let encodedKey: Buffer | null = null;
    let signature: string;
    try {
      if (!CANONICAL_BASE64.test(identity.privateKey)) throw new Error('invalid encoding');
      encodedKey = Buffer.from(identity.privateKey, 'base64');
      if (encodedKey.toString('base64') !== identity.privateKey) throw new Error('invalid encoding');
      const key = createPrivateKey({ key: encodedKey, format: 'der', type: 'pkcs8' });
      if (key.asymmetricKeyType !== 'ed25519') throw new Error('invalid key type');
      signature = sign(null, Buffer.from(signingInput, 'utf8'), key).toString('base64url');
    } catch {
      throw new JustDeployConfigurationError('The JustDeploy deployment identity contains an invalid Ed25519 private key.');
    } finally {
      encodedKey?.fill(0);
    }

    return this.requestSession(
      apiOrigin,
      `${apiOrigin}/auth/build`,
      {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-justdeploy-build-signature': signature,
        'x-justdeploy-sdk': SDK_HEADER,
      },
      JSON.stringify({ buildId: identity.buildId, issuedAt }),
    );
  }

  private async requestSession(apiOrigin: string, url: string, headers: Record<string, string>, body: string): Promise<AuthSession> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: 'POST',
        headers,
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
      });
    } catch {
      throw new JustDeployAuthenticationError('JustDeploy authentication failed before the server returned a response.');
    }

    if (!response.ok) {
      throw await authenticationError(response);
    }

    let payload: { token?: unknown; organizationId?: unknown; expiresAt?: unknown };
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      throw new JustDeployAuthenticationError('JustDeploy returned an invalid authentication response.', {
        status: response.status,
        requestId: response.headers.get('x-request-id'),
      });
    }
    const expiresAt = typeof payload.expiresAt === 'string' && ISO_TIMESTAMP.test(payload.expiresAt) ? Date.parse(payload.expiresAt) : Number.NaN;
    if (
      typeof payload.token !== 'string' ||
      payload.token.length === 0 ||
      typeof payload.organizationId !== 'string' ||
      !PLATFORM_ID.test(payload.organizationId) ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= this.now()
    ) {
      throw new JustDeployAuthenticationError('JustDeploy returned an invalid authentication response.', {
        status: response.status,
        requestId: response.headers.get('x-request-id'),
      });
    }

    return { token: payload.token, organizationId: payload.organizationId, expiresAt, apiOrigin };
  }
}
