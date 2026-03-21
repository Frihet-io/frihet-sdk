import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpClient } from '../client.js';
import { Invoices } from '../resources/invoices.js';
import { AuthenticationError, NotFoundError, RateLimitError, APIError } from '../error.js';

// --- Mock fetch ---

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : `Error ${status}`,
    headers: new Headers(headers),
    json: () => Promise.resolve(data),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  };
}

function errorResponse(status: number, error: string, message?: string, headers: Record<string, string> = {}) {
  return {
    ok: false,
    status,
    statusText: `Error ${status}`,
    headers: new Headers(headers),
    json: () => Promise.resolve({ error, message: message ?? error }),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  };
}

describe('Invoices resource (CRUD via mocked fetch)', () => {
  let client: HttpClient;
  let invoices: Invoices;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch.mockReset();
    client = new HttpClient({ apiKey: 'fri_test_123', baseUrl: 'https://test.api.frihet.io/v1' });
    invoices = new Invoices(client);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- list() ---

  it('list() sends GET /invoices and returns paginated data', async () => {
    const payload = { data: [{ id: 'inv_1', clientName: 'Acme' }], total: 1, limit: 20, offset: 0 };
    mockFetch.mockResolvedValueOnce(jsonResponse(payload));

    const page = await invoices.list({ limit: 20 });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/invoices');
    expect(url).toContain('limit=20');
    expect(opts.method).toBe('GET');
    expect(page.data).toHaveLength(1);
    expect(page.total).toBe(1);
    expect(page.data[0]!.id).toBe('inv_1');
  });

  // --- create() ---

  it('create() sends POST /invoices with body', async () => {
    const created = { id: 'inv_new', clientName: 'Beta', items: [], total: 100 };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: created }));

    const result = await invoices.create({
      clientName: 'Beta',
      items: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
    });

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/invoices');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.clientName).toBe('Beta');
    expect(body.items).toHaveLength(1);
    expect(result.id).toBe('inv_new');
  });

  // --- retrieve() ---

  it('retrieve() sends GET /invoices/:id', async () => {
    const inv = { id: 'inv_42', clientName: 'Gamma', items: [], total: 200 };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: inv }));

    const result = await invoices.retrieve('inv_42');

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/invoices/inv_42');
    expect(opts.method).toBe('GET');
    expect(result.clientName).toBe('Gamma');
  });

  // --- update() ---

  it('update() sends PATCH /invoices/:id with body', async () => {
    const updated = { id: 'inv_42', clientName: 'Gamma Updated', items: [], total: 250 };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: updated }));

    const result = await invoices.update('inv_42', { clientName: 'Gamma Updated' });

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/invoices/inv_42');
    expect(opts.method).toBe('PATCH');
    const body = JSON.parse(opts.body);
    expect(body.clientName).toBe('Gamma Updated');
    expect(result.clientName).toBe('Gamma Updated');
  });

  // --- del() ---

  it('del() sends DELETE /invoices/:id', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(undefined, 204));

    await invoices.del('inv_42');

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/invoices/inv_42');
    expect(opts.method).toBe('DELETE');
  });

  // --- search() ---

  it('search() sends GET /invoices with q parameter', async () => {
    const payload = { data: [{ id: 'inv_1', clientName: 'Acme' }], total: 1, limit: 20, offset: 0 };
    mockFetch.mockResolvedValueOnce(jsonResponse(payload));

    const page = await invoices.search('Acme');

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain('q=Acme');
    expect(page.data).toHaveLength(1);
  });

  // --- Error handling ---

  describe('error handling', () => {
    it('throws AuthenticationError on 401', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(401, 'authentication_error', 'Invalid API key'));

      await expect(invoices.retrieve('inv_1')).rejects.toThrow(AuthenticationError);
    });

    it('throws NotFoundError on 404', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(404, 'not_found', 'Invoice not found'));

      await expect(invoices.retrieve('inv_missing')).rejects.toThrow(NotFoundError);
    });

    it('throws RateLimitError on 429 after retries exhaust', async () => {
      // 429 is retried up to MAX_RETRIES (3) times, so we need 4 responses
      mockFetch.mockResolvedValue(errorResponse(429, 'rate_limit_exceeded', 'Too many requests', { 'Retry-After': '1' }));

      await expect(invoices.retrieve('inv_1')).rejects.toThrow(RateLimitError);
      // 1 initial + 3 retries = 4 calls
      expect(mockFetch).toHaveBeenCalledTimes(4);
    }, 15_000);

    it('throws APIError on 500 after retries exhaust', async () => {
      mockFetch.mockResolvedValue(errorResponse(500, 'server_error', 'Internal error'));

      await expect(invoices.retrieve('inv_1')).rejects.toThrow(APIError);
      // 1 initial + 3 retries = 4 calls
      expect(mockFetch).toHaveBeenCalledTimes(4);
    }, 15_000);
  });

  // --- Retry logic ---

  describe('retry logic', () => {
    it('retries on 5xx and succeeds on second attempt', async () => {
      const inv = { id: 'inv_ok', clientName: 'Success', items: [], total: 100 };
      mockFetch
        .mockResolvedValueOnce(errorResponse(502, 'bad_gateway', 'Bad Gateway'))
        .mockResolvedValueOnce(jsonResponse({ data: inv }));

      const result = await invoices.retrieve('inv_ok');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.id).toBe('inv_ok');
    });

    it('retries on network error and succeeds', async () => {
      const inv = { id: 'inv_ok', clientName: 'Recovered', items: [], total: 50 };
      mockFetch
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(jsonResponse({ data: inv }));

      const result = await invoices.retrieve('inv_ok');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.id).toBe('inv_ok');
    });

    it('does not retry on 400 (non-retryable)', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(400, 'validation_error', 'Bad request'));

      await expect(invoices.create({ clientName: '', items: [] })).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // --- Headers ---

  describe('request headers', () => {
    it('sends X-API-Key header', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'inv_1' } }));
      await invoices.retrieve('inv_1');

      const [, opts] = mockFetch.mock.calls[0]!;
      expect(opts.headers['X-API-Key']).toBe('fri_test_123');
    });

    it('sends Content-Type and Accept as JSON', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'inv_1' } }));
      await invoices.retrieve('inv_1');

      const [, opts] = mockFetch.mock.calls[0]!;
      expect(opts.headers['Content-Type']).toBe('application/json');
      expect(opts.headers['Accept']).toBe('application/json');
    });

    it('sends User-Agent with SDK version', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'inv_1' } }));
      await invoices.retrieve('inv_1');

      const [, opts] = mockFetch.mock.calls[0]!;
      expect(opts.headers['User-Agent']).toMatch(/@frihet\/sdk\/\d+\.\d+\.\d+ \(node\)/);
    });

    it('sends Idempotency-Key when provided', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'inv_new' } }));
      await invoices.create(
        { clientName: 'Test', items: [{ description: 'x', quantity: 1, unitPrice: 10 }] },
        { idempotencyKey: 'idem_abc' },
      );

      const [, opts] = mockFetch.mock.calls[0]!;
      expect(opts.headers['Idempotency-Key']).toBe('idem_abc');
    });
  });
});
