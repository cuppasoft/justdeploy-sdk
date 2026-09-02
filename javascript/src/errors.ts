export interface JustDeployErrorOptions {
  status?: number | null;
  retryAfter?: number | null;
  requestId?: string | null;
  details?: Readonly<Record<string, unknown>>;
}

/** A safe, structured error returned by the SDK or the JustDeploy API. */
export class JustDeployError extends Error {
  readonly status: number | null;
  readonly retryAfter: number | null;
  readonly requestId: string | null;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(message: string, options: JustDeployErrorOptions = {}) {
    super(message);
    this.name = 'JustDeployError';
    this.status = options.status ?? null;
    this.retryAfter = options.retryAfter ?? null;
    this.requestId = options.requestId ?? null;
    this.details = options.details ?? {};
  }
}

export class JustDeployAuthenticationError extends JustDeployError {
  constructor(message: string, options: JustDeployErrorOptions = {}) {
    super(message, options);
    this.name = 'JustDeployAuthenticationError';
  }
}

export class JustDeployConfigurationError extends JustDeployError {
  constructor(message: string) {
    super(message);
    this.name = 'JustDeployConfigurationError';
  }
}

export class JustDeployValidationError extends JustDeployError {
  constructor(message: string) {
    super(message);
    this.name = 'JustDeployValidationError';
  }
}
