import type { HttpClient } from '../client.js';
import type { Webhook, CreateWebhookParams, UpdateWebhookParams, WebhookListParams, Page, RequestOptions } from '../types.js';

const enc = encodeURIComponent;

export class Webhooks {
  constructor(private _client: HttpClient) {}

  list(params?: WebhookListParams, opts?: RequestOptions): Promise<Page<Webhook>> {
    return this._client.getPage('/webhooks', params as Record<string, string | number | boolean | undefined>, opts);
  }

  retrieve(id: string, opts?: RequestOptions): Promise<Webhook> {
    return this._client.get(`/webhooks/${enc(id)}`, undefined, opts);
  }

  create(params: CreateWebhookParams, opts?: RequestOptions): Promise<Webhook> {
    return this._client.post('/webhooks', params, opts);
  }

  update(id: string, params: UpdateWebhookParams, opts?: RequestOptions): Promise<Webhook> {
    return this._client.patch(`/webhooks/${enc(id)}`, params, opts);
  }

  del(id: string, opts?: RequestOptions): Promise<void> {
    return this._client.del(`/webhooks/${enc(id)}`, opts);
  }

  /**
   * Verify a webhook signature. Use this in your webhook handler to confirm
   * the payload was sent by Frihet.
   *
   * Uses dynamic import of node:crypto so the SDK can be loaded in non-Node
   * environments without breaking at import time.
   *
   * @param payload - Raw request body (string or Buffer)
   * @param signature - Value of the X-Frihet-Signature header
   * @param secret - Your webhook secret
   */
  static async verifySignature(payload: string | Buffer, signature: string, secret: string): Promise<boolean> {
    const { createHmac, timingSafeEqual } = await import('node:crypto');
    const expected = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
    if (expected.length !== signature.length) return false;
    return timingSafeEqual(Buffer.from(expected, 'utf-8'), Buffer.from(signature, 'utf-8'));
  }
}
