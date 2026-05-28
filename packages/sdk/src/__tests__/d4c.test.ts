/**
 * D4-C — HR + webhook signature + banking + period close
 *
 * Helpers tested against a mock client that records calls. Webhook signature
 * verification is tested directly (it has no transport dependency).
 */

import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';

import {
  createLeaveRequest,
  approveLeave,
  rejectLeave,
} from '../api/leaves.js';
import { bankRuleSimulate } from '../api/banking.js';
import { periodCloseStatus } from '../api/period.js';
import { webhookSignatureVerify } from '../api/webhookSignature.js';
import type {
  CreateLeaveRequestParams,
  LeaveRequest,
} from '../types/hr.js';
import type {
  BankRuleSimulateResult,
  CreateBankRuleParams,
} from '../types/banking.js';
import type { PeriodClose } from '../types/period.js';

// -- mock transport ---------------------------------------------------------

function mockPostClient<T>(returnValue: T) {
  const post = vi.fn().mockResolvedValue(returnValue);
  return { post, client: { post } };
}

function mockGetClient<T>(returnValue: T) {
  const get = vi.fn().mockResolvedValue(returnValue);
  return { get, client: { get } };
}

// -- Leaves -----------------------------------------------------------------

describe('createLeaveRequest', () => {
  it('POSTs /leaves with the request body', async () => {
    const result: LeaveRequest = {
      id: 'lv_1',
      employeeId: 'emp_1',
      employeeName: 'Ada Lovelace',
      type: 'vacation',
      startDate: '2026-07-01',
      endDate: '2026-07-15',
      businessDays: 11,
      status: 'pending',
      createdAt: '2026-05-16T10:00:00Z',
    };
    const { post, client } = mockPostClient(result);

    const params: CreateLeaveRequestParams = {
      employeeId: 'emp_1',
      type: 'vacation',
      startDate: '2026-07-01',
      endDate: '2026-07-15',
    };
    const got = await createLeaveRequest(client, params);

    expect(post).toHaveBeenCalledWith('/leaves', params, undefined);
    expect(got).toEqual(result);
  });
});

describe('approveLeave', () => {
  it('POSTs /leaves/:id/approve without body when no reason', async () => {
    const { post, client } = mockPostClient(undefined);
    await approveLeave(client, 'lv_1');
    expect(post).toHaveBeenCalledWith('/leaves/lv_1/approve', undefined, undefined);
  });

  it('POSTs /leaves/:id/approve with reason when provided', async () => {
    const { post, client } = mockPostClient(undefined);
    await approveLeave(client, 'lv_1', 'Cobertura confirmada');
    expect(post).toHaveBeenCalledWith(
      '/leaves/lv_1/approve',
      { reason: 'Cobertura confirmada' },
      undefined,
    );
  });

  it('URL-encodes the leave id', async () => {
    const { post, client } = mockPostClient(undefined);
    await approveLeave(client, 'lv with space');
    expect(post).toHaveBeenCalledWith('/leaves/lv%20with%20space/approve', undefined, undefined);
  });
});

describe('rejectLeave', () => {
  it('POSTs /leaves/:id/reject with required reason', async () => {
    const { post, client } = mockPostClient(undefined);
    await rejectLeave(client, 'lv_2', 'Coincide con cierre fiscal');
    expect(post).toHaveBeenCalledWith(
      '/leaves/lv_2/reject',
      { reason: 'Coincide con cierre fiscal' },
      undefined,
    );
  });
});

// -- Banking ----------------------------------------------------------------

describe('bankRuleSimulate', () => {
  it('POSTs /bank/rules/simulate and returns matched count + sample', async () => {
    const result: BankRuleSimulateResult = { matched: 3, sample: [] };
    const { post, client } = mockPostClient(result);

    const rule: CreateBankRuleParams = {
      name: 'AWS hosting',
      priority: 100,
      isActive: true,
      conditions: [{ field: 'counterparty', operator: 'contains', value: 'AMAZON WEB' }],
      action: 'categorize_expense',
      actionConfig: { category: 'hosting' },
    };

    const got = await bankRuleSimulate(client, rule);
    expect(post).toHaveBeenCalledWith('/bank/rules/simulate', rule, undefined);
    expect(got.matched).toBe(3);
  });
});

// -- Period close -----------------------------------------------------------

describe('periodCloseStatus', () => {
  it('GETs /periods/current when no id given', async () => {
    const closed: PeriodClose = {
      id: 'pc_1',
      granularity: 'month',
      period: '2026-03',
      from: '2026-03-01',
      to: '2026-03-31',
      status: 'closed',
      createdAt: '2026-04-01T00:00:00Z',
    };
    const { get, client } = mockGetClient(closed);
    const got = await periodCloseStatus(client);
    expect(get).toHaveBeenCalledWith('/periods/current', undefined, undefined);
    expect(got?.status).toBe('closed');
  });

  it('GETs /periods/:id when id given (URL-encoded)', async () => {
    const { get, client } = mockGetClient(null);
    await periodCloseStatus(client, '2026-Q1');
    expect(get).toHaveBeenCalledWith('/periods/2026-Q1', undefined, undefined);
  });

  it('returns null when API responds with null (period is open)', async () => {
    const { client } = mockGetClient<PeriodClose | null>(null);
    const got = await periodCloseStatus(client, '2026-05');
    expect(got).toBeNull();
  });
});

// -- Webhook signature verification ----------------------------------------

describe('webhookSignatureVerify', () => {
  const secret = 'whsec_test_abc';
  const payload = JSON.stringify({ event: 'invoice.paid', id: 'inv_1' });
  const validHex = createHmac('sha256', secret).update(payload).digest('hex');

  const nowSec = () => Math.floor(Date.now() / 1000);

  it('accepts the timestamp=<>, signature=<hex> header shape', () => {
    const header = `timestamp=${nowSec()}, signature=${validHex}`;
    expect(webhookSignatureVerify(payload, header, secret)).toBe(true);
  });

  it('accepts the sha256=<hex> shape', () => {
    expect(webhookSignatureVerify(payload, `sha256=${validHex}`, secret)).toBe(true);
  });

  it('accepts a bare hex shape', () => {
    expect(webhookSignatureVerify(payload, validHex, secret)).toBe(true);
  });

  it('accepts a WebhookSignaturePayload object', () => {
    const header = `timestamp=${nowSec()}, signature=${validHex}`;
    expect(
      webhookSignatureVerify({ payload, signature: header, secret }),
    ).toBe(true);
  });

  it('rejects when the secret is wrong', () => {
    expect(webhookSignatureVerify(payload, validHex, 'wrong_secret')).toBe(false);
  });

  it('rejects when the payload was tampered with', () => {
    expect(webhookSignatureVerify(payload + 'x', validHex, secret)).toBe(false);
  });

  it('rejects empty payload / signature / secret without throwing', () => {
    expect(webhookSignatureVerify('', validHex, secret)).toBe(false);
    expect(webhookSignatureVerify(payload, '', secret)).toBe(false);
    expect(webhookSignatureVerify(payload, validHex, '')).toBe(false);
  });

  it('rejects non-hex signatures (no silent Buffer.from truncation)', () => {
    // 64 chars but contains non-hex — would have passed a naive length check
    const garbage = 'ZZZZ' + 'a'.repeat(60);
    expect(webhookSignatureVerify(payload, garbage, secret)).toBe(false);
  });

  it('rejects signatures with the wrong length', () => {
    expect(webhookSignatureVerify(payload, validHex.slice(0, 32), secret)).toBe(false);
    expect(webhookSignatureVerify(payload, validHex + 'ab', secret)).toBe(false);
  });

  it('rejects timestamps older than maxAgeSeconds', () => {
    const oldTs = nowSec() - 600;
    const header = `timestamp=${oldTs}, signature=${validHex}`;
    expect(webhookSignatureVerify(payload, header, secret, 300)).toBe(false);
  });

  it('rejects timestamps in the future', () => {
    const futureTs = nowSec() + 600;
    const header = `timestamp=${futureTs}, signature=${validHex}`;
    expect(webhookSignatureVerify(payload, header, secret, 300)).toBe(false);
  });

  it('disables timestamp check when maxAgeSeconds <= 0', () => {
    const oldTs = nowSec() - 99999;
    const header = `timestamp=${oldTs}, signature=${validHex}`;
    expect(webhookSignatureVerify(payload, header, secret, 0)).toBe(true);
  });

  it('trims whitespace around the signature value', () => {
    const header = `timestamp=${nowSec()}, signature=  ${validHex}  `;
    expect(webhookSignatureVerify(payload, header, secret)).toBe(true);
  });
});
