import { APIError, AuthenticationError, ConflictError, NotFoundError, RateLimitError, TeamSeatLimitError, TimeoutError, ValidationError } from './error.js';
import type { FrihetOptions, Page, RequestOptions } from './types.js';

declare const __SDK_VERSION__: string;

const DEFAULT_BASE_URL = 'https://api.frihet.io/v1';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_AUTOMATIC_RETRY_AFTER_MS = 60_000;
const SDK_VERSION = typeof __SDK_VERSION__ !== 'undefined' ? __SDK_VERSION__ : '0.0.0-dev';
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

interface RequestState {
  /** Resolved once per logical request and reused by every retry attempt. */
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs: number;
}

function formatUuidV4(bytes: Uint8Array): string {
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Generate a cryptographically strong, API-safe key (UUID v4, 36 chars).
 *
 * Modern browsers and current Node versions expose Web Crypto globally. Node
 * 18 is still in the SDK support range and may not expose global Web Crypto,
 * so it falls back to node:crypto. There is deliberately no Math.random
 * fallback: retry safety must never depend on weak or collision-prone entropy.
 */
async function generateIdempotencyKey(): Promise<string> {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  if (typeof webCrypto?.getRandomValues === 'function') {
    return formatUuidV4(webCrypto.getRandomValues(new Uint8Array(16)));
  }

  const { randomUUID } = await import('node:crypto');
  return randomUUID();
}

function parseRetryAfterSeconds(retryAfter: string | null): number | undefined {
  const value = retryAfter?.trim();
  if (!value || !/^\d+$/.test(value)) return undefined;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) ? seconds : undefined;
}

function retryDelayMs(retryAfter: string | null, retryCount: number): number | null {
  // Frihet emits Retry-After as integer delta-seconds. Invalid/missing values
  // use exponential backoff; a valid but excessive value is returned to the
  // caller instead of scheduling an overflowing or hours-long timer.
  const seconds = parseRetryAfterSeconds(retryAfter);
  if (seconds === undefined) return BASE_RETRY_DELAY_MS * Math.pow(2, retryCount);
  const milliseconds = seconds * 1000;
  return milliseconds <= MAX_AUTOMATIC_RETRY_AFTER_MS ? milliseconds : null;
}

function waitBeforeRetry(ms: number, signal: AbortSignal | undefined, timeoutMs: number): Promise<void> {
  if (signal?.aborted) return Promise.reject(new TimeoutError(timeoutMs));

  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new TimeoutError(timeoutMs));
    };
    timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function discardResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Retry safety must not depend on connection-pool cleanup succeeding.
  }
}

interface ApiErrorBody {
  error: string;
  message?: string;
  details?: unknown[];
}

export class HttpClient {
  private readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeout: number;

  constructor(opts: FrihetOptions) {
    if (!opts.apiKey) {
      throw new Error('apiKey is required. Get one at https://app.frihet.io/settings/security');
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeout = opts.timeout ?? DEFAULT_TIMEOUT_MS;
  }

  private get defaultHeaders(): Record<string, string> {
    return {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': `@frihet/sdk/${SDK_VERSION} (node)`,
    };
  }

  async get<T>(path: string, query?: Record<string, string | number | boolean | undefined>, opts?: RequestOptions): Promise<T> {
    return this.request('GET', path, undefined, query, opts);
  }

  async post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request('POST', path, body, undefined, opts);
  }

  async patch<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request('PATCH', path, body, undefined, opts);
  }

  async del<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request('DELETE', path, undefined, undefined, opts);
  }

  async getPage<T>(path: string, query?: Record<string, string | number | boolean | undefined>, opts?: RequestOptions): Promise<Page<T>> {
    const raw = await this.requestRaw('GET', path, undefined, query, opts);
    const body = await raw.json();
    const page = this.extractPageFromEnvelope<T>(body);
    if (!page) {
      throw new APIError(200, 'invalid_response', 'Expected paginated response with data array', this.extractRequestId(raw));
    }
    return page;
  }

  async getRaw(path: string, opts?: RequestOptions): Promise<ArrayBuffer> {
    const response = await this.requestRaw('GET', path, undefined, undefined, opts);
    return response.arrayBuffer();
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
    opts?: RequestOptions,
  ): Promise<T> {
    const response = await this.requestRaw(method, path, body, query, opts);

    if (response.status === 204) {
      return undefined as T;
    }

    const json = await response.json();
    return this.unwrapEnvelope<T>(json);
  }

  private async requestRaw(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
    opts?: RequestOptions,
  ): Promise<Response> {
    const explicitKey = opts?.idempotencyKey;
    const usableExplicitKey = explicitKey && explicitKey.trim().length > 0
      ? explicitKey
      : undefined;
    const state: RequestState = {
      idempotencyKey: usableExplicitKey ?? (method === 'POST' ? await generateIdempotencyKey() : undefined),
      signal: opts?.signal,
      timeoutMs: opts?.timeout ?? this.timeout,
    };

    return this.requestAttempt(method, path, body, query, state, 0);
  }

  private async requestAttempt(
    method: string,
    path: string,
    body: unknown,
    query: Record<string, string | number | boolean | undefined> | undefined,
    state: RequestState,
    retryCount = 0,
  ): Promise<Response> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }

    const headers = { ...this.defaultHeaders };
    if (state.idempotencyKey) {
      headers['Idempotency-Key'] = state.idempotencyKey;
    }

    const controller = new AbortController();
    const timeoutMs = state.timeoutMs;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // If user provides their own signal, forward its abort to our controller.
    // Capture the signal itself: RequestOptions is caller-owned and mutable.
    const callerSignal = state.signal;
    let removeAbortListener: (() => void) | undefined;
    if (callerSignal) {
      if (callerSignal.aborted) {
        clearTimeout(timeoutId);
        throw new TimeoutError(timeoutMs);
      } else {
        const forwardAbort = () => controller.abort();
        callerSignal.addEventListener('abort', forwardAbort, { once: true });
        removeAbortListener = () => callerSignal.removeEventListener('abort', forwardAbort);
      }
    }

    let response: Response | undefined;
    let fetchError: unknown;
    try {
      response = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      fetchError = err;
    } finally {
      clearTimeout(timeoutId);
      removeAbortListener?.();
    }

    if (!response) {
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        throw new TimeoutError(timeoutMs);
      }
      // A POST is retryable only because its one logical request owns one stable
      // Idempotency-Key. PATCH/DELETE headers are forwarded for compatibility,
      // but the Frihet API does not protect those methods, so never retry their
      // uncertain outcomes. Cleanup above happens before backoff, and the wait
      // itself observes caller cancellation.
      const canRetryUncertainOutcome = method === 'GET' || (method === 'POST' && Boolean(state.idempotencyKey));
      if (retryCount < MAX_RETRIES && canRetryUncertainOutcome) {
        const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount);
        await waitBeforeRetry(delayMs, callerSignal, timeoutMs);
        return this.requestAttempt(method, path, body, query, state, retryCount + 1);
      }
      throw fetchError;
    }

    // Frihet's 429 is emitted by the API-key rate limiter before path dispatch,
    // so it is safe to retry for every method: no handler has run. A 5xx is an
    // uncertain outcome and follows the stricter GET-or-protected-POST rule.
    const canRetryUncertainOutcome = method === 'GET' || (method === 'POST' && Boolean(state.idempotencyKey));
    const shouldRetryStatus = response.status === 429 ||
      (response.status >= 500 && response.status <= 599 && canRetryUncertainOutcome);
    if (RETRYABLE_STATUS_CODES.has(response.status) && shouldRetryStatus && retryCount < MAX_RETRIES) {
      if (response.status === 429) {
        const delayMs = retryDelayMs(response.headers.get('Retry-After'), retryCount);
        if (delayMs === null) {
          await discardResponseBody(response);
          throw new RateLimitError(parseRetryAfterSeconds(response.headers.get('Retry-After')));
        }
        await discardResponseBody(response);
        await waitBeforeRetry(delayMs, callerSignal, timeoutMs);
      } else {
        // 5xx — exponential backoff
        const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount);
        await discardResponseBody(response);
        await waitBeforeRetry(delayMs, callerSignal, timeoutMs);
      }
      return this.requestAttempt(method, path, body, query, state, retryCount + 1);
    }

    // Final rate limit error (after retries exhausted)
    if (response.status === 429) {
      throw new RateLimitError(parseRetryAfterSeconds(response.headers.get('Retry-After')));
    }

    // Error responses
    if (!response.ok) {
      const requestId = this.extractRequestId(response);
      let errorBody: ApiErrorBody;
      try {
        const json = await response.json();
        // API error responses may or may not be wrapped
        errorBody = json.error ? json : (json.data ?? json);
      } catch {
        errorBody = { error: `http_${response.status}`, message: response.statusText };
      }
      throw this.buildError(response.status, errorBody, requestId);
    }

    return response;
  }

  /**
   * Unwrap the API response envelope.
   * API returns: { data: T, meta: {...} } for single resources
   *              { data: T[], total, limit, offset, meta: {...} } for lists
   */
  private unwrapEnvelope<T>(json: unknown): T {
    if (json && typeof json === 'object' && 'data' in json) {
      const obj = json as Record<string, unknown>;
      // Paginated response — return full envelope so Page<T> shape is preserved
      if ('total' in obj && 'limit' in obj) {
        return json as T;
      }
      // Single resource or action result — unwrap
      return obj.data as T;
    }
    // No envelope (shouldn't happen with current API, but be safe)
    return json as T;
  }

  private extractPageFromEnvelope<T>(json: unknown): Page<T> | null {
    if (!json || typeof json !== 'object') return null;
    const obj = json as Record<string, unknown>;

    // Direct paginated shape
    if (Array.isArray(obj.data) && 'total' in obj) {
      return {
        data: obj.data as T[],
        total: obj.total as number,
        limit: obj.limit as number,
        offset: obj.offset as number,
        ...(obj.nextCursor ? { nextCursor: obj.nextCursor as string } : {}),
      };
    }
    return null;
  }

  private extractRequestId(response: Response): string | undefined {
    return response.headers.get('X-Request-Id') ?? undefined;
  }

  private buildError(status: number, body: ApiErrorBody, requestId?: string): APIError {
    switch (status) {
      case 401: return new AuthenticationError(body.message);
      case 404: return new NotFoundError(body.message);
      case 400:
      case 422: return new ValidationError(body.message ?? body.error, body.details);
      case 409: {
        const msg = body.message ?? body.error;
        // The team seat-cap rejection is a 409 with a "Team limit reached"
        // message — surface it as a dedicated typed error so callers can branch
        // on it (e.g. prompt an upgrade) without string-matching.
        if (typeof msg === 'string' && /team limit reached/i.test(msg)) {
          return new TeamSeatLimitError(msg, requestId);
        }
        return new ConflictError(msg, requestId);
      }
      case 429: return new RateLimitError();
      default: return new APIError(status, body.error, body.message ?? body.error, requestId);
    }
  }
}
