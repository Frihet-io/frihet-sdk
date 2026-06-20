import type { HttpClient } from '../client.js';

/**
 * Channels resource — Stay distribution channel feeds (iCal / API bindings to
 * OTAs). Routed at the TOP level (/v1/channels, ALLOWED_RESOURCES in
 * publicApi.ts:226), NOT under /stay, despite being a Stay-module resource.
 * CRUD on /v1/channels plus POST /v1/channels/:id/sync (publicApi.ts:4957).
 *
 * STAGE 1 SCAFFOLD: method bodies are added by the per-resource agent next stage.
 * Types are ready in ../types.ts: Channel, ChannelType, ChannelStatus,
 * CreateChannelParams, UpdateChannelParams, ChannelListParams, ChannelSyncResult.
 */
export class Channels {
  // Held for the next-stage resource methods (CRUD + sync).
  constructor(protected readonly _client: HttpClient) {}
}
