/**
 * Period close helpers (D3-T4).
 */

import type { PeriodClose } from '../types/period.js';
import type { RequestOptions } from '../types.js';

const enc = encodeURIComponent;

export interface HttpClientGettable {
  get<T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
    opts?: RequestOptions,
  ): Promise<T>;
}

/**
 * Retrieve the fiscal-year period close status.
 *
 * The Frihet backend (`functions/src/publicApi/families/periods.ts`) accepts
 * ONLY `'current'` or a 4-digit fiscal year matching `/^\d{4}$/` (e.g. `'2026'`,
 * `'2025'`). Month/quarter ids such as `'2026-03'` or `'2026-Q1'` return 404.
 *
 *  - `periodCloseStatus(client)` or `periodCloseStatus(client, 'current')`
 *    queries `GET /v1/periods/current` for the active workspace fiscal year.
 *  - `periodCloseStatus(client, '2026')` queries `GET /v1/periods/2026` for
 *    that fiscal year.
 *
 * Maps to `GET /v1/periods/{current|YYYY}`.
 */
export function periodCloseStatus(
  client: HttpClientGettable,
  periodId?: string,
  opts?: RequestOptions,
): Promise<PeriodClose | null> {
  const path = periodId ? `/periods/${enc(periodId)}` : '/periods/current';
  return client.get<PeriodClose | null>(path, undefined, opts);
}
