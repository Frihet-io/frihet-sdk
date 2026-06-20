import type { HttpClient } from '../client.js';
import type {
  Channel,
  ChannelListParams,
  CreateChannelParams,
  UpdateChannelParams,
  ChannelSyncResult,
  Page,
  RequestOptions,
} from '../types.js';

const enc = encodeURIComponent;

/**
 * Channels resource — Stay distribution channel feeds (iCal / API bindings to
 * OTAs). Routed at the TOP level (/v1/channels, ALLOWED_RESOURCES in
 * publicApi.ts:226), NOT under /stay, despite being a Stay-module resource.
 * CRUD on /v1/channels plus POST /v1/channels/:id/sync (publicApi.ts:4957).
 */
export class Channels {
  constructor(private readonly _client: HttpClient) {}

  list(params?: ChannelListParams, opts?: RequestOptions): Promise<Page<Channel>> {
    return this._client.getPage('/channels', params as Record<string, string | number | boolean | undefined>, opts);
  }

  retrieve(id: string, opts?: RequestOptions): Promise<Channel> {
    return this._client.get(`/channels/${enc(id)}`, undefined, opts);
  }

  create(params: CreateChannelParams, opts?: RequestOptions): Promise<Channel> {
    return this._client.post('/channels', params, opts);
  }

  update(id: string, params: UpdateChannelParams, opts?: RequestOptions): Promise<Channel> {
    return this._client.patch(`/channels/${enc(id)}`, params, opts);
  }

  del(id: string, opts?: RequestOptions): Promise<void> {
    return this._client.del(`/channels/${enc(id)}`, opts);
  }

  search(query: string, params?: Omit<ChannelListParams, 'q'>, opts?: RequestOptions): Promise<Page<Channel>> {
    return this._client.getPage('/channels', { q: query, ...params } as Record<string, string | number | boolean | undefined>, opts);
  }

  /**
   * Trigger a sync for a channel. The channel must have a `feedUrl` configured
   * (400 otherwise). Returns immediately; the actual feed pull is handled by a
   * scheduled Cloud Function.
   */
  sync(id: string, opts?: RequestOptions): Promise<ChannelSyncResult> {
    return this._client.post(`/channels/${enc(id)}/sync`, undefined, opts);
  }
}
