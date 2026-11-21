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
import {
  bankRuleSimulate,
  listBankRules,
  createBankRule,
} from '../api/banking.js';
import { periodCloseStatus } from '../api/period.js';
import { webhookSignatureVerify } from '../api/webhookSignature.js';
import { CapabilityUnavailableError } from '../error.js';
import type {
  CreateLeaveRequestParams,
  LeaveRequest,
} from '../types/hr.js';
import type {
  BankRule,
  CreateBankRuleApiParams,
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

describe('bankRuleSimulate (fail-closed phantom route)', () => {
  it('rejects locally with CapabilityUnavailableError and never dispatches HTTP', async () => {
    const { post, client } = mockPostClient({ matched: 0, sample: [] });

    const rule: CreateBankRuleParams = {
      name: 'AWS hosting',
      priority: 100,
      isActive: true,
      conditions: [{ field: 'counterparty', operator: 'contains', value: 'AMAZON WEB' }],
      action: 'categorize_expense',
      actionConfig: { category: 'hosting' },
    };

    const err = await bankRuleSimulate(client, rule).catch(e => e) as CapabilityUnavailableError;
    expect(err).toBeInstanceOf(CapabilityUnavailableError);
    expect(err.reason).toBe('absent');
    expect(err.capability).toContain('/bank/rules/simulate');
    expect(post).not.toHaveBeenCalled();
  });
});

describe('listBankRules & createBankRule (canonical /v1/banking/rules)', () => {
  it('listBankRules GETs /banking/rules with pagination/filter params', async () => {
    const page = { data: [] as BankRule[], total: 0, limit: 50, offset: 0 };
    const getPage = vi.fn().mockResolvedValue(page);

    const got = await listBankRules({ getPage }, { isActive: true, limit: 10, offset: 0 });
    expect(getPage).toHaveBeenCalledWith(
      '/banking/rules',
      { isActive: true, limit: 10, offset: 0 },
      undefined,
    );
    expect(got).toEqual(page);
  });

  it('createBankRule POSTs /banking/rules with bankConditions payload', async () => {
    const created: BankRule = {
      id: 'rule_1',
      name: 'AWS hosting',
      priority: 100,
      isActive: true,
      conditions: [],
      bankConditions: [{ field: 'counterparty', operator: 'contains', value: 'AMAZON WEB' }],
      action: 'categorize_expense',
      actionConfig: { category: 'hosting' },
      createdAt: '2026-11-21T10:00:00Z',
      updatedAt: '2026-11-21T10:00:00Z',
    };
    const { post, client } = mockPostClient(created);

    const rule: CreateBankRuleApiParams = {
      name: 'AWS hosting',
      priority: 100,
      isActive: true,
      bankConditions: [{ field: 'counterparty', operator: 'contains', value: 'AMAZON WEB' }],
      action: 'categorize_expense',
      actionConfig: { category: 'hosting' },
    };

    const got = await createBankRule(client, rule);
    expect(post).toHaveBeenCalledWith('/banking/rules', rule, undefined);
    expect(got).toEqual(created);
  });
});

// -- Period close -----------------------------------------------------------

describe('periodCloseStatus', () => {
  it('GETs /periods/current when no id given', async () => {
    const closed: PeriodClose = {
      id: 'pc_1',
      granularity: 'year',
      period: '2026',
      from: '2026-01-01',
      to: '2026-12-31',
      status: 'closed',
      createdAt: '2027-01-01T00:00:00Z',
    };
    const { get, client } = mockGetClient(closed);
    const got = await periodCloseStatus(client);
    expect(get).toHaveBeenCalledWith('/periods/current', undefined, undefined);
    expect(got?.status).toBe('closed');
  });

  it('GETs /periods/:year when 4-digit fiscal year given', async () => {
    const { get, client } = mockGetClient(null);
    await periodCloseStatus(client, '2026');
    expect(get).toHaveBeenCalledWith('/periods/2026', undefined, undefined);
  });

  it('GETs /periods/current when "current" is explicitly passed', async () => {
    const { get, client } = mockGetClient(null);
    await periodCloseStatus(client, 'current');
    expect(get).toHaveBeenCalledWith('/periods/current', undefined, undefined);
  });

  it('returns null when API responds with null (period is open)', async () => {
    const { client } = mockGetClient<PeriodClose | null>(null);
    const got = await periodCloseStatus(client, '2025');
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
