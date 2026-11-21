import type { HttpClient } from '../client.js';
import type {
  KitchenStation,
  KitchenStationListParams,
  KitchenMenuItem,
  KitchenMenuItemListParams,
  KitchenTicket,
  KitchenTicketListParams,
  UpdateKitchenTicketParams,
  Page,
  RequestOptions,
} from '../types.js';

const enc = encodeURIComponent;

/**
 * Kitchen Display System (KDS) REST resource (`/v1/kitchen/*`).
 *
 * Mirrors the exact live routes served by `functions/src/publicApi/families/kitchen.ts`:
 *  - `GET   /v1/kitchen/stations`
 *  - `GET   /v1/kitchen/menu-items`
 *  - `GET   /v1/kitchen/tickets`
 *  - `GET   /v1/kitchen/tickets/:id`
 *  - `PATCH /v1/kitchen/tickets/:id`
 */
export class Kitchen {
  constructor(private readonly _client: HttpClient) {}

  /** List kitchen stations ordered by `sortOrder` ascending (`GET /v1/kitchen/stations`). */
  listStations(
    params?: KitchenStationListParams,
    opts?: RequestOptions,
  ): Promise<Page<KitchenStation>> {
    return this._client.getPage(
      '/kitchen/stations',
      params as Record<string, string | number | boolean | undefined>,
      opts,
    );
  }

  /** List kitchen menu items with optional `q` and `isActive` filters (`GET /v1/kitchen/menu-items`). */
  listMenuItems(
    params?: KitchenMenuItemListParams,
    opts?: RequestOptions,
  ): Promise<Page<KitchenMenuItem>> {
    return this._client.getPage(
      '/kitchen/menu-items',
      params as Record<string, string | number | boolean | undefined>,
      opts,
    );
  }

  /** List kitchen tickets with optional `status` and `stationId` filters (`GET /v1/kitchen/tickets`). */
  listTickets(
    params?: KitchenTicketListParams,
    opts?: RequestOptions,
  ): Promise<Page<KitchenTicket>> {
    return this._client.getPage(
      '/kitchen/tickets',
      params as Record<string, string | number | boolean | undefined>,
      opts,
    );
  }

  /** Retrieve a single kitchen ticket (`GET /v1/kitchen/tickets/:id`). */
  retrieveTicket(id: string, opts?: RequestOptions): Promise<KitchenTicket> {
    return this._client.get(`/kitchen/tickets/${enc(id)}`, undefined, opts);
  }

  /** Update KDS-mutable fields on a kitchen ticket (`PATCH /v1/kitchen/tickets/:id`). */
  updateTicket(
    id: string,
    params: UpdateKitchenTicketParams,
    opts?: RequestOptions,
  ): Promise<KitchenTicket> {
    return this._client.patch(`/kitchen/tickets/${enc(id)}`, params, opts);
  }
}
