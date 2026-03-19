import { APIError, AuthenticationError, NotFoundError, RateLimitError, TimeoutError, ValidationError } from './error.js';
import type { FrihetOptions, Page, RequestOptions } from './types.js';

const DEFAULT_BASE_URL = 'https://api.frihet.io/v1';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;

interface ApiErrorBody {
  error: string;
  message?: string;
  details?: unknown[];
}

export class HttpClient {
  readonly apiKey: string;
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

  async get<T>(path: string, query?: Record<string, string | number | undefined>, opts?: RequestOptions): Promise<T> {
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

  async getPage<T>(path: string, query?: Record<string, string | number | undefined>, opts?: RequestOptions): Promise<Page<T>> {
    const result = await this.get<Page<T>>(path, query, opts);
    if (!result || !Array.isArray((result as Page<T>).data)) {
      throw new APIError(200, 'invalid_response', 'Expected paginated response with data array');
    }
    return result;
  }

  async getRaw(path: string, opts?: RequestOptions): Promise<ArrayBuffer> {
    const url = new URL(`${this.baseUrl}${path}`);
    const controller = new AbortController();
    const timeoutMs = opts?.timeout ?? this.timeout;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'X-API-Key': this.apiKey },
        signal: opts?.signal ?? controller.signal,
      });

      if (!response.ok) {
        throw this.buildError(response.status, { error: `http_${response.status}`, message: response.statusText });
      }

      return response.arrayBuffer();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new TimeoutError(timeoutMs);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | undefined>,
    opts?: RequestOptions,
    retryCount = 0,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (opts?.idempotencyKey) {
      headers['Idempotency-Key'] = opts.idempotencyKey;
    }

    const controller = new AbortController();
    const timeoutMs = opts?.timeout ?? this.timeout;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: opts?.signal ?? controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new TimeoutError(timeoutMs);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    // Rate limit retry
    if (response.status === 429) {
      if (retryCount >= MAX_RETRIES) {
        const retryAfter = response.headers.get('Retry-After');
        throw new RateLimitError(retryAfter ? parseInt(retryAfter, 10) : undefined);
      }
      const retryAfter = response.headers.get('Retry-After');
      const delayMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : BASE_RETRY_DELAY_MS * Math.pow(2, retryCount);
      await new Promise(r => setTimeout(r, delayMs));
      return this.request(method, path, body, query, opts, retryCount + 1);
    }

    // Error responses
    if (!response.ok) {
      let errorBody: ApiErrorBody;
      try {
        errorBody = await response.json() as ApiErrorBody;
      } catch {
        errorBody = { error: `http_${response.status}`, message: response.statusText };
      }
      throw this.buildError(response.status, errorBody);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const data = await response.json();
    // Unwrap { data: ... } envelope for single-resource responses
    if (data && typeof data === 'object' && 'data' in data && !('total' in data)) {
      return data.data as T;
    }
    return data as T;
  }

  private buildError(status: number, body: ApiErrorBody): APIError {
    switch (status) {
      case 401: return new AuthenticationError(body.message);
      case 404: return new NotFoundError(body.message);
      case 400:
      case 422: return new ValidationError(body.message ?? body.error, body.details);
      case 429: return new RateLimitError();
      default: return new APIError(status, body.error, body.message ?? body.error);
    }
  }
}
