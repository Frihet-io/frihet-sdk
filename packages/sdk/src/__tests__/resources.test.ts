import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpClient } from '../client.js';
import { Invoices } from '../resources/invoices.js';
import { Quotes } from '../resources/quotes.js';
import { Clients } from '../resources/clients.js';
import { Webhooks } from '../resources/webhooks.js';
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
