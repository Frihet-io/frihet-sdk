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
 * Retrieve the period close status.
 *
 *  - `periodCloseStatus(client)` returns the most recently closed period
 *    (status === 'closed') or `null` if none.
 *  - `periodCloseStatus(client, '2026-03')` returns the close record for
 *    that specific period id, or `null` if the period is still open.
 *
 * Maps to `GET /v1/periods/{periodId?}`.
 */
export function periodCloseStatus(
  client: HttpClientGettable,
  periodId?: string,
  opts?: RequestOptions,
): Promise<PeriodClose | null> {
  const path = periodId ? `/periods/${enc(periodId)}` : '/periods/current';
  return client.get<PeriodClose | null>(path, undefined, opts);
}
