import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpClient } from '../client.js';
import { Invoices } from '../resources/invoices.js';
import { Quotes } from '../resources/quotes.js';
import { Clients } from '../resources/clients.js';
import { Webhooks } from '../resources/webhooks.js';
import { Deposits } from '../resources/deposits.js';
import { Team } from '../resources/team.js';
import { Gestoria } from '../resources/gestoria.js';
import { Channels } from '../resources/channels.js';
import { AuthenticationError, NotFoundError, RateLimitError, TimeoutError, APIError, TeamSeatLimitError, ConflictError } from '../error.js';

// --- Mock fetch ---

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

    it('cancels all four real 429 response bodies when retries exhaust', async () => {
      vi.useFakeTimers();
      const cancelSpies = Array.from({ length: 4 }, () => vi.fn());
      const responses = cancelSpies.map(cancel => new Response(
        new ReadableStream({ cancel }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '1',
          },
        },
      ));
      for (const response of responses) {
        mockFetch.mockResolvedValueOnce(response);
      }

      const result = invoices.retrieve('inv_1').catch(error => error);
      await vi.advanceTimersByTimeAsync(3000);

      await expect(result).resolves.toBeInstanceOf(RateLimitError);
      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect(responses.map(response => response.bodyUsed)).toEqual([true, true, true, true]);
      for (const cancel of cancelSpies) {
        expect(cancel).toHaveBeenCalledOnce();
      }
    });

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

    it('retries POST network uncertainty with one stable generated key', async () => {
      const created = { id: 'inv_network_retry', clientName: 'Recovered', items: [], total: 100 };
      mockFetch
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(jsonResponse({ data: created }));

      const result = await invoices.create({
        clientName: 'Recovered',
        items: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
      });

      expect(result.id).toBe('inv_network_retry');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const keys = mockFetch.mock.calls.map(([, opts]) => opts.headers['Idempotency-Key']);
      expect(keys[0]).toMatch(UUID_V4_RE);
      expect(keys[1]).toBe(keys[0]);
    });

    it('retries POST 5xx with one stable generated key', async () => {
      const created = { id: 'inv_server_retry', clientName: 'Recovered', items: [], total: 100 };
      mockFetch
        .mockResolvedValueOnce(errorResponse(503, 'unavailable', 'Try again'))
        .mockResolvedValueOnce(jsonResponse({ data: created }));

      await invoices.create({
        clientName: 'Recovered',
        items: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const keys = mockFetch.mock.calls.map(([, opts]) => opts.headers['Idempotency-Key']);
      expect(keys[0]).toMatch(UUID_V4_RE);
      expect(keys[1]).toBe(keys[0]);
    });

    it('preserves a caller key byte-for-byte across POST retries', async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(502, 'bad_gateway', 'Try again'))
        .mockResolvedValueOnce(jsonResponse({ data: { id: 'inv_explicit' } }));

      await invoices.create(
        { clientName: 'Explicit', items: [{ description: 'x', quantity: 1, unitPrice: 10 }] },
        { idempotencyKey: 'caller-owned-key' },
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0]![1].headers['Idempotency-Key']).toBe('caller-owned-key');
      expect(mockFetch.mock.calls[1]![1].headers['Idempotency-Key']).toBe('caller-owned-key');
    });

    it.each([
      ['PATCH', () => invoices.update('inv_1', { clientName: 'No retry' }, { idempotencyKey: 'caller-key' })],
      ['DELETE', () => invoices.del('inv_1', { idempotencyKey: 'caller-key' })],
    ])('does not retry %s after a 5xx because the API has no idempotency contract for it', async (_method, call) => {
      mockFetch.mockResolvedValue(errorResponse(503, 'unavailable', 'Try again'));

      await expect(call()).rejects.toThrow(APIError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['PATCH', () => invoices.update('inv_1', { clientName: 'No retry' }, { idempotencyKey: 'caller-key' })],
      ['DELETE', () => invoices.del('inv_1', { idempotencyKey: 'caller-key' })],
    ])('does not retry %s after a network error, even when a key was supplied', async (_method, call) => {
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      await expect(call()).rejects.toThrow('fetch failed');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry an idempotency 409', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(409, 'IDEMPOTENCY_REQUEST_IN_PROGRESS', 'Reconcile first'));

      await expect(invoices.create({
        clientName: 'Conflict',
        items: [{ description: 'x', quantity: 1, unitPrice: 10 }],
      })).rejects.toThrow(ConflictError);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('keeps 429 retry for POST and reuses the key because Frihet rate-limits before handlers', async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(429, 'rate_limit_exceeded', 'Try again', { 'Retry-After': 'invalid' }))
        .mockResolvedValueOnce(jsonResponse({ data: { id: 'inv_after_429' } }));

      const startedAt = Date.now();
      await invoices.create({
        clientName: 'Rate limited',
        items: [{ description: 'x', quantity: 1, unitPrice: 10 }],
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1000);
      const firstKey = mockFetch.mock.calls[0]![1].headers['Idempotency-Key'];
      expect(firstKey).toMatch(UUID_V4_RE);
      expect(mockFetch.mock.calls[1]![1].headers['Idempotency-Key']).toBe(firstKey);
    });

    it('cancels a pending network retry when the caller aborts during backoff', async () => {
      vi.useFakeTimers();
      const controller = new AbortController();
      mockFetch
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(jsonResponse({ data: { id: 'must_not_run' } }));

      const request = invoices.create(
        { clientName: 'Cancelled', items: [{ description: 'x', quantity: 1, unitPrice: 10 }] },
        { signal: controller.signal },
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      controller.abort();

      await expect(request).rejects.toThrow(TimeoutError);
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it.each(['', ' ', 'junk', '1s', '1.5', '-1', '1e3', '0x10'])(
      'uses exponential fallback for malformed Retry-After %j instead of an immediate retry',
      async (retryAfter) => {
        vi.useFakeTimers();
        mockFetch
          .mockResolvedValueOnce(errorResponse(429, 'rate_limit_exceeded', 'Try again', { 'Retry-After': retryAfter }))
          .mockResolvedValueOnce(jsonResponse({ data: { id: 'inv_after_delay' } }));

        const request = invoices.create({
          clientName: 'Delayed',
          items: [{ description: 'x', quantity: 1, unitPrice: 10 }],
        });
        await vi.advanceTimersByTimeAsync(0);
        expect(mockFetch).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(999);
        expect(mockFetch).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        await request;
        expect(mockFetch).toHaveBeenCalledTimes(2);
      },
    );

    it('does not schedule an unsafe timer for excessive Retry-After', async () => {
      vi.useFakeTimers();
      mockFetch.mockResolvedValueOnce(
        errorResponse(429, 'rate_limit_exceeded', 'Try later', { 'Retry-After': '2147484' }),
      );

      const request = invoices.create({
        clientName: 'No overflow',
        items: [{ description: 'x', quantity: 1, unitPrice: 10 }],
      });

      await expect(request).rejects.toMatchObject({ name: 'RateLimitError', retryAfter: 2147484 });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('reports malformed Retry-After as undefined after retries exhaust', async () => {
      vi.useFakeTimers();
      mockFetch.mockResolvedValue(
        errorResponse(429, 'rate_limit_exceeded', 'Try later', { 'Retry-After': 'junk' }),
      );

      const result = invoices.create({
        clientName: 'Exhausted',
        items: [{ description: 'x', quantity: 1, unitPrice: 10 }],
      }).catch(error => error);
      await vi.advanceTimersByTimeAsync(7000);

      await expect(result).resolves.toMatchObject({ name: 'RateLimitError', retryAfter: undefined });
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('keeps pre-handler 429 retry for PATCH without enabling PATCH 5xx retry', async () => {
      vi.useFakeTimers();
      mockFetch
        .mockResolvedValueOnce(errorResponse(429, 'rate_limit_exceeded', 'Try again', { 'Retry-After': '0' }))
        .mockResolvedValueOnce(jsonResponse({ data: { id: 'inv_1', clientName: 'Updated' } }));

      const request = invoices.update('inv_1', { clientName: 'Updated' });
      await vi.advanceTimersByTimeAsync(0);
      await request;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('fails a request with an already-aborted caller signal without fetching or retrying', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(invoices.create(
        { clientName: 'Cancelled', items: [{ description: 'x', quantity: 1, unitPrice: 10 }] },
        { signal: controller.signal },
      )).rejects.toThrow(TimeoutError);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not retry when the caller aborts an in-flight POST', async () => {
      const controller = new AbortController();
      mockFetch.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      }));

      const request = invoices.create(
        { clientName: 'Cancelled', items: [{ description: 'x', quantity: 1, unitPrice: 10 }] },
        { signal: controller.signal },
      );
      await Promise.resolve();
      controller.abort();

      await expect(request).rejects.toThrow(TimeoutError);
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
      expect(opts.headers['User-Agent']).toMatch(/@frihet\/sdk\/[\d.]+[\w-]* \(node\)/);
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

    it('automatically sends a cryptographically generated key on POST', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'cn_1', status: 'draft' } }, 201));

      await invoices.creditNote('inv_1', { reason: 'error', fullCredit: true });

      const [, opts] = mockFetch.mock.calls[0]!;
      expect(opts.headers['Idempotency-Key']).toMatch(UUID_V4_RE);
      expect(opts.headers['Idempotency-Key']).toHaveLength(36);
    });

    it('generates distinct keys for distinct POST calls', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ data: { id: 'inv_new' } }, 201));

      await invoices.create({ clientName: 'One', items: [{ description: 'x', quantity: 1, unitPrice: 10 }] });
      await invoices.create({ clientName: 'Two', items: [{ description: 'y', quantity: 1, unitPrice: 20 }] });

      const firstKey = mockFetch.mock.calls[0]![1].headers['Idempotency-Key'];
      const secondKey = mockFetch.mock.calls[1]![1].headers['Idempotency-Key'];
      expect(firstKey).toMatch(UUID_V4_RE);
      expect(secondKey).toMatch(UUID_V4_RE);
      expect(secondKey).not.toBe(firstKey);
    });

    it.each(['', '   '])('treats an empty explicit key %j as absent and generates a safe key', async (idempotencyKey) => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'inv_new' } }, 201));

      await invoices.create(
        { clientName: 'Test', items: [{ description: 'x', quantity: 1, unitPrice: 10 }] },
        { idempotencyKey },
      );

      const [, opts] = mockFetch.mock.calls[0]!;
      expect(opts.headers['Idempotency-Key']).toMatch(UUID_V4_RE);
    });

    it('never sends Idempotency-Key on GET', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'inv_1' } }));

      await invoices.retrieve('inv_1');

      const [, opts] = mockFetch.mock.calls[0]!;
      expect(opts.headers['Idempotency-Key']).toBeUndefined();
    });

    it('uses Web Crypto getRandomValues when randomUUID is unavailable', async () => {
      const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: {
          getRandomValues: (bytes: Uint8Array) => {
            bytes.set(Array.from({ length: 16 }, (_, index) => index + 1));
            return bytes;
          },
        },
      });

      try {
        mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'inv_browser' } }, 201));
        await invoices.create({
          clientName: 'Browser',
          items: [{ description: 'x', quantity: 1, unitPrice: 10 }],
        });

        expect(mockFetch.mock.calls[0]![1].headers['Idempotency-Key']).toMatch(UUID_V4_RE);
      } finally {
        if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
        else Reflect.deleteProperty(globalThis, 'crypto');
      }
    });

    it('falls back to node:crypto when global Web Crypto is unavailable (Node 18 path)', async () => {
      const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });

      try {
        mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'inv_node18' } }, 201));
        await invoices.create({
          clientName: 'Node 18',
          items: [{ description: 'x', quantity: 1, unitPrice: 10 }],
        });

        expect(mockFetch.mock.calls[0]![1].headers['Idempotency-Key']).toMatch(UUID_V4_RE);
      } finally {
        if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
        else Reflect.deleteProperty(globalThis, 'crypto');
      }
    });

    it('removes the caller abort listener after the request settles', async () => {
      const controller = new AbortController();
      const addListener = vi.spyOn(controller.signal, 'addEventListener');
      const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'inv_1' } }));

      await invoices.retrieve('inv_1', { signal: controller.signal });

      const forwardedListener = addListener.mock.calls.find(([type]) => type === 'abort')?.[1];
      expect(forwardedListener).toBeDefined();
      expect(removeListener).toHaveBeenCalledWith('abort', forwardedListener);
    });
  });
});

// =============================================================================
// CRM Subcollection methods (Clients resource)
// =============================================================================

describe('Clients CRM subcollections (mocked fetch)', () => {
  let client: HttpClient;
  let clients: Clients;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch.mockReset();
    client = new HttpClient({ apiKey: 'fri_test_123', baseUrl: 'https://test.api.frihet.io/v1' });
    clients = new Clients(client);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- Contacts ---

  it('listContacts sends GET /clients/:id/contacts', async () => {
    const payload = { data: [{ id: 'ct_1', name: 'Jane' }], total: 1, limit: 20, offset: 0 };
    mockFetch.mockResolvedValueOnce(jsonResponse(payload));

    const page = await clients.listContacts('cli_42');

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/clients/cli_42/contacts');
    expect(opts.method).toBe('GET');
    expect(page.data).toHaveLength(1);
    expect(page.data[0]!.id).toBe('ct_1');
  });

  it('createContact sends POST /clients/:id/contacts with body', async () => {
    const contact = { id: 'ct_new', name: 'John', email: 'john@example.com', role: 'CEO' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: contact }));

    const result = await clients.createContact('cli_42', { name: 'John', email: 'john@example.com', role: 'CEO' });

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/clients/cli_42/contacts');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.name).toBe('John');
    expect(body.email).toBe('john@example.com');
    expect(result.id).toBe('ct_new');
  });

  it('retrieveContact sends GET /clients/:id/contacts/:contactId', async () => {
    const contact = { id: 'ct_1', name: 'Jane', role: 'CFO' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: contact }));

    const result = await clients.retrieveContact('cli_42', 'ct_1');

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/clients/cli_42/contacts/ct_1');
    expect(opts.method).toBe('GET');
    expect(result.name).toBe('Jane');
  });

  it('updateContact sends PATCH /clients/:id/contacts/:contactId', async () => {
    const updated = { id: 'ct_1', name: 'Jane Updated', role: 'CTO' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: updated }));

    const result = await clients.updateContact('cli_42', 'ct_1', { name: 'Jane Updated', role: 'CTO' });

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/clients/cli_42/contacts/ct_1');
    expect(opts.method).toBe('PATCH');
    const body = JSON.parse(opts.body);
    expect(body.name).toBe('Jane Updated');
    expect(result.name).toBe('Jane Updated');
  });

  it('deleteContact sends DELETE /clients/:id/contacts/:contactId', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(undefined, 204));

    await clients.deleteContact('cli_42', 'ct_1');

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/clients/cli_42/contacts/ct_1');
    expect(opts.method).toBe('DELETE');
  });

  // --- Activities ---

  it('listActivities sends GET /clients/:id/activities', async () => {
    const payload = { data: [{ id: 'act_1', type: 'call', title: 'Follow-up call' }], total: 1, limit: 20, offset: 0 };
    mockFetch.mockResolvedValueOnce(jsonResponse(payload));

    const page = await clients.listActivities('cli_42');

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/clients/cli_42/activities');
    expect(opts.method).toBe('GET');
    expect(page.data).toHaveLength(1);
    expect(page.data[0]!.id).toBe('act_1');
  });

  it('createActivity sends POST /clients/:id/activities with body', async () => {
    const activity = { id: 'act_new', type: 'meeting', title: 'Kickoff', description: 'Project kickoff meeting' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: activity }));

    const result = await clients.createActivity('cli_42', { type: 'meeting', title: 'Kickoff', description: 'Project kickoff meeting' });

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/clients/cli_42/activities');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.type).toBe('meeting');
    expect(body.title).toBe('Kickoff');
    expect(result.id).toBe('act_new');
  });

  // --- Notes ---

  it('listNotes sends GET /clients/:id/notes', async () => {
    const payload = { data: [{ id: 'note_1', content: 'Important note' }], total: 1, limit: 20, offset: 0 };
    mockFetch.mockResolvedValueOnce(jsonResponse(payload));

    const page = await clients.listNotes('cli_42');

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/clients/cli_42/notes');
    expect(opts.method).toBe('GET');
    expect(page.data).toHaveLength(1);
    expect(page.data[0]!.id).toBe('note_1');
  });

  it('createNote sends POST /clients/:id/notes with body', async () => {
    const note = { id: 'note_new', content: 'Follow up next week' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: note }));

    const result = await clients.createNote('cli_42', { content: 'Follow up next week' });

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/clients/cli_42/notes');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.content).toBe('Follow up next week');
    expect(result.id).toBe('note_new');
  });

  it('updateNote sends PATCH /clients/:id/notes/:noteId', async () => {
    const updated = { id: 'note_1', content: 'Updated note content' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: updated }));

    const result = await clients.updateNote('cli_42', 'note_1', { content: 'Updated note content' });

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/clients/cli_42/notes/note_1');
    expect(opts.method).toBe('PATCH');
    const body = JSON.parse(opts.body);
    expect(body.content).toBe('Updated note content');
    expect(result.content).toBe('Updated note content');
  });

  it('deleteNote sends DELETE /clients/:id/notes/:noteId', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(undefined, 204));

    await clients.deleteNote('cli_42', 'note_1');

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/clients/cli_42/notes/note_1');
    expect(opts.method).toBe('DELETE');
  });
});

// =============================================================================
// Invoice action methods (pdf, send, markPaid)
// =============================================================================

describe('Invoices action methods (mocked fetch)', () => {
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

  it('pdf() sends GET /invoices/:id/pdf and returns ArrayBuffer', async () => {
    const buffer = new ArrayBuffer(8);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/pdf' }),
      json: () => Promise.resolve({}),
      arrayBuffer: () => Promise.resolve(buffer),
    });

    const result = await invoices.pdf('inv_42');

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/invoices/inv_42/pdf');
    expect(opts.method).toBe('GET');
    expect(result).toBeInstanceOf(ArrayBuffer);
  });

  it('send() sends POST /invoices/:id/send with params', async () => {
    const sendResult = { success: true, messageId: 'msg_123' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: sendResult }));

    const result = await invoices.send('inv_42', {
      recipientEmail: 'client@example.com',
      recipientName: 'Acme Corp',
      locale: 'en',
    });

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/invoices/inv_42/send');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.recipientEmail).toBe('client@example.com');
    expect(body.locale).toBe('en');
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg_123');
  });

  it('markPaid() sends POST /invoices/:id/paid', async () => {
    const paidResult = { success: true, status: 'paid', paidAt: '2026-03-21' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: paidResult }));

    const result = await invoices.markPaid('inv_42');

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/invoices/inv_42/paid');
    expect(opts.method).toBe('POST');
    expect(result.status).toBe('paid');
  });

  it('markPaid() sends paidDate when provided', async () => {
    const paidResult = { success: true, status: 'paid', paidAt: '2026-03-15' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: paidResult }));

    const result = await invoices.markPaid('inv_42', '2026-03-15');

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/invoices/inv_42/paid');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.paidDate).toBe('2026-03-15');
    expect(result.paidAt).toBe('2026-03-15');
  });
});

// =============================================================================
// Quote action methods (pdf, send)
// =============================================================================

describe('Quotes action methods (mocked fetch)', () => {
  let client: HttpClient;
  let quotes: Quotes;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch.mockReset();
    client = new HttpClient({ apiKey: 'fri_test_123', baseUrl: 'https://test.api.frihet.io/v1' });
    quotes = new Quotes(client);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pdf() sends GET /quotes/:id/pdf and returns ArrayBuffer', async () => {
    const buffer = new ArrayBuffer(8);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/pdf' }),
      json: () => Promise.resolve({}),
      arrayBuffer: () => Promise.resolve(buffer),
    });

    const result = await quotes.pdf('qt_42');

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/quotes/qt_42/pdf');
    expect(opts.method).toBe('GET');
    expect(result).toBeInstanceOf(ArrayBuffer);
  });

  it('send() sends POST /quotes/:id/send with params', async () => {
    const sendResult = { success: true, messageId: 'msg_456' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: sendResult }));

    const result = await quotes.send('qt_42', {
      recipientEmail: 'client@example.com',
      recipientName: 'Beta Inc',
      locale: 'es',
    });

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/quotes/qt_42/send');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.recipientEmail).toBe('client@example.com');
    expect(body.locale).toBe('es');
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg_456');
  });
});

describe('Webhooks.verifySignature', () => {
  it('returns true for valid signature', async () => {
    const payload = '{"event":"invoice.created"}';
    const secret = 'whsec_test123';
    const crypto = await import('node:crypto');
    const expected = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
    const result = await Webhooks.verifySignature(payload, expected, secret);
    expect(result).toBe(true);
  });

  it('returns false for invalid signature', async () => {
    const result = await Webhooks.verifySignature('payload', 'sha256=invalid', 'secret');
    expect(result).toBe(false);
  });

  it('returns false for signature with wrong length', async () => {
    const result = await Webhooks.verifySignature('payload', 'short', 'secret');
    expect(result).toBe(false);
  });
});

// =============================================================================
// Platform-depth wave: Deposits / Team / Gestoria / Channels
// =============================================================================

describe('Deposits resource (mocked fetch)', () => {
  let client: HttpClient;
  let deposits: Deposits;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch.mockReset();
    client = new HttpClient({ apiKey: 'fri_test_123', baseUrl: 'https://test.api.frihet.io/v1' });
    deposits = new Deposits(client);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('list() sends GET /deposits and returns paginated data', async () => {
    const payload = { data: [{ id: 'dep_1', clientName: 'Acme', amount: 500 }], total: 1, limit: 20, offset: 0 };
    mockFetch.mockResolvedValueOnce(jsonResponse(payload));

    const page = await deposits.list({ status: 'active' });

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/deposits');
    expect(url).toContain('status=active');
    expect(opts.method).toBe('GET');
    expect(page.data[0]!.id).toBe('dep_1');
  });

  it('create() sends POST /deposits with body', async () => {
    const created = { id: 'dep_new', clientId: 'cli_1', clientName: 'Beta', amount: 300, status: 'active' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: created }));

    const result = await deposits.create({
      clientId: 'cli_1',
      clientName: 'Beta',
      amount: 300,
      description: 'Down payment',
      receivedDate: '2026-06-01',
    });

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/deposits');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.amount).toBe(300);
    expect(result.id).toBe('dep_new');
  });

  it('apply() sends POST /deposits/:id/apply with the three mandatory fields', async () => {
    const applyResult = { success: true, depositId: 'dep_1', appliedAmount: 100, remainingBalance: 400, status: 'partially_applied' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: applyResult }));

    const result = await deposits.apply('dep_1', { invoiceId: 'inv_9', invoiceNumber: 'F-2026-009', amount: 100 });

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/deposits/dep_1/apply');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.invoiceId).toBe('inv_9');
    expect(body.invoiceNumber).toBe('F-2026-009');
    expect(body.amount).toBe(100);
    expect(result.appliedAmount).toBe(100);
    expect(result.status).toBe('partially_applied');
  });

  it('refund() sends POST /deposits/:id/refund and supports an omitted amount', async () => {
    const refundResult = { success: true, depositId: 'dep_1', refundedAmount: 400, remainingBalance: 0 };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: refundResult }));

    const result = await deposits.refund('dep_1');

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/deposits/dep_1/refund');
    expect(opts.method).toBe('POST');
    expect(result.refundedAmount).toBe(400);
  });
});

describe('Team resource (mocked fetch)', () => {
  let client: HttpClient;
  let team: Team;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch.mockReset();
    client = new HttpClient({ apiKey: 'fri_test_123', baseUrl: 'https://test.api.frihet.io/v1' });
    team = new Team(client);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('listMembers() sends GET /team/members and returns paginated members', async () => {
    const payload = { data: [{ id: 'tm_1', email: 'a@b.com', role: 'admin', status: 'active' }], total: 1, limit: 50, offset: 0 };
    mockFetch.mockResolvedValueOnce(jsonResponse(payload));

    const page = await team.listMembers({ status: 'active' });

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/team/members');
    expect(opts.method).toBe('GET');
    expect(page.data[0]!.role).toBe('admin');
  });

  it('invite() sends POST /team/members/invite with body', async () => {
    const inviteResult = { id: 'inv_1', email: 'new@b.com', role: 'editor', name: null, status: 'pending', expiresAt: '2026-06-27' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: inviteResult }));

    const result = await team.invite({ email: 'new@b.com', role: 'editor' });

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/team/members/invite');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.email).toBe('new@b.com');
    expect(result.status).toBe('pending');
  });

  it('invite() maps a "Team limit reached" 409 to TeamSeatLimitError', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(409, 'Team limit reached for your plan'));

    await expect(team.invite({ email: 'x@b.com', role: 'editor' })).rejects.toBeInstanceOf(TeamSeatLimitError);
  });

  it('invite() keeps other 409s as ConflictError', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(409, 'User is already a team member'));

    await expect(team.invite({ email: 'x@b.com', role: 'editor' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('setRole() sends PATCH /team/members/:id/role with the role body', async () => {
    const roleResult = { id: 'tm_1', role: 'viewer', updatedAt: '2026-06-20' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: roleResult }));

    const result = await team.setRole('tm_1', 'viewer');

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/team/members/tm_1/role');
    expect(opts.method).toBe('PATCH');
    const body = JSON.parse(opts.body);
    expect(body.role).toBe('viewer');
    expect(result.role).toBe('viewer');
  });

  it('removeMember() sends DELETE /team/members/:id', async () => {
    mockFetch.mockResolvedValueOnce({ ...jsonResponse({}, 204), json: () => Promise.resolve({}) });

    await team.removeMember('tm_1');

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/team/members/tm_1');
    expect(opts.method).toBe('DELETE');
  });
});

describe('Gestoria resource (mocked fetch)', () => {
  let client: HttpClient;
  let gestoria: Gestoria;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch.mockReset();
    client = new HttpClient({ apiKey: 'fri_test_123', baseUrl: 'https://test.api.frihet.io/v1' });
    gestoria = new Gestoria(client);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aging() sends POST /gestoria/aging and unwraps the consolidated report', async () => {
    const report = {
      workspaces: [],
      rejectedWorkspaceIds: ['ws_x'],
      consolidatedBuckets: { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0 },
      consolidatedTotal: 0,
      consolidatedOverdue: 0,
      asOf: '2026-06-20',
      generatedAt: '2026-06-20T00:00:00.000Z',
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: report }));

    const result = await gestoria.aging({ workspaceIds: ['ws_1', 'ws_x'] });

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/gestoria/aging');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.workspaceIds).toEqual(['ws_1', 'ws_x']);
    expect(result.rejectedWorkspaceIds).toEqual(['ws_x']);
  });
});

describe('Channels resource (mocked fetch)', () => {
  let client: HttpClient;
  let channels: Channels;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch.mockReset();
    client = new HttpClient({ apiKey: 'fri_test_123', baseUrl: 'https://test.api.frihet.io/v1' });
    channels = new Channels(client);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('list() sends GET /channels (top-level, not under /stay)', async () => {
    const payload = { data: [{ id: 'ch_1', name: 'Airbnb', type: 'ical_import', status: 'active' }], total: 1, limit: 20, offset: 0 };
    mockFetch.mockResolvedValueOnce(jsonResponse(payload));

    const page = await channels.list({ propertyId: 'prop_1' });

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/channels');
    expect(url).not.toContain('/stay');
    expect(url).toContain('propertyId=prop_1');
    expect(opts.method).toBe('GET');
    expect(page.data[0]!.type).toBe('ical_import');
  });

  it('legacy mutation methods fail locally without fetch', async () => {
    await expect(channels.create({ propertyId: 'prop_1', name: 'Booking' })).rejects.toMatchObject({
      name: 'CapabilityUnavailableError',
      reason: 'absent',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
