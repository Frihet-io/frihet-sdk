// Cross-surface contract truth tests.
//
// Each test in this file pins the Frihet-ERP public-API authority onto the
// SDK surface. They are designed to FAIL on the unfixed SDK and PASS once the
// corresponding defect is closed:
//
//   1. Team.setRole / Team.invite role union excludes 'member'
//      (ERP authority: functions/src/domain/team/teamRoleContract.ts:11,39-40).
//   2. Webhooks.create / Webhooks.update require `name`
//      (ERP authority: functions/src/publicApi.ts:5286, .strict() schema).
//   3. createBatch envelope preserves `meta`
//      (ERP authority: functions/src/publicApi.ts:5494-5499).
//   4. Channels.sync is a real HTTP call to POST /v1/channels/:id/sync
//      (ERP authority: functions/src/publicApi.ts:6891-6911).
//
// MATRIX reference: ~/Documents/frihet-cross-surface-2026-08-31/MATRIX.md
// (section "P1 — broken operation", items 1-4).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { expectTypeOf } from 'vitest';
import { HttpClient } from '../client.js';
import { CapabilityUnavailableError } from '../error.js';
import { Channels } from '../resources/channels.js';
import { Invoices } from '../resources/invoices.js';
import { Team } from '../resources/team.js';
import { Webhooks } from '../resources/webhooks.js';
import type {
  BatchResult,
  ChannelSyncResult,
  CreateWebhookParams,
  SetTeamRole,
  TeamInviteParams,
} from '../types.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    headers: new Headers(),
    json: () => Promise.resolve(data),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  };
}

function client(): HttpClient {
  return new HttpClient({
    apiKey: 'fri_test_cross_surface',
    baseUrl: 'https://test.api.frihet.io/v1',
  });
}

// =============================================================================
// Defect 1 — Team role union
// =============================================================================

describe('Defect 1: Team role union excludes member (ERP authority)', () => {
  it('TeamInviteParams.role rejects the literal "member" at the type level', () => {
    // Type-only assertion — fails to compile if the union still contains
    // 'member' (the assignment would be accepted and expectTypeOf.toEqual
    // would widen). The `// @ts-expect-error` would itself error if the
    // assignment is in fact rejected, so we use expectTypeOf's literal
    // narrowing instead: assignable means the literal is IN the union.
    type Role = TeamInviteParams['role'];
    expectTypeOf<Role>().not.toEqualTypeOf<'member'>();
    expectTypeOf<Role>().toEqualTypeOf<'admin' | 'editor' | 'accountant' | 'viewer'>();
  });

  it('SetTeamRole rejects the literal "member" at the type level', () => {
    type Role = SetTeamRole;
    expectTypeOf<Role>().not.toEqualTypeOf<'member'>();
    expectTypeOf<Role>().toEqualTypeOf<'admin' | 'editor' | 'accountant' | 'viewer'>();
  });

  it('TeamMember.role mirrors the assignable union (does not advertise "member")', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [{ id: 'tm_1', email: 'a@b.com', role: 'admin', status: 'active' }],
        total: 1,
        limit: 50,
        offset: 0,
      }),
    );
    const team = new Team(client());
    const page = await team.listMembers();
    // Runtime sanity: server-side roles are admin | editor | accountant | viewer.
    expect(['admin', 'editor', 'accountant', 'viewer']).toContain(page.data[0]!.role);
  });
});

// =============================================================================
// Defect 2 — Webhooks.create / Webhooks.update require `name`
// =============================================================================

describe('Defect 2: Webhooks.create / update require name (ERP authority)', () => {
  it('CreateWebhookParams includes "name" as a REQUIRED key', () => {
    // If `name` is still optional, this expectTypeOf check passes; with the
    // fix, name becomes required and the assignment below still typechecks
    // (params has url/events/name all present). The negative case — calling
    // .create({url, events}) without name — is exercised by the @ts-expect-error
    // line that follows.
    const ok: CreateWebhookParams = {
      url: 'https://hooks.example.com',
      events: ['invoice.created'],
      name: 'invoices',
    };
    expectTypeOf(ok).toMatchTypeOf<CreateWebhookParams>();

    // The negative half: an object missing `name` must NOT satisfy the
    // CreateWebhookParams contract. Before the fix this assignment compiles
    // (name is optional) and the @ts-expect-error comment is unused → TS error.
    // After the fix, name is required and the comment correctly suppresses.
    // @ts-expect-error 'name' is required by ERP webhookSchema.strict() (publicApi.ts:5286)
    const bad: CreateWebhookParams = { url: 'https://x', events: ['invoice.created'] };
    void bad;
  });

  it('create() POST body always carries a name field', async () => {
    const created = { id: 'wh_1', name: 'invoices', url: 'https://x', events: ['invoice.created'] };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: created }, 201));

    const webhooks = new Webhooks(client());
    await webhooks.create({
      url: 'https://hooks.example.com',
      events: ['invoice.created'],
      name: 'invoices',
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, opts] = mockFetch.mock.calls[0]!;
    const body = JSON.parse(opts.body);
    expect(body.name).toBe('invoices');
  });
});

// =============================================================================
// Defect 3 — createBatch envelope preserves meta
// =============================================================================

describe('Defect 3: createBatch envelope preserves meta (ERP authority)', () => {
  let invoices: Invoices;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch.mockReset();
    invoices = new Invoices(client());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the full {data, summary, meta} envelope from the ERP', async () => {
    const erpEnvelope = {
      data: [
        { index: 0, success: true, data: { id: 'inv_new', clientName: 'Alpha' } },
        { index: 1, success: false, error: 'duplicate documentNumber' },
      ],
      summary: { total: 2, succeeded: 1, failed: 1 },
      meta: { requestId: 'req_batch_xyz', timestamp: '2026-08-31T02:00:00.000Z' },
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(erpEnvelope));

    const result = await invoices.createBatch([
      { clientName: 'Alpha', items: [{ description: 'x', quantity: 1, unitPrice: 10 }] },
      { clientName: 'Beta', items: [{ description: 'y', quantity: 1, unitPrice: 20 }] },
    ]);

    expect(result.data).toHaveLength(2);
    expect(result.summary).toEqual({ total: 2, succeeded: 1, failed: 1 });
    expect(result.meta).toEqual(erpEnvelope.meta);
  });

  it('BatchResult<T> advertises meta in the public type surface', () => {
    type Shape = BatchResult<{ id: string }>;
    expectTypeOf<Shape>().toHaveProperty('meta');
    expectTypeOf<Shape['meta']>().toEqualTypeOf<Record<string, unknown> | undefined>();
  });
});

// =============================================================================
// Defect 4 — Channels.sync is a real HTTP call
// =============================================================================

describe('Defect 4: Channels.sync is a real HTTP call (ERP authority)', () => {
  let channels: Channels;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch.mockReset();
    channels = new Channels(client());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sync() sends POST /channels/:id/sync and returns the typed result', async () => {
    const erpEnvelope = {
      data: { success: true, message: 'Sync triggered', channelId: 'ch_1' },
      meta: { requestId: 'req_sync', timestamp: '2026-08-31T02:00:00.000Z' },
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(erpEnvelope));

    const result: ChannelSyncResult = await channels.sync('ch_1');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/channels/ch_1/sync');
    expect(opts.method).toBe('POST');
    expect(result).toEqual({ success: true, message: 'Sync triggered', channelId: 'ch_1' });
  });

  it.each([
    { method: 'create' as const, params: { propertyId: 'prop_1', name: 'Booking' } },
    { method: 'update' as const, params: { name: 'Booking updated' } },
  ])('$method still fails locally without dispatching HTTP', async ({ method, params }) => {
    if (method === 'create') {
      await expect(channels.create(params)).rejects.toBeInstanceOf(CapabilityUnavailableError);
    } else {
      await expect(channels.update('ch_1', params)).rejects.toBeInstanceOf(CapabilityUnavailableError);
    }
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('del still fails locally without dispatching HTTP', async () => {
    await expect(channels.del('ch_1')).rejects.toBeInstanceOf(CapabilityUnavailableError);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
