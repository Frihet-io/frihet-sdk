/**
 * Wave-2 SDK parity tests — Banking rules, Expenses attachments & billable,
 * POS (/v1/pos/*), Kitchen/KDS (/v1/kitchen/*), and Stay live read routes.
 *
 * Every path, verb, query param, request body, and response shape is pinned
 * against Frihet-ERP functions/src/openapi.json, functions/src/publicApi.ts,
 * and functions/src/publicApi/families/{pos,kitchen,stay}.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Frihet,
  Pos,
  Kitchen,
  APIError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../index.js';
import type {
  BankRule,
  ExpenseAttachmentUpload,
  AddExpenseAttachmentResult,
  MarkExpenseBillableResult,
  UnmarkExpenseBillableResult,
  PosTerminal,
  PosSale,
  PosSaleCreateResult,
  PosSaleRefundResult,
  CashSessionCloseResult,
  KitchenStation,
  KitchenMenuItem,
  KitchenTicket,
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
    apiKey: 'fri_test_wave2',
    baseUrl: 'https://test.api.frihet.io/v1',
  });
}

describe('Frihet Wave-2 resource accessors', () => {
  const sdk = createSdk();

  it('exposes pos and kitchen resource accessors', () => {
    expect(sdk.pos).toBeInstanceOf(Pos);
    expect(sdk.kitchen).toBeInstanceOf(Kitchen);
  });
});

// =============================================================================
// Banking Rules (GET/POST /v1/banking/rules)
// =============================================================================

describe('Banking rules (canonical /v1/banking/rules)', () => {
  let sdk: Frihet;

  beforeEach(() => {
    mockFetch.mockReset();
    sdk = createSdk();
  });

  it('listRules() sends GET /v1/banking/rules with isActive/limit/offset', async () => {
    const rule: BankRule = {
      id: 'rule_1',
      name: 'AWS hosting',
      priority: 100,
      isActive: true,
      conditions: [],
      bankConditions: [{ field: 'counterparty', operator: 'contains', value: 'AMAZON WEB' }],
      action: 'categorize_expense',
      actionConfig: { category: 'hosting' },
      createdAt: '2026-11-21T10:00:00.000Z',
      updatedAt: '2026-11-21T10:00:00.000Z',
    };
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [rule], total: 1, limit: 20, offset: 0 }),
    );

    const page: Page<BankRule> = await sdk.banking.listRules({
      isActive: true,
      limit: 20,
      offset: 0,
    });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    const url = new URL(rawUrl);
    expect(url.pathname).toBe('/v1/banking/rules');
    expect(url.searchParams.get('isActive')).toBe('true');
    expect(url.searchParams.get('limit')).toBe('20');
    expect(url.searchParams.get('offset')).toBe('0');
    expect(opts.method).toBe('GET');
    expect(page.data).toEqual([rule]);
  });

  it('createRule() sends POST /v1/banking/rules with Idempotency-Key and bankConditions', async () => {
    const created: BankRule = {
      id: 'rule_new',
      name: 'Stripe payouts',
      priority: 50,
      isActive: true,
      enabled: true,
      autoApply: false,
      matchCount: 0,
      timesApplied: 0,
      conditions: [],
      bankConditions: [
        { field: 'description', operator: 'starts_with', value: 'STRIPE' },
        { field: 'amount', operator: 'amount_above', value: '0' },
      ],
      action: 'match_client',
      actionConfig: { clientId: 'cli_stripe' },
      createdAt: '2026-11-21T10:00:00.000Z',
      updatedAt: '2026-11-21T10:00:00.000Z',
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: created }, 201));

    const result = await sdk.banking.createRule({
      name: 'Stripe payouts',
      priority: 50,
      bankConditions: [
        { field: 'description', operator: 'starts_with', value: 'STRIPE' },
        { field: 'amount', operator: 'amount_above', value: '0' },
      ],
      action: 'match_client',
      actionConfig: { clientId: 'cli_stripe' },
    });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/banking/rules');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Idempotency-Key']).toMatch(UUID_V4_RE);
    expect(JSON.parse(opts.body).bankConditions).toHaveLength(2);
    expect(result).toEqual(created);
  });
});

// =============================================================================
// Expenses Attachments & Billable
// =============================================================================

describe('Expenses attachments & billable', () => {
  let sdk: Frihet;

  beforeEach(() => {
    mockFetch.mockReset();
    sdk = createSdk();
  });

  it('createAttachmentUpload() sends POST /v1/expenses/attachments/uploads', async () => {
    const upload: ExpenseAttachmentUpload = {
      uploadId: 'upl_1',
      fileReferenceId: 'expatt_abcdef123456',
      fileId: 'expatt_abcdef123456',
      fileName: 'receipt.pdf',
      originalName: 'receipt.pdf',
      contentType: 'application/pdf',
      sizeBytes: 24500,
      size: 24500,
      maxSizeBytes: 10485760,
      expiresAt: '2026-11-21T12:15:00.000Z',
      status: 'prepared',
      attach: {
        expenseId: 'exp_1',
        endpoint: '/v1/expenses/exp_1/attachments',
        body: {
          fileReferenceId: 'expatt_abcdef123456',
          fileName: 'receipt.pdf',
          contentType: 'application/pdf',
          sizeBytes: 24500,
        },
      },
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: upload }));

    const result = await sdk.expenses.createAttachmentUpload({
      fileName: 'receipt.pdf',
      contentType: 'application/pdf',
      sizeBytes: 24500,
      expenseId: 'exp_1',
    });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/expenses/attachments/uploads');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Idempotency-Key']).toMatch(UUID_V4_RE);
    expect(JSON.parse(opts.body)).toEqual({
      fileName: 'receipt.pdf',
      contentType: 'application/pdf',
      sizeBytes: 24500,
      expenseId: 'exp_1',
    });
    expect(result).toEqual(upload);
  });

  it('addAttachment() sends POST /v1/expenses/:expenseId/attachments with URL-encoded id', async () => {
    const payload: AddExpenseAttachmentResult = {
      expenseId: 'exp/1',
      attachment: {
        fileId: 'expatt_abcdef123456',
        originalName: 'receipt.pdf',
        contentType: 'application/pdf',
        size: 24500,
      },
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: payload }));

    const result = await sdk.expenses.addAttachment('exp/1', {
      fileReferenceId: 'expatt_abcdef123456',
      fileName: 'receipt.pdf',
      contentType: 'application/pdf',
      sizeBytes: 24500,
    });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/expenses/exp%2F1/attachments');
    expect(opts.method).toBe('POST');
    expect(result).toEqual(payload);
  });

  it('markBillable() sends POST /v1/expenses/:expenseId/billable with clientId and markup', async () => {
    const payload: MarkExpenseBillableResult = {
      success: true,
      expenseId: 'exp_42',
      clientId: 'cli_9',
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: payload }));

    const result = await sdk.expenses.markBillable('exp_42', {
      clientId: 'cli_9',
      markup: 15,
    });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/expenses/exp_42/billable');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ clientId: 'cli_9', markup: 15 });
    expect(result).toEqual(payload);
  });

  it('unmarkBillable() sends DELETE /v1/expenses/:expenseId/billable', async () => {
    const payload: UnmarkExpenseBillableResult = {
      success: true,
      expenseId: 'exp_42',
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: payload }));

    const result = await sdk.expenses.unmarkBillable('exp_42');

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/expenses/exp_42/billable');
    expect(opts.method).toBe('DELETE');
    expect(result).toEqual(payload);
  });

  it('markBillable() surfaces 400 when expense is already invoiced', async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse(400, 'Expense is already invoiced and cannot be marked billable'),
    );

    await expect(
      sdk.expenses.markBillable('exp_billed', { clientId: 'cli_9' }),
    ).rejects.toThrow(ValidationError);
  });
});

// =============================================================================
// POS (/v1/pos/*)
// =============================================================================

describe('POS resource (canonical /v1/pos/*)', () => {
  let sdk: Frihet;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch.mockReset();
    sdk = createSdk();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('listTerminals() sends GET /v1/pos/terminals with locationId/limit/offset', async () => {
    const terminal: PosTerminal = {
      id: 'term_1',
      name: 'Main Counter',
      locationId: 'loc_1',
      isActive: true,
    };
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [terminal], total: 1, limit: 10, offset: 0 }),
    );

    const page = await sdk.pos.listTerminals({ locationId: 'loc_1', limit: 10, offset: 0 });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    const url = new URL(rawUrl);
    expect(url.pathname).toBe('/v1/pos/terminals');
    expect(url.searchParams.get('locationId')).toBe('loc_1');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(opts.method).toBe('GET');
    expect(page.data).toEqual([terminal]);
  });

  it('listSales() sends GET /v1/pos/sales with terminalId/status/from/to', async () => {
    const sale: PosSale = {
      id: 'sale_1',
      terminalId: 'term_1',
      saleNumber: 'POS-2026-0001',
      status: 'completed',
      totalCents: 1210,
    };
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [sale], total: 1, limit: 20, offset: 0 }),
    );

    const page = await sdk.pos.listSales({
      terminalId: 'term_1',
      status: 'completed',
      from: '2026-11-01',
      to: '2026-11-30',
      limit: 20,
    });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    const url = new URL(rawUrl);
    expect(url.pathname).toBe('/v1/pos/sales');
    expect(url.searchParams.get('terminalId')).toBe('term_1');
    expect(url.searchParams.get('status')).toBe('completed');
    expect(url.searchParams.get('from')).toBe('2026-11-01');
    expect(url.searchParams.get('to')).toBe('2026-11-30');
    expect(opts.method).toBe('GET');
    expect(page.data).toEqual([sale]);
  });

  it('retrieveSale() sends GET /v1/pos/sales/:id and propagates 404', async () => {
    const sale: PosSale = { id: 'sale_42', status: 'completed', totalCents: 2500 };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: sale }));

    const result = await sdk.pos.retrieveSale('sale_42');
    expect(new URL(mockFetch.mock.calls[0]![0]).pathname).toBe('/v1/pos/sales/sale_42');
    expect(result).toEqual(sale);

    mockFetch.mockResolvedValueOnce(errorResponse(404, 'NOT_FOUND', 'Sale sale_missing not found'));
    await expect(sdk.pos.retrieveSale('sale_missing')).rejects.toThrow(NotFoundError);
  });

  it('createSale() sends POST /v1/pos/sales and aligns Idempotency-Key with clientReferenceId', async () => {
    const created: PosSaleCreateResult = {
      status: 'completed',
      saleId: 'sale_99',
      saleNumber: 'POS-2026-0099',
      fiscalHash: 'abc123',
      qrUrl: 'https://aeat.es/qr?h=abc123',
      totals: {
        subtotalCents: 1000,
        taxCents: 210,
        discountCents: 0,
        tipCents: 0,
        totalCents: 1210,
      },
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: created }, 201));

    const result = await sdk.pos.createSale({
      terminalId: 'term_1',
      cashSessionId: 'sess_1',
      paymentMethod: 'cash',
      cashTendered: 2000,
      clientReferenceId: 'pos-cmd-0099',
      lines: [
        {
          productId: 'prod_1',
          sku: 'COFFEE-01',
          name: 'Espresso',
          quantity: 1,
          unitPriceCents: 1000,
          taxRate: 21,
          discountCents: 0,
        },
      ],
    });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/pos/sales');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Idempotency-Key']).toBe('pos-cmd-0099');
    expect(result).toEqual(created);
  });

  it('refundSale() sends POST /v1/pos/sales/:id/refund with {} body when params omitted', async () => {
    const refunded: PosSaleRefundResult = {
      id: 'ref_1',
      saleId: 'sale_99',
      status: 'succeeded',
      amountCents: 1210,
      currency: 'EUR',
      reason: 'requested_by_customer',
      createdAt: '2026-11-21T12:00:00.000Z',
      creditNoteId: 'cn_1',
      creditNoteHash: 'hash_cn',
      creditNoteStatus: 'draft',
      refundedAmountEur: 12.1,
      newStatus: 'refunded',
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: refunded }));

    const result = await sdk.pos.refundSale('sale_99');

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/pos/sales/sale_99/refund');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Idempotency-Key']).toMatch(UUID_V4_RE);
    expect(JSON.parse(opts.body)).toEqual({});
    expect(result).toEqual(refunded);
  });

  it('refundSale() supports partial refund with card_external attestation', async () => {
    const refunded: PosSaleRefundResult = {
      id: 'ref_2',
      saleId: 'sale_99',
      status: 'succeeded',
      amountCents: 500,
      currency: 'EUR',
      reason: 'item returned',
      createdAt: '2026-11-21T12:05:00.000Z',
      creditNoteId: 'cn_2',
      creditNoteHash: null,
      creditNoteStatus: 'draft',
      refundedAmountEur: 5,
      newStatus: 'partially_refunded',
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: refunded }));

    await sdk.pos.refundSale('sale_99', {
      amountCents: 500,
      reason: 'item returned',
      refundMethod: 'card_external',
      externalCardAttestation: { approved: true, approvalCode: 'AUTH-1234' },
    });

    const [, opts] = mockFetch.mock.calls[0]!;
    expect(JSON.parse(opts.body)).toEqual({
      amountCents: 500,
      reason: 'item returned',
      refundMethod: 'card_external',
      externalCardAttestation: { approved: true, approvalCode: 'AUTH-1234' },
    });
  });

  it('closeCashSession() sends POST /v1/pos/cash-sessions/:id/close and surfaces 409', async () => {
    const closed: CashSessionCloseResult = {
      sessionId: 'sess_1',
      zReportId: 'zrep_1',
      closingDeltaCents: 0,
      closedAt: '2026-11-21T22:00:00.000Z',
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: closed }));

    const result = await sdk.pos.closeCashSession('sess_1', {
      declaredCashCents: 15000,
      declaredCardCents: 32000,
      notes: 'Clean shift close',
    });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/pos/cash-sessions/sess_1/close');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Idempotency-Key']).toMatch(UUID_V4_RE);
    expect(JSON.parse(opts.body)).toEqual({
      declaredCashCents: 15000,
      declaredCardCents: 32000,
      notes: 'Clean shift close',
    });
    expect(result).toEqual(closed);

    mockFetch.mockResolvedValueOnce(errorResponse(409, 'CONFLICT', 'Session is not open'));
    await expect(
      sdk.pos.closeCashSession('sess_1', { declaredCashCents: 0, declaredCardCents: 0 }),
    ).rejects.toThrow(ConflictError);
  });
});

// =============================================================================
// Kitchen / KDS (/v1/kitchen/*)
// =============================================================================

describe('Kitchen resource (canonical /v1/kitchen/*)', () => {
  let sdk: Frihet;

  beforeEach(() => {
    mockFetch.mockReset();
    sdk = createSdk();
  });

  it('listStations() sends GET /v1/kitchen/stations', async () => {
    const station: KitchenStation = { id: 'st_grill', name: 'Grill', sortOrder: 1 };
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [station], total: 1, limit: 50, offset: 0 }),
    );

    const page = await sdk.kitchen.listStations({ limit: 50, offset: 0 });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/kitchen/stations');
    expect(opts.method).toBe('GET');
    expect(page.data).toEqual([station]);
  });

  it('listMenuItems() sends GET /v1/kitchen/menu-items with q and isActive', async () => {
    const item: KitchenMenuItem = { id: 'mi_1', name: 'Burger', available: true };
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [item], total: 1, limit: 25, offset: 0 }),
    );

    const page = await sdk.kitchen.listMenuItems({ q: 'burger', isActive: true, limit: 25 });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    const url = new URL(rawUrl);
    expect(url.pathname).toBe('/v1/kitchen/menu-items');
    expect(url.searchParams.get('q')).toBe('burger');
    expect(url.searchParams.get('isActive')).toBe('true');
    expect(opts.method).toBe('GET');
    expect(page.data).toEqual([item]);
  });

  it('listTickets() sends GET /v1/kitchen/tickets with status and stationId', async () => {
    const ticket: KitchenTicket = {
      id: 'tkt_1',
      status: 'preparing',
      priority: 'rush',
      stationIds: ['st_grill'],
    };
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [ticket], total: 1, limit: 10, offset: 0 }),
    );

    const page = await sdk.kitchen.listTickets({
      status: 'preparing',
      stationId: 'st_grill',
      limit: 10,
    });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    const url = new URL(rawUrl);
    expect(url.pathname).toBe('/v1/kitchen/tickets');
    expect(url.searchParams.get('status')).toBe('preparing');
    expect(url.searchParams.get('stationId')).toBe('st_grill');
    expect(opts.method).toBe('GET');
    expect(page.data).toEqual([ticket]);
  });

  it('retrieveTicket() sends GET /v1/kitchen/tickets/:id', async () => {
    const ticket: KitchenTicket = { id: 'tkt_42', status: 'ready', priority: 'normal' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: ticket }));

    const result = await sdk.kitchen.retrieveTicket('tkt_42');

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/kitchen/tickets/tkt_42');
    expect(opts.method).toBe('GET');
    expect(result).toEqual(ticket);
  });

  it('updateTicket() sends PATCH /v1/kitchen/tickets/:id and never retries on 5xx', async () => {
    const updated: KitchenTicket = {
      id: 'tkt_42',
      status: 'ready',
      priority: 'rush',
      courierEtaMinutes: 12,
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: updated }));

    const result = await sdk.kitchen.updateTicket('tkt_42', {
      status: 'ready',
      priority: 'rush',
      courierEtaMinutes: 12,
    });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/kitchen/tickets/tkt_42');
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({
      status: 'ready',
      priority: 'rush',
      courierEtaMinutes: 12,
    });
    expect(result).toEqual(updated);

    mockFetch.mockReset();
    mockFetch.mockResolvedValue(errorResponse(503, 'unavailable', 'Try again'));
    await expect(
      sdk.kitchen.updateTicket('tkt_42', { status: 'served' }),
    ).rejects.toThrow(APIError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
