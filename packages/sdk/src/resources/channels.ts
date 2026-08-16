import type { HttpClient } from '../client.js';
import { CapabilityUnavailableError } from '../error.js';
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
 * Legacy top-level Channels compatibility resource.
 *
 * Read methods temporarily preserve their existing network behavior. Mutation
 * and sync methods are retained only for source compatibility and fail locally
 * with CapabilityUnavailableError before any HTTP request.
 */
export class Channels {
  constructor(private readonly _client: HttpClient) {}

  /**
   * @deprecated Legacy compatibility read only. Do not use for new
   * integrations. Scheduled for retirement after the compatibility window;
   * no replacement route is currently promised.
   */
  list(params?: ChannelListParams, opts?: RequestOptions): Promise<Page<Channel>> {
    return this._client.getPage('/channels', params as Record<string, string | number | boolean | undefined>, opts);
  }

  /**
   * @deprecated Legacy compatibility read only. Do not use for new
   * integrations. Scheduled for retirement after the compatibility window;
   * no replacement route is currently promised.
   */
  retrieve(id: string, opts?: RequestOptions): Promise<Channel> {
    return this._client.get(`/channels/${enc(id)}`, undefined, opts);
  }

  /**
   * @deprecated Channels creation is absent from the intended public contract.
   * This method is retained for source compatibility and fails locally with
   * CapabilityUnavailableError before any HTTP request.
   */
  create(params: CreateChannelParams, opts?: RequestOptions): Promise<Channel> {
    void params; void opts;
    return unavailable<Channel>('create', 'POST', '/channels', 'absent');
  }

  /**
   * @deprecated Channels updates are absent from the intended public contract.
   * This method is retained for source compatibility and fails locally with
   * CapabilityUnavailableError before any HTTP request.
   */
  update(id: string, params: UpdateChannelParams, opts?: RequestOptions): Promise<Channel> {
    void id; void params; void opts;
    return unavailable<Channel>('update', 'PATCH', '/channels/:id', 'absent');
  }

  /**
   * @deprecated Channels deletion is absent from the intended public contract.
   * This method is retained for source compatibility and fails locally with
   * CapabilityUnavailableError before any HTTP request.
   */
  del(id: string, opts?: RequestOptions): Promise<void> {
    void id; void opts;
    return unavailable<void>('del', 'DELETE', '/channels/:id', 'absent');
  }

  /**
   * @deprecated Legacy compatibility read only. Do not use for new
   * integrations. Scheduled for retirement after the compatibility window;
   * no replacement route is currently promised.
   */
  search(query: string, params?: Omit<ChannelListParams, 'q'>, opts?: RequestOptions): Promise<Page<Channel>> {
    return this._client.getPage('/channels', { q: query, ...params } as Record<string, string | number | boolean | undefined>, opts);
  }

  /**
   * @deprecated Channels sync is deliberately not implemented as a public API
   * capability. This method is retained for source compatibility and fails
   * locally with CapabilityUnavailableError before any HTTP request.
   */
  sync(id: string, opts?: RequestOptions): Promise<ChannelSyncResult> {
    void id; void opts;
    return unavailable<ChannelSyncResult>('sync', 'POST', '/channels/:id/sync', 'not_implemented');
  }
}

function unavailable<T>(
  method: 'create' | 'update' | 'del' | 'sync',
  verb: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  reason: 'absent' | 'not_implemented',
): Promise<T> {
  return Promise.reject(new CapabilityUnavailableError(
    `Channels.${method} (${verb} ${path})`,
    reason,
    'The legacy top-level Channels mutation surface is being retired and is not called by the SDK.',
    'public_contract',
  ));
}
