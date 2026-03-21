import type { HttpClient } from '../client.js';
import type { Product, CreateProductParams, UpdateProductParams, ProductListParams, Page, RequestOptions } from '../types.js';

const enc = encodeURIComponent;

export class Products {
  constructor(private _client: HttpClient) {}

  list(params?: ProductListParams, opts?: RequestOptions): Promise<Page<Product>> {
    return this._client.getPage('/products', params as Record<string, string | number | boolean | undefined>, opts);
  }

  retrieve(id: string, opts?: RequestOptions): Promise<Product> {
    return this._client.get(`/products/${enc(id)}`, undefined, opts);
  }

  create(params: CreateProductParams, opts?: RequestOptions): Promise<Product> {
    return this._client.post('/products', params, opts);
  }

  update(id: string, params: UpdateProductParams, opts?: RequestOptions): Promise<Product> {
    return this._client.patch(`/products/${enc(id)}`, params, opts);
  }

  del(id: string, opts?: RequestOptions): Promise<void> {
    return this._client.del(`/products/${enc(id)}`, opts);
  }

  search(query: string, params?: Omit<ProductListParams, 'q'>, opts?: RequestOptions): Promise<Page<Product>> {
    return this._client.getPage('/products', { q: query, ...params } as Record<string, string | number | boolean | undefined>, opts);
  }
}
