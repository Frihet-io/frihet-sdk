/**
 * Stay (Hospitality) resource — runtime-truth gated.
 *
 * The Frihet runtime (functions/src/publicApi/families/stay.ts) currently
 * serves only three stay routes: GET /stay/properties, GET /stay/reservations,
 * and GET /stay/reservations/:id. POST /stay/reservations is registered but
 * deliberately 501 NOT_IMPLEMENTED; every other route this class historically
 * exposed does not exist at all.
 *
 * All behavior here is derived from ./stay.manifest.ts (the runtime-truth
 * manifest): unavailable methods fail closed with CapabilityUnavailableError
 * BEFORE any HTTP request, and live list methods allowlist outgoing query
 * params against the exact set the runtime accepts. Method names and
 * signatures are unchanged for source compatibility.
 */
import type { HttpClient } from '../client.js';
import { CapabilityUnavailableError, ValidationError } from '../error.js';
import { stayManifestEntry, type StayManifestEntry } from './stay.manifest.js';
import type {
  Stay,
  CreateStayParams,
  UpdateStayParams,
  StayListParams,
  StayProperty,
  CreateStayPropertyParams,
  UpdateStayPropertyParams,
  StayPropertyListParams,
  StayReservation,
  CreateStayReservationParams,
  UpdateStayReservationParams,
  StayReservationListParams,
  StayExpense,
  CreateStayExpenseParams,
  UpdateStayExpenseParams,
  StayExpenseListParams,
  StayCleaningTask,
  CreateStayCleaningTaskParams,
  UpdateStayCleaningTaskParams,
  StayCleaningTaskListParams,
  StaySettlement,
  CreateStaySettlementParams,
  UpdateStaySettlementParams,
  StaySettlementListParams,
  StayCompliance,
  CreateStayComplianceParams,
  UpdateStayComplianceParams,
  StayComplianceListParams,
  Page,
  RequestOptions,
} from '../types.js';

const enc = encodeURIComponent;

type Query = Record<string, string | number | boolean | undefined>;

function capabilityError(entry: StayManifestEntry): CapabilityUnavailableError {
  return new CapabilityUnavailableError(
    `Stays.${entry.method} (${entry.verb} ${entry.path})`,
    entry.status === 'backend_unavailable' ? 'not_implemented' : 'absent',
  );
}

/** Manifest-driven failure for methods the runtime does not serve. */
function unavailable<T>(method: string): Promise<T> {
  return Promise.reject(capabilityError(stayManifestEntry(method)));
}

function unsupportedParam(method: string, param: string): CapabilityUnavailableError {
  return new CapabilityUnavailableError(
    `Stays.${method} query param "${param}"`,
    'absent',
    'The runtime does not support this filter; it is not sent silently.',
  );
}

/**
 * Return the manifest entry for a live method, or a rejected promise when the
 * manifest no longer marks it live (fail closed, never dispatch blindly).
 */
function liveEntry(method: string): StayManifestEntry | Promise<never> {
  const entry = stayManifestEntry(method);
  return entry.status === 'live' ? entry : Promise.reject(capabilityError(entry));
}

/** Keep only the query params the runtime route actually accepts. */
function allowlistQuery(entry: StayManifestEntry, params: Record<string, unknown>): Query {
  const allowed = new Set(entry.queryParams ?? []);
  const query: Query = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && allowed.has(key)) {
      query[key] = value as string | number | boolean;
    }
  }
  return query;
}

export class Stays {
  constructor(private _client: HttpClient) {}

  // ---- Stay (top-level) — absent from the runtime ----

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  list(params?: StayListParams, opts?: RequestOptions): Promise<Page<Stay>> {
    void params; void opts;
    return unavailable<Page<Stay>>('list');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  retrieve(id: string, opts?: RequestOptions): Promise<Stay> {
    void id; void opts;
    return unavailable<Stay>('retrieve');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  create(params: CreateStayParams, opts?: RequestOptions): Promise<Stay> {
    void params; void opts;
    return unavailable<Stay>('create');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  update(id: string, params: UpdateStayParams, opts?: RequestOptions): Promise<Stay> {
    void id; void params; void opts;
    return unavailable<Stay>('update');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  del(id: string, opts?: RequestOptions): Promise<void> {
    void id; void opts;
    return unavailable<void>('del');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  search(query: string, params?: Omit<StayListParams, 'q'>, opts?: RequestOptions): Promise<Page<Stay>> {
    void query; void params; void opts;
    return unavailable<Page<Stay>>('search');
  }

  // ---- Properties ----

  /**
   * List stay properties. LIVE runtime route: GET /stay/properties.
   * Supported filters: q, isActive, limit, offset (allowlisted per the
   * runtime-truth manifest). `type` has no runtime equivalent: passing a
   * defined value fails locally with CapabilityUnavailableError.
   */
  listProperties(params?: StayPropertyListParams, opts?: RequestOptions): Promise<Page<StayProperty>> {
    const entry = liveEntry('listProperties');
    if (entry instanceof Promise) return entry;
    const { type, ...rest } = params ?? {};
    if (type !== undefined) {
      return Promise.reject(unsupportedParam('listProperties', 'type'));
    }
    return this._client.getPage('/stay/properties', allowlistQuery(entry, rest), opts);
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  retrieveProperty(id: string, opts?: RequestOptions): Promise<StayProperty> {
    void id; void opts;
    return unavailable<StayProperty>('retrieveProperty');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  createProperty(params: CreateStayPropertyParams, opts?: RequestOptions): Promise<StayProperty> {
    void params; void opts;
    return unavailable<StayProperty>('createProperty');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  updateProperty(id: string, params: UpdateStayPropertyParams, opts?: RequestOptions): Promise<StayProperty> {
    void id; void params; void opts;
    return unavailable<StayProperty>('updateProperty');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  deleteProperty(id: string, opts?: RequestOptions): Promise<void> {
    void id; void opts;
    return unavailable<void>('deleteProperty');
  }

  // ---- Reservations ----

  /**
   * List stay reservations. LIVE runtime route: GET /stay/reservations.
   * Supported filters: propertyId, status, checkInFrom, checkInTo, limit,
   * offset (allowlisted per the runtime-truth manifest).
   *
   * Deprecated aliases `from`/`to` map deterministically to
   * checkInFrom/checkInTo (both filter on the reservation checkIn date);
   * setting both an alias and its canonical param throws ValidationError.
   * `q` and `channel` have no runtime equivalent: passing a defined value
   * fails locally with CapabilityUnavailableError.
   */
  listReservations(params?: StayReservationListParams, opts?: RequestOptions): Promise<Page<StayReservation>> {
    const entry = liveEntry('listReservations');
    if (entry instanceof Promise) return entry;
    const { q, channel, from, to, ...rest } = params ?? {};
    if (q !== undefined) {
      return Promise.reject(unsupportedParam('listReservations', 'q'));
    }
    if (channel !== undefined) {
      return Promise.reject(unsupportedParam('listReservations', 'channel'));
    }
    if (from !== undefined) {
      if (rest.checkInFrom !== undefined) {
        return Promise.reject(new ValidationError(
          'listReservations: ambiguous date filter — pass either "from" or "checkInFrom", not both',
        ));
      }
      rest.checkInFrom = from;
    }
    if (to !== undefined) {
      if (rest.checkInTo !== undefined) {
        return Promise.reject(new ValidationError(
          'listReservations: ambiguous date filter — pass either "to" or "checkInTo", not both',
        ));
      }
      rest.checkInTo = to;
    }
    return this._client.getPage('/stay/reservations', allowlistQuery(entry, rest), opts);
  }

  /** Retrieve a stay reservation. LIVE runtime route: GET /stay/reservations/:id. */
  retrieveReservation(id: string, opts?: RequestOptions): Promise<StayReservation> {
    const entry = liveEntry('retrieveReservation');
    if (entry instanceof Promise) return entry;
    return this._client.get(`/stay/reservations/${enc(id)}`, undefined, opts);
  }

  /**
   * @deprecated The backend registers POST /stay/reservations but deliberately
   * does not implement it (501 — reservation creation is deferred because of
   * compliance side effects). Fails locally with CapabilityUnavailableError
   * (reason 'not_implemented') before any HTTP request.
   */
  createReservation(params: CreateStayReservationParams, opts?: RequestOptions): Promise<StayReservation> {
    void params; void opts;
    return unavailable<StayReservation>('createReservation');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  updateReservation(id: string, params: UpdateStayReservationParams, opts?: RequestOptions): Promise<StayReservation> {
    void id; void params; void opts;
    return unavailable<StayReservation>('updateReservation');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  deleteReservation(id: string, opts?: RequestOptions): Promise<void> {
    void id; void opts;
    return unavailable<void>('deleteReservation');
  }

  // ---- Expenses — absent from the runtime ----

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  listExpenses(params?: StayExpenseListParams, opts?: RequestOptions): Promise<Page<StayExpense>> {
    void params; void opts;
    return unavailable<Page<StayExpense>>('listExpenses');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  retrieveExpense(id: string, opts?: RequestOptions): Promise<StayExpense> {
    void id; void opts;
    return unavailable<StayExpense>('retrieveExpense');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  createExpense(params: CreateStayExpenseParams, opts?: RequestOptions): Promise<StayExpense> {
    void params; void opts;
    return unavailable<StayExpense>('createExpense');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  updateExpense(id: string, params: UpdateStayExpenseParams, opts?: RequestOptions): Promise<StayExpense> {
    void id; void params; void opts;
    return unavailable<StayExpense>('updateExpense');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  deleteExpense(id: string, opts?: RequestOptions): Promise<void> {
    void id; void opts;
    return unavailable<void>('deleteExpense');
  }

  // ---- Cleaning Tasks — absent from the runtime ----

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  listCleaningTasks(params?: StayCleaningTaskListParams, opts?: RequestOptions): Promise<Page<StayCleaningTask>> {
    void params; void opts;
    return unavailable<Page<StayCleaningTask>>('listCleaningTasks');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  retrieveCleaningTask(id: string, opts?: RequestOptions): Promise<StayCleaningTask> {
    void id; void opts;
    return unavailable<StayCleaningTask>('retrieveCleaningTask');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  createCleaningTask(params: CreateStayCleaningTaskParams, opts?: RequestOptions): Promise<StayCleaningTask> {
    void params; void opts;
    return unavailable<StayCleaningTask>('createCleaningTask');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  updateCleaningTask(id: string, params: UpdateStayCleaningTaskParams, opts?: RequestOptions): Promise<StayCleaningTask> {
    void id; void params; void opts;
    return unavailable<StayCleaningTask>('updateCleaningTask');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  deleteCleaningTask(id: string, opts?: RequestOptions): Promise<void> {
    void id; void opts;
    return unavailable<void>('deleteCleaningTask');
  }

  // ---- Settlements — absent from the runtime ----

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  listSettlements(params?: StaySettlementListParams, opts?: RequestOptions): Promise<Page<StaySettlement>> {
    void params; void opts;
    return unavailable<Page<StaySettlement>>('listSettlements');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  retrieveSettlement(id: string, opts?: RequestOptions): Promise<StaySettlement> {
    void id; void opts;
    return unavailable<StaySettlement>('retrieveSettlement');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  createSettlement(params: CreateStaySettlementParams, opts?: RequestOptions): Promise<StaySettlement> {
    void params; void opts;
    return unavailable<StaySettlement>('createSettlement');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  updateSettlement(id: string, params: UpdateStaySettlementParams, opts?: RequestOptions): Promise<StaySettlement> {
    void id; void params; void opts;
    return unavailable<StaySettlement>('updateSettlement');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  deleteSettlement(id: string, opts?: RequestOptions): Promise<void> {
    void id; void opts;
    return unavailable<void>('deleteSettlement');
  }

  // ---- Compliance (SES / Alloggiati / police reports) — absent from the runtime ----

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  listCompliance(params?: StayComplianceListParams, opts?: RequestOptions): Promise<Page<StayCompliance>> {
    void params; void opts;
    return unavailable<Page<StayCompliance>>('listCompliance');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  retrieveCompliance(id: string, opts?: RequestOptions): Promise<StayCompliance> {
    void id; void opts;
    return unavailable<StayCompliance>('retrieveCompliance');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  createCompliance(params: CreateStayComplianceParams, opts?: RequestOptions): Promise<StayCompliance> {
    void params; void opts;
    return unavailable<StayCompliance>('createCompliance');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  updateCompliance(id: string, params: UpdateStayComplianceParams, opts?: RequestOptions): Promise<StayCompliance> {
    void id; void params; void opts;
    return unavailable<StayCompliance>('updateCompliance');
  }

  /**
   * @deprecated The Frihet backend does not provide this capability (no such
   * route exists); it fails locally with CapabilityUnavailableError before
   * any HTTP request.
   */
  deleteCompliance(id: string, opts?: RequestOptions): Promise<void> {
    void id; void opts;
    return unavailable<void>('deleteCompliance');
  }
}
