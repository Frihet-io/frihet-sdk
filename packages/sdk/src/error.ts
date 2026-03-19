export class FrihetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FrihetError';
  }
}

export class APIError extends FrihetError {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export class AuthenticationError extends APIError {
  constructor(message = 'Invalid or missing API key') {
    super(401, 'authentication_error', message);
    this.name = 'AuthenticationError';
  }
}

export class NotFoundError extends APIError {
  constructor(message = 'Resource not found') {
    super(404, 'not_found', message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends APIError {
  readonly details?: unknown[];

  constructor(message: string, details?: unknown[]) {
    super(400, 'validation_error', message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class RateLimitError extends APIError {
  readonly retryAfter?: number;

  constructor(retryAfter?: number) {
    super(429, 'rate_limit_exceeded', 'Rate limit exceeded. Please retry later.');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class TimeoutError extends FrihetError {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}
