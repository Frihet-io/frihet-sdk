import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../client.js';
import { CapabilityUnavailableError } from '../error.js';
import { Channels } from '../resources/channels.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    json: () => Promise.resolve(data),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  };
}

function client(): HttpClient {
  return new HttpClient({
    apiKey: 'fri_test_channels',
    baseUrl: 'https://test.api.frihet.io/v1',
  });
}

describe('Channels SDK-first retirement contract', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('pins the complete seven-method public surface', () => {
    expect(Object.getOwnPropertyNames(Channels.prototype)).toEqual([
      'constructor',
      'list',
      'retrieve',
      'create',
      'update',
      'del',
      'search',
      'sync',
    ]);
  });

  it('preserves list() as GET /channels with the exact existing query contract', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], total: 0, limit: 17, offset: 3 }));
    const channels = new Channels(client());

    await channels.list({
      q: 'air bnb',
      propertyId: 'prop / 1',
      status: 'active',
      limit: 17,
      offset: 3,
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [rawUrl, init] = mockFetch.mock.calls[0]!;
    const url = new URL(rawUrl);
    expect(url.pathname).toBe('/v1/channels');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'air bnb',
      propertyId: 'prop / 1',
      status: 'active',
      limit: '17',
      offset: '3',
    });
    expect(init.method).toBe('GET');
  });

  it('preserves retrieve() as GET /channels/:id with existing encoding', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'ch/mañana' } }));
    const channels = new Channels(client());

    await channels.retrieve('ch/mañana');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [rawUrl, init] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/channels/ch%2Fma%C3%B1ana');
    expect(init.method).toBe('GET');
  });

  it('preserves search() as GET /channels with q plus the existing params', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], total: 0, limit: 9, offset: 2 }));
    const channels = new Channels(client());

    await channels.search('booking exact', {
      propertyId: 'prop_2',
      status: 'paused',
      limit: 9,
      offset: 2,
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [rawUrl, init] = mockFetch.mock.calls[0]!;
    const url = new URL(rawUrl);
    expect(url.pathname).toBe('/v1/channels');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'booking exact',
      propertyId: 'prop_2',
      status: 'paused',
      limit: '9',
      offset: '2',
    });
    expect(init.method).toBe('GET');
  });

  it('keeps read deprecation documentation-only with no runtime warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ data: [], total: 0, limit: 20, offset: 0 }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'ch_1' } }))
      .mockResolvedValueOnce(jsonResponse({ data: [], total: 0, limit: 20, offset: 0 }));
    const channels = new Channels(client());

    await channels.list();
    await channels.retrieve('ch_1');
    await channels.search('legacy');

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it.each([
    {
      method: 'create',
      capability: 'Channels.create (POST /channels)',
      reason: 'absent' as const,
      invoke: (channels: Channels) => channels.create({ propertyId: 'prop_1', name: 'Booking' }),
    },
    {
      method: 'update',
      capability: 'Channels.update (PATCH /channels/:id)',
      reason: 'absent' as const,
      invoke: (channels: Channels) => channels.update('ch_1', { name: 'Booking updated' }),
    },
    {
      method: 'del',
      capability: 'Channels.del (DELETE /channels/:id)',
      reason: 'absent' as const,
      invoke: (channels: Channels) => channels.del('ch_1'),
    },
  ] as const)('$method fails with the typed capability and zero dispatch', async ({ capability, reason, invoke }) => {
    const http = client();
    const dispatch = [
      vi.spyOn(http, 'get'),
      vi.spyOn(http, 'getPage'),
      vi.spyOn(http, 'post'),
      vi.spyOn(http, 'patch'),
      vi.spyOn(http, 'del'),
    ];
    const channels = new Channels(http);

    const error = await invoke(channels).catch(cause => cause);

    expect(error).toBeInstanceOf(CapabilityUnavailableError);
    expect(error).toMatchObject({ capability, reason });
    expect(error.message).toContain('No request was sent.');
    expect(error.message).toContain(
      'absent from the intended Frihet public API contract',
    );
    for (const call of dispatch) {
      expect(call).not.toHaveBeenCalled();
    }
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
