import type { HttpClient } from '../client.js';
import type { Client, CreateClientParams, UpdateClientParams, ClientListParams, Page, RequestOptions } from '../types.js';

const enc = encodeURIComponent;

export class Clients {
  constructor(private _client: HttpClient) {}

  list(params?: ClientListParams, opts?: RequestOptions): Promise<Page<Client>> {
    return this._client.getPage('/clients', params as Record<string, string | number | boolean | undefined>, opts);
  }

  retrieve(id: string, opts?: RequestOptions): Promise<Client> {
    return this._client.get(`/clients/${enc(id)}`, undefined, opts);
  }

  create(params: CreateClientParams, opts?: RequestOptions): Promise<Client> {
    return this._client.post('/clients', params, opts);
  }

  update(id: string, params: UpdateClientParams, opts?: RequestOptions): Promise<Client> {
    return this._client.patch(`/clients/${enc(id)}`, params, opts);
  }

  del(id: string, opts?: RequestOptions): Promise<void> {
    return this._client.del(`/clients/${enc(id)}`, opts);
  }

  search(query: string, params?: Omit<ClientListParams, 'q'>, opts?: RequestOptions): Promise<Page<Client>> {
    return this._client.getPage('/clients', { q: query, ...params } as Record<string, string | number | boolean | undefined>, opts);
  }
}
