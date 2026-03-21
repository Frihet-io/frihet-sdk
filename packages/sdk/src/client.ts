import { APIError, AuthenticationError, NotFoundError, RateLimitError, TimeoutError, ValidationError } from './error.js';
import type { FrihetOptions, Page, RequestOptions } from './types.js';

declare const __SDK_VERSION__: string;

const DEFAULT_BASE_URL = 'https://api.frihet.io/v1';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;
const SDK_VERSION = typeof __SDK_VERSION__ !== 'undefined' ? __SDK_VERSION__ : '0.0.0-dev';
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

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
    retryCount = 0,
  ): Promise<Response> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }

    const headers = { ...this.defaultHeaders };
    if (opts?.idempotencyKey) {
      headers['Idempotency-Key'] = opts.idempotencyKey;
    }

    const controller = new AbortController();
    const timeoutMs = opts?.timeout ?? this.timeout;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // If user provides their own signal, forward its abort to our controller
    if (opts?.signal) {
      if (opts.signal.aborted) {
        clearTimeout(timeoutId);
        controller.abort();
      } else {
        opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new TimeoutError(timeoutMs);
      }
      // Network error (DNS, TLS, connection refused) — only retry idempotent GETs
      if (retryCount < MAX_RETRIES && method === 'GET') {
        const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount);
        await new Promise(r => setTimeout(r, delayMs));
        return this.requestRaw(method, path, body, query, opts, retryCount + 1);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    // Retryable status codes (429 rate limit + 5xx server errors)
    if (RETRYABLE_STATUS_CODES.has(response.status) && retryCount < MAX_RETRIES) {
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delayMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : BASE_RETRY_DELAY_MS * Math.pow(2, retryCount);
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        // 5xx — exponential backoff
        const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount);
        await new Promise(r => setTimeout(r, delayMs));
      }
      return this.requestRaw(method, path, body, query, opts, retryCount + 1);
    }

    // Final rate limit error (after retries exhausted)
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      throw new RateLimitError(retryAfter ? parseInt(retryAfter, 10) : undefined);
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
      case 429: return new RateLimitError();
      default: return new APIError(status, body.error, body.message ?? body.error, requestId);
    }
  }
}
