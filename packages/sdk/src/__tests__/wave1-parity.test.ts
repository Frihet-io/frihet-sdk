/**
 * Wave-1 SDK parity tests — Invoices Fiscal & E-Invoicing, VeriFactu status,
 * Global Search, and canonical Banking REST endpoints (/v1/banking/*).
 *
 * Every path, verb, query param, request body, and response shape is pinned
 * against Frihet-ERP functions/src/openapi.json and functions/src/publicApi.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { expectTypeOf } from 'vitest';
import {
  Frihet,
  Fiscal,
  Search,
  Banking,
  ConflictError,
  NotFoundError,
  ValidationError,
  APIError,
} from '../index.js';
import type {
  EInvoiceFormat,
  EInvoiceExportResult,
  FaceSubmitResult,
  FaceStatusResult,
  TicketBaiSubmitResult,
  TicketBaiStatusResult,
  VerifactuStatusResult,
  GlobalSearchResponse,
  BankAccount,
  BankTransaction,
  BankTransactionSuggestionsResult,
  Page,
} from '../index.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : `Status ${status}`,
    headers: new Headers(headers),
    json: () => Promise.resolve(data),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  };
}

function errorResponse(status: number, error: string, message?: string) {
  return {
    ok: false,
    status,
    statusText: `Error ${status}`,
    headers: new Headers(),
    json: () => Promise.resolve({ error, message: message ?? error }),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  };
}

function createSdk(): Frihet {
  return new Frihet({
    apiKey: 'fri_test_wave1',
    baseUrl: 'https://test.api.frihet.io/v1',
  });
}

describe('Frihet Wave-1 resource accessors', () => {
  const sdk = createSdk();

  it('exposes fiscal, search, and banking resource accessors', () => {
    expect(sdk.fiscal).toBeInstanceOf(Fiscal);
    expect(sdk.search).toBeInstanceOf(Search);
    expect(sdk.banking).toBeInstanceOf(Banking);
  });
});

// =============================================================================
// Invoices Fiscal & E-Invoicing
// =============================================================================

describe('Invoices Fiscal & E-Invoicing', () => {
  let sdk: Frihet;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch.mockReset();
    sdk = createSdk();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('xml() sends GET /v1/invoices/:id/xml and returns raw ArrayBuffer', async () => {
    const xmlBytes = new TextEncoder().encode('<?xml version="1.0"?><Facturae/>').buffer;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/xml' }),
      arrayBuffer: () => Promise.resolve(xmlBytes),
      json: () => Promise.reject(new Error('not json')),
    });

    const result = await sdk.invoices.xml('inv/with space');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/invoices/inv%2Fwith%20space/xml');
    expect(opts.method).toBe('GET');
    expect(opts.headers['Idempotency-Key']).toBeUndefined();
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBe(xmlBytes.byteLength);
  });

  it('xml() throws NotFoundError on 404 when artifact is not generated', async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse(404, 'not_found', 'E-invoice XML not generated for this invoice'),
    );

    await expect(sdk.invoices.xml('inv_missing')).rejects.toThrow(NotFoundError);
  });

  it('exportEInvoice() sends POST /v1/invoices/:id/einvoice/export with format and signed flag', async () => {
    const payload: EInvoiceExportResult = {
      xml: '<Facturae/>',
      contentType: 'application/xml',
      filename: 'F2026-001_Facturae.xml',
      signed: true,
      format: 'Facturae',
      warnings: [
        { severity: 'warning', ruleId: 'BR-E-10', message: 'Optional buyer reference missing' },
      ],
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: payload }));

    const result = await sdk.invoices.exportEInvoice('inv_42', {
      format: 'Facturae',
      signed: true,
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/invoices/inv_42/einvoice/export');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Idempotency-Key']).toMatch(UUID_V4_RE);
    expect(JSON.parse(opts.body)).toEqual({ format: 'Facturae', signed: true });
    expect(result).toEqual(payload);
  });

  it('exportEInvoice() supports all 9 canonical OpenAPI formats at the type level', () => {
    expectTypeOf<EInvoiceFormat>().toEqualTypeOf<
      | 'Facturae'
      | 'XRechnung-CII'
      | 'XRechnung-UBL'
      | 'Factur-X'
      | 'FatturaPA'
      | 'PEPPOL-BIS-3'
      | 'FA-2-KSeF'
      | 'UBL'
      | 'CII'
    >();
  });

  it('submitFace() sends POST /v1/invoices/:id/face/submit with optional body', async () => {
    const payload: FaceSubmitResult = {
      status: 'submitted',
      numeroRegistro: 'REG/2026/000042',
      codigo: '0',
      descripcion: 'Registrada',
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: payload }));

    const result = await sdk.invoices.submitFace('inv_42', {
      mode: 'sandbox',
      correo: 'billing@acme.es',
    });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/invoices/inv_42/face/submit');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Idempotency-Key']).toMatch(UUID_V4_RE);
    expect(JSON.parse(opts.body)).toEqual({ mode: 'sandbox', correo: 'billing@acme.es' });
    expect(result).toEqual(payload);
  });

  it('submitFace() works without params and preserves idempotent replay flag', async () => {
    const payload: FaceSubmitResult = {
      status: 'submitted',
      numeroRegistro: 'REG/2026/000042',
      codigo: '0',
      descripcion: 'Registrada',
      idempotent: true,
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: payload }));

    const result = await sdk.invoices.submitFace('inv_42');

    const [, opts] = mockFetch.mock.calls[0]!;
    expect(opts.body).toBeUndefined();
    expect(result.idempotent).toBe(true);
  });

  it('faceStatus() sends GET /v1/invoices/:id/face/status', async () => {
    const payload: FaceStatusResult = {
      numeroRegistro: 'REG/2026/000042',
      estadoTramitacion: '1200',
      codigo: '1200',
      descripcion: 'Registrada',
      motivo: null,
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: payload }));

    const result = await sdk.invoices.faceStatus('inv_42');

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/invoices/inv_42/face/status');
    expect(opts.method).toBe('GET');
    expect(result).toEqual(payload);
  });

  it('submitTicketBai() sends POST /v1/invoices/:id/ticketbai/submit', async () => {
    const payload: TicketBaiSubmitResult = {
      accepted: true,
      csv: 'TBAI-48-120226-000001-2H',
      tbaiIdentifier: 'TBAI-B-000001',
      qrUrl: 'https://batuz.eus/QRTBAI/?id=TBAI-B-000001',
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: payload }));

    const result = await sdk.invoices.submitTicketBai('inv_42', { sandbox: true });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/invoices/inv_42/ticketbai/submit');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Idempotency-Key']).toMatch(UUID_V4_RE);
    expect(JSON.parse(opts.body)).toEqual({ sandbox: true });
    expect(result).toEqual(payload);
  });

  it('submitTicketBai() throws ValidationError on 422 rejection', async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse(422, 'TicketBAI certificate required', 'Upload a TicketBAI BYOC cert'),
    );

    await expect(sdk.invoices.submitTicketBai('inv_42')).rejects.toThrow(ValidationError);
  });

  it('ticketBaiStatus() sends GET /v1/invoices/:id/ticketbai/status', async () => {
    const payload: TicketBaiStatusResult = {
      accepted: true,
      csv: 'TBAI-48-120226-000001-2H',
      tbaiIdentifier: 'TBAI-B-000001',
      estado: 'accepted',
      qrUrl: 'https://batuz.eus/QRTBAI/?id=TBAI-B-000001',
      submittedAt: '2026-11-21T10:00:00.000Z',
      errors: null,
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: payload }));

    const result = await sdk.invoices.ticketBaiStatus('inv_42');

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/invoices/inv_42/ticketbai/status');
    expect(opts.method).toBe('GET');
    expect(result).toEqual(payload);
  });
});

// =============================================================================
// Fiscal (VeriFactu)
// =============================================================================

describe('Fiscal resource', () => {
  let sdk: Frihet;

  beforeEach(() => {
    mockFetch.mockReset();
    sdk = createSdk();
  });

  it('verifactuStatus() sends GET /v1/fiscal/verifactu/:invoiceId/status', async () => {
    const payload: VerifactuStatusResult = {
      invoiceId: 'inv_99',
      status: 'accepted',
      accepted: true,
      csv: 'VF-2026-ABCDEF123456',
      submittedAt: '2026-11-21T11:30:00.000Z',
      retryCount: 0,
      lastError: null,
      sandbox: false,
      aeatWarnings: [{ code: '9001', description: 'Aviso AEAT' }],
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: payload, meta: { requestId: 'req_vf' } }));

    const result = await sdk.fiscal.verifactuStatus('inv_99');

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/fiscal/verifactu/inv_99/status');
    expect(opts.method).toBe('GET');
    expect(result).toEqual(payload);
  });

  it('verifactuStatus() URL-encodes invoiceId and propagates 404', async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse(404, 'not_found', 'No VeriFactu submission found for this invoice'),
    );

    await expect(sdk.fiscal.verifactuStatus('inv/1 2')).rejects.toThrow(NotFoundError);
    const [rawUrl] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/fiscal/verifactu/inv%2F1%202/status');
  });
});

// =============================================================================
// Global Search
// =============================================================================

describe('Search resource', () => {
  let sdk: Frihet;

  beforeEach(() => {
    mockFetch.mockReset();
    sdk = createSdk();
  });

  it('global() sends GET /v1/search/global with q, joined types, limit, offset and preserves envelope', async () => {
    const payload: GlobalSearchResponse = {
      data: [
        {
          type: 'invoices',
          id: 'inv_1',
          label: 'F2026-001',
          secondary: 'Acme SL',
          date: '2026-11-01',
          amount: 1210,
          status: 'sent',
        },
        {
          type: 'clients',
          id: 'cli_1',
          label: 'Acme SL',
          secondary: 'B12345678',
          date: '2026-01-15T10:00:00.000Z',
          amount: null,
          status: 'active',
        },
      ],
      total: 2,
      limit: 10,
      offset: 0,
      hasMore: false,
      query: 'Acme',
      types: ['invoices', 'clients'],
      truncated: false,
      meta: { requestId: 'req_search', timestamp: '2026-11-21T12:00:00.000Z' },
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(payload));

    const result = await sdk.search.global('Acme', {
      types: ['invoices', 'clients'],
      limit: 10,
      offset: 0,
    });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    const url = new URL(rawUrl);
    expect(url.pathname).toBe('/v1/search/global');
    expect(url.searchParams.get('q')).toBe('Acme');
    expect(url.searchParams.get('types')).toBe('invoices,clients');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('offset')).toBe('0');
    expect(opts.method).toBe('GET');
    expect(result).toEqual(payload);
  });

  it('global() accepts a comma-separated types string and omits undefined optional params', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [],
        total: 0,
        limit: 25,
        offset: 0,
        hasMore: false,
        query: 'cloud',
        types: ['expenses', 'vendors'],
        truncated: false,
      }),
    );

    await sdk.search.global('cloud', { types: 'expenses,vendors' });

    const [rawUrl] = mockFetch.mock.calls[0]!;
    const url = new URL(rawUrl);
    expect(url.searchParams.get('q')).toBe('cloud');
    expect(url.searchParams.get('types')).toBe('expenses,vendors');
    expect(url.searchParams.has('limit')).toBe(false);
    expect(url.searchParams.has('offset')).toBe(false);
  });
});

// =============================================================================
// Banking (/v1/banking/*)
// =============================================================================

describe('Banking resource (canonical /v1/banking/*)', () => {
  let sdk: Frihet;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch.mockReset();
    sdk = createSdk();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('listAccounts() sends GET /v1/banking/accounts with filters and preserves hasMore', async () => {
    const account: BankAccount = {
      id: 'acc_1',
      provider: 'saltedge',
      bankName: 'BBVA',
      accountName: 'Operating EUR',
      accountNumber: '1234',
      iban: 'ES91****1234',
      currency: 'EUR',
      isActive: true,
      lastSyncAt: '2026-11-21T08:00:00.000Z',
      createdAt: '2026-01-10T08:00:00.000Z',
      updatedAt: '2026-11-21T08:00:00.000Z',
    };
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [account],
        total: 3,
        limit: 1,
        offset: 0,
        hasMore: true,
        meta: { requestId: 'req_acc' },
      }),
    );

    const page: Page<BankAccount> = await sdk.banking.listAccounts({
      provider: 'saltedge',
      isActive: true,
      limit: 1,
      offset: 0,
    });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    const url = new URL(rawUrl);
    expect(url.pathname).toBe('/v1/banking/accounts');
    expect(url.searchParams.get('provider')).toBe('saltedge');
    expect(url.searchParams.get('isActive')).toBe('true');
    expect(url.searchParams.get('limit')).toBe('1');
    expect(opts.method).toBe('GET');
    expect(page.data).toEqual([account]);
    expect(page.total).toBe(3);
    expect(page.hasMore).toBe(true);
  });

  it('retrieveAccount() sends GET /v1/banking/accounts/:accountId', async () => {
    const account: BankAccount = {
      id: 'acc_42',
      provider: 'manual',
      bankName: 'CaixaBank',
      accountName: 'Main',
      accountNumber: '5678',
      iban: null,
      currency: 'EUR',
      isActive: true,
      lastSyncAt: null,
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: account }));

    const result = await sdk.banking.retrieveAccount('acc_42');

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/banking/accounts/acc_42');
    expect(opts.method).toBe('GET');
    expect(result).toEqual(account);
  });

  it('listTransactions() sends GET /v1/banking/transactions with all canonical filters', async () => {
    const tx: BankTransaction = {
      id: 'tx_1',
      connectionId: 'acc_1',
      transactionId: 'prov_tx_1',
      date: '2026-11-15',
      amount: -49.99,
      currency: 'EUR',
      description: 'AWS EMEA',
      category: 'software',
      counterparty: { name: 'Amazon Web Services' },
      reconciled: false,
      status: 'raw',
      createdAt: '2026-11-15T10:00:00.000Z',
    };
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [tx],
        total: 1,
        limit: 25,
        offset: 0,
        hasMore: false,
      }),
    );

    const page = await sdk.banking.listTransactions({
      accountId: 'acc_1',
      from: '2026-11-01',
      to: '2026-11-30',
      status: 'raw',
      category: 'software',
      reconciled: false,
      limit: 25,
      offset: 0,
    });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    const url = new URL(rawUrl);
    expect(url.pathname).toBe('/v1/banking/transactions');
    expect(url.searchParams.get('accountId')).toBe('acc_1');
    expect(url.searchParams.get('from')).toBe('2026-11-01');
    expect(url.searchParams.get('to')).toBe('2026-11-30');
    expect(url.searchParams.get('status')).toBe('raw');
    expect(url.searchParams.get('category')).toBe('software');
    expect(url.searchParams.get('reconciled')).toBe('false');
    expect(opts.method).toBe('GET');
    expect(page.data).toEqual([tx]);
    expect(page.hasMore).toBe(false);
  });

  it('retrieveTransaction() sends GET /v1/banking/transactions/:transactionId', async () => {
    const tx: BankTransaction = {
      id: 'tx_9',
      connectionId: 'acc_1',
      date: '2026-11-18',
      amount: 1210,
      currency: 'EUR',
      description: 'Transferencia Acme SL',
      status: 'raw',
      reconciled: false,
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: tx }));

    const result = await sdk.banking.retrieveTransaction('tx_9');

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/banking/transactions/tx_9');
    expect(opts.method).toBe('GET');
    expect(result).toEqual(tx);
  });

  it('createTransaction() sends POST /v1/banking/transactions with Idempotency-Key', async () => {
    const created: BankTransaction = {
      id: 'tx_new',
      connectionId: 'acc_1',
      transactionId: 'manual-req_1',
      date: '2026-11-20',
      amount: -120.5,
      currency: 'EUR',
      description: 'Office supplies',
      category: 'office',
      counterparty: { name: 'Papeleria Central', iban: 'ES7921000813610123456789' },
      reconciled: false,
      status: 'raw',
      source: 'manual',
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: created }, 201));

    const result = await sdk.banking.createTransaction({
      accountId: 'acc_1',
      amount: -120.5,
      date: '2026-11-20',
      description: 'Office supplies',
      currency: 'EUR',
      category: 'office',
      counterparty: { name: 'Papeleria Central', iban: 'ES7921000813610123456789' },
    });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/banking/transactions');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Idempotency-Key']).toMatch(UUID_V4_RE);
    expect(JSON.parse(opts.body)).toMatchObject({
      accountId: 'acc_1',
      amount: -120.5,
      date: '2026-11-20',
      description: 'Office supplies',
    });
    expect(result).toEqual(created);
  });

  it('categorizeTransaction() sends PATCH /v1/banking/transactions/:id/categorize and does not retry 5xx', async () => {
    const updated: BankTransaction = {
      id: 'tx_1',
      date: '2026-11-15',
      amount: -49.99,
      description: 'AWS EMEA',
      category: 'hosting',
      categoryNotes: 'Production cloud bill',
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: updated }));

    const result = await sdk.banking.categorizeTransaction('tx_1', {
      category: 'hosting',
      notes: 'Production cloud bill',
    });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/banking/transactions/tx_1/categorize');
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({
      category: 'hosting',
      notes: 'Production cloud bill',
    });
    expect(result).toEqual(updated);

    // PATCH must never retry on 5xx
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(errorResponse(503, 'unavailable', 'Try again'));
    await expect(
      sdk.banking.categorizeTransaction('tx_1', { category: 'hosting' }),
    ).rejects.toThrow(APIError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('matchTransaction() sends POST /v1/banking/transactions/:id/match and surfaces 409 ConflictError', async () => {
    const matched: BankTransaction = {
      id: 'tx_9',
      date: '2026-11-18',
      amount: 1210,
      description: 'Transferencia Acme SL',
      status: 'matched',
      reconciled: true,
      reconciledWith: 'invoice',
      reconciledId: 'inv_42',
      matchedReferences: [{ referenceType: 'invoice', referenceId: 'inv_42', amount: 1210 }],
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: matched }));

    const result = await sdk.banking.matchTransaction('tx_9', {
      documentId: 'inv_42',
      documentType: 'invoice',
      notes: 'Matched against F2026-042',
    });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/banking/transactions/tx_9/match');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Idempotency-Key']).toMatch(UUID_V4_RE);
    expect(JSON.parse(opts.body)).toEqual({
      documentId: 'inv_42',
      documentType: 'invoice',
      notes: 'Matched against F2026-042',
    });
    expect(result).toEqual(matched);

    // Double-match conflict → 409 ConflictError, no retry
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(
      errorResponse(409, 'conflict', 'Transaction is already matched/reconciled. Unmatch it first.'),
    );
    await expect(
      sdk.banking.matchTransaction('tx_9', { documentId: 'inv_42', documentType: 'invoice' }),
    ).rejects.toThrow(ConflictError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('transactionSuggestions() sends GET /v1/banking/transactions/:id/suggestions with optional limit', async () => {
    const payload: BankTransactionSuggestionsResult = {
      transactionId: 'tx_9',
      limit: 3,
      suggestions: [
        {
          documentType: 'invoice',
          documentId: 'inv_42',
          score: 95,
          confidence: 95,
          suggested: true,
          amountDiff: 0,
          dateDiff: 2,
          reasons: ['Exact amount match', 'Counterparty name match'],
          breakdown: [
            { signal: 'amount', points: 50, similarity: 1, reason: 'Exact amount match' },
            { signal: 'counterparty', points: 45, similarity: 0.9, reason: 'Counterparty name match' },
          ],
        },
      ],
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: payload }));

    const result = await sdk.banking.transactionSuggestions('tx_9', { limit: 3 });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    const url = new URL(rawUrl);
    expect(url.pathname).toBe('/v1/banking/transactions/tx_9/suggestions');
    expect(url.searchParams.get('limit')).toBe('3');
    expect(opts.method).toBe('GET');
    expect(result).toEqual(payload);
  });
});
