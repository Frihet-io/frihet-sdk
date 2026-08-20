import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpClient } from '../client.js';
import { Intelligence } from '../resources/intelligence.js';
import type { FinancialSummary } from '../types.js';

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

function client(): HttpClient {
  return new HttpClient({
    apiKey: 'fri_test_intel_summary',
    baseUrl: 'https://test.api.frihet.io/v1',
  });
}

/**
 * Contract test — Frihet backend `GET /v1/summary` response shape.
 *
 * Pinned against Frihet-ERP origin/main d5f3f3cdf (functions/src/publicApi.ts
 * lines 2593–2607; functions/src/openapi.public.json `components.schemas.
 * Summary`). The runtime emits this exact JSON envelope; the SDK type was
 * stale (expenses:number / invoiceStatus / overdue.total / missing period).
 *
 * This test FAILS with the stale FinancialSummary interface because:
 *   1. `.expenses` is `{ total: number }`, not `number`;
 *   2. `.invoicesByStatus` is the canonical key (SDK had `invoiceStatus`);
 *   3. `.overdue.amount` is the canonical key (SDK had `overdue.total`);
 *   4. `.period` was missing from the SDK interface.
 */
describe('Intelligence.summary() contract — Frihet /v1/summary', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('pins the GET /v1/summary route, verb and from/to params', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: sampleSummary() }));
    const intel = new Intelligence(client());
    await intel.summary({ from: '2026-01-01', to: '2026-03-31' });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [rawUrl, init] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/summary');
    expect(init.method).toBe('GET');
    const url = new URL(rawUrl);
    expect(url.searchParams.get('from')).toBe('2026-01-01');
    expect(url.searchParams.get('to')).toBe('2026-03-31');
  });

  it('decodes the exact canonical /v1/summary envelope shape', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: sampleSummary() }));
    const intel = new Intelligence(client());
    const result = await intel.summary();

    // Top-level keys — pinned order is not asserted (server reserves the right
    // to add new fields); only presence + shape of the canonical fields.
    expect(result).toMatchObject({
      period: { from: '2026-01-01', to: '2026-03-31' },
      revenue: {
        invoiced: 25000,
        paid: 18500,
        pending: 4500,
        overdue: 2000,
      },
      expenses: { total: 8200 },
      profit: 10300,
      counts: {
        clients: 23,
        expenses: 87,
        invoices: 42,
        products: 12,
        quotes: 15,
      },
      invoicesByStatus: {
        draft: 3,
        overdue: 3,
        paid: 28,
        sent: 8,
      },
      overdue: { count: 3, amount: 2000 },
    });
  });

  it('treats the summary response as the typed FinancialSummary', () => {
    const typed: FinancialSummary = sampleSummary();
    // The stale SDK fields would force `.expenses` to be `number` and miss
    // `period`. After the type fix, this assignment must compile unchanged.
    expect(typed.expenses.total).toBe(8200);
    expect(typed.invoicesByStatus.paid).toBe(28);
    expect(typed.overdue.amount).toBe(2000);
    expect(typed.period.from).toBe('2026-01-01');
  });
});

function sampleSummary(): FinancialSummary {
  // The runtime emits these exact keys (see publicApi.ts:2593-2607).
  return {
    period: { from: '2026-01-01', to: '2026-03-31' },
    revenue: {
      invoiced: 25000,
      paid: 18500,
      pending: 4500,
      overdue: 2000,
    },
    expenses: { total: 8200 },
    profit: 10300,
    counts: {
      clients: 23,
      expenses: 87,
      invoices: 42,
      products: 12,
      quotes: 15,
    },
    invoicesByStatus: {
      draft: 3,
      overdue: 3,
      paid: 28,
      sent: 8,
    },
    overdue: { count: 3, amount: 2000 },
  };
}