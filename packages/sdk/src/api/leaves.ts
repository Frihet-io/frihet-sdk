/**
 * Leave helpers — thin wrappers over /v1/leaves.
 *
 * Each helper accepts a minimal `HttpClientLike` so it can be used either
 * with the full `Frihet` instance (which is exposed via the package default)
 * or with a custom transport for testing.
 */

import type { CreateLeaveRequestParams, LeaveRequest } from '../types/hr.js';
import type { RequestOptions } from '../types.js';

/**
 * Minimal HTTP transport surface required by the helpers below. The full
 * `HttpClient` from `client.ts` satisfies this contract without extra work.
 */
export interface HttpClientLike {
  post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
}

const enc = encodeURIComponent;

/**
 * Create a leave request for an employee.
 *
 * @example
 * ```ts
 * const req = await createLeaveRequest(frihet['_client'], {
 *   employeeId: 'emp_123',
 *   type: 'vacation',
 *   startDate: '2026-07-01',
 *   endDate: '2026-07-15',
 * });
 * ```
 */
export function createLeaveRequest(
  client: HttpClientLike,
  data: CreateLeaveRequestParams,
  opts?: RequestOptions,
): Promise<LeaveRequest> {
  return client.post<LeaveRequest>('/leaves', data, opts);
}

/**
 * Approve a pending leave request. `reason` is optional and surfaces in the
 * audit trail (used by GoBD / payroll exports).
 */
export function approveLeave(
  client: HttpClientLike,
  leaveId: string,
  reason?: string,
  opts?: RequestOptions,
): Promise<void> {
  return client.post<void>(
    `/leaves/${enc(leaveId)}/approve`,
    reason ? { reason } : undefined,
    opts,
  );
}

/**
 * Reject a pending leave request. `reason` is required so the requester
 * gets a meaningful explanation in their inbox.
 */
export function rejectLeave(
  client: HttpClientLike,
  leaveId: string,
  reason: string,
  opts?: RequestOptions,
): Promise<void> {
  return client.post<void>(`/leaves/${enc(leaveId)}/reject`, { reason }, opts);
}
