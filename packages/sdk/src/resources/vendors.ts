import type { HttpClient } from '../client.js';
import type { Vendor, CreateVendorParams, UpdateVendorParams, VendorListParams, Page, RequestOptions } from '../types.js';

const enc = encodeURIComponent;

export class Vendors {
  constructor(private _client: HttpClient) {}

  list(params?: VendorListParams, opts?: RequestOptions): Promise<Page<Vendor>> {
    return this._client.getPage('/vendors', params as Record<string, string | number | undefined>, opts);
  }

  retrieve(id: string, opts?: RequestOptions): Promise<Vendor> {
    return this._client.get(`/vendors/${enc(id)}`, undefined, opts);
  }

  create(params: CreateVendorParams, opts?: RequestOptions): Promise<Vendor> {
    return this._client.post('/vendors', params, opts);
  }

  update(id: string, params: UpdateVendorParams, opts?: RequestOptions): Promise<Vendor> {
    return this._client.patch(`/vendors/${enc(id)}`, params, opts);
  }

  del(id: string, opts?: RequestOptions): Promise<void> {
    return this._client.del(`/vendors/${enc(id)}`, opts);
  }

  search(query: string, params?: Omit<VendorListParams, 'q'>, opts?: RequestOptions): Promise<Page<Vendor>> {
    return this._client.getPage('/vendors', { q: query, ...params } as Record<string, string | number | undefined>, opts);
  }
}
