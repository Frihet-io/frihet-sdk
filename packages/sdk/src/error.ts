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

export class ConflictError extends APIError {
  constructor(message = 'Conflict', requestId?: string) {
    super(409, 'conflict', message, requestId);
    this.name = 'ConflictError';
  }
}

/**
 * Raised when the server rejects a team invitation or role change because the
 * workspace plan's seat cap is reached. The server returns HTTP 409 with a
 * "Team limit reached" message; the SDK surfaces it as this typed subclass so
 * callers can branch on `instanceof TeamSeatLimitError` (e.g. to prompt an
 * upgrade) instead of string-matching error messages.
 */
export class TeamSeatLimitError extends ConflictError {
  constructor(message = 'Team seat limit reached', requestId?: string) {
    super(message, requestId);
    this.name = 'TeamSeatLimitError';
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

/**
 * Raised when the SDK is asked to use a capability the Frihet backend does
 * not provide. This happens BEFORE any HTTP request is made — it is a local,
 * deterministic failure, never a server response — so it extends FrihetError,
 * not APIError.
 *
 * `reason` distinguishes:
 * - 'absent': the backend has no such route at all (calling it would 404/405).
 * - 'not_implemented': the route is registered but deliberately returns
 *   501 NOT_IMPLEMENTED (e.g. reservation creation deferred for compliance
 *   side effects).
 */
export class CapabilityUnavailableError extends FrihetError {
  readonly capability: string;
  readonly reason: 'absent' | 'not_implemented';

  constructor(
    capability: string,
    reason: 'absent' | 'not_implemented',
    detail?: string,
    authority: 'runtime' | 'public_contract' = 'runtime',
  ) {
    const explanation = authority === 'public_contract'
      ? reason === 'absent'
        ? 'the capability is absent from the intended Frihet public API contract'
        : 'the intended Frihet public API capability is deliberately not implemented'
      : reason === 'absent'
        ? 'the Frihet backend has no such route'
        : 'the Frihet backend registers the route but deliberately does not implement it (501)';
    super(
      `Capability unavailable: ${capability} — ${explanation}. ` +
      'No request was sent. This is an SDK-side guard, not a server failure.' +
      (detail ? ` ${detail}` : ''),
    );
    this.name = 'CapabilityUnavailableError';
    this.capability = capability;
    this.reason = reason;
  }
}

export class TimeoutError extends FrihetError {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}
