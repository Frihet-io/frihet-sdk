/**
 * Stay (Hospitality) resource — Phase 4 app-kit G6 scaffold
 *
 * Generated via @frihet/app-kit generateSdkResourceFile('stay').
 * Exposes typed CRUD for the Stay domain and its sub-resources:
 *   properties, reservations, expenses, cleaning_tasks, settlements, compliance.
 */
import type { HttpClient } from '../client.js';
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

export class Stays {
  constructor(private _client: HttpClient) {}

  // ---- Stay (top-level) ----

  list(params?: StayListParams, opts?: RequestOptions): Promise<Page<Stay>> {
    return this._client.getPage('/stay', params as Record<string, string | number | boolean | undefined>, opts);
  }

  retrieve(id: string, opts?: RequestOptions): Promise<Stay> {
    return this._client.get(`/stay/${enc(id)}`, undefined, opts);
  }

  create(params: CreateStayParams, opts?: RequestOptions): Promise<Stay> {
    return this._client.post('/stay', params, opts);
  }

  update(id: string, params: UpdateStayParams, opts?: RequestOptions): Promise<Stay> {
    return this._client.patch(`/stay/${enc(id)}`, params, opts);
  }

  del(id: string, opts?: RequestOptions): Promise<void> {
    return this._client.del(`/stay/${enc(id)}`, opts);
  }

  search(query: string, params?: Omit<StayListParams, 'q'>, opts?: RequestOptions): Promise<Page<Stay>> {
    return this._client.getPage('/stay', { q: query, ...params } as Record<string, string | number | boolean | undefined>, opts);
  }

  // ---- Properties ----

  listProperties(params?: StayPropertyListParams, opts?: RequestOptions): Promise<Page<StayProperty>> {
    return this._client.getPage('/stay/properties', params as Record<string, string | number | boolean | undefined>, opts);
  }

  retrieveProperty(id: string, opts?: RequestOptions): Promise<StayProperty> {
    return this._client.get(`/stay/properties/${enc(id)}`, undefined, opts);
  }

  createProperty(params: CreateStayPropertyParams, opts?: RequestOptions): Promise<StayProperty> {
    return this._client.post('/stay/properties', params, opts);
  }

  updateProperty(id: string, params: UpdateStayPropertyParams, opts?: RequestOptions): Promise<StayProperty> {
    return this._client.patch(`/stay/properties/${enc(id)}`, params, opts);
  }

  deleteProperty(id: string, opts?: RequestOptions): Promise<void> {
    return this._client.del(`/stay/properties/${enc(id)}`, opts);
  }

  // ---- Reservations ----

  listReservations(params?: StayReservationListParams, opts?: RequestOptions): Promise<Page<StayReservation>> {
    return this._client.getPage('/stay/reservations', params as Record<string, string | number | boolean | undefined>, opts);
  }

  retrieveReservation(id: string, opts?: RequestOptions): Promise<StayReservation> {
    return this._client.get(`/stay/reservations/${enc(id)}`, undefined, opts);
  }

  createReservation(params: CreateStayReservationParams, opts?: RequestOptions): Promise<StayReservation> {
    return this._client.post('/stay/reservations', params, opts);
  }

  updateReservation(id: string, params: UpdateStayReservationParams, opts?: RequestOptions): Promise<StayReservation> {
    return this._client.patch(`/stay/reservations/${enc(id)}`, params, opts);
  }

  deleteReservation(id: string, opts?: RequestOptions): Promise<void> {
    return this._client.del(`/stay/reservations/${enc(id)}`, opts);
  }

  // ---- Expenses ----

  listExpenses(params?: StayExpenseListParams, opts?: RequestOptions): Promise<Page<StayExpense>> {
    return this._client.getPage('/stay/expenses', params as Record<string, string | number | boolean | undefined>, opts);
  }

  retrieveExpense(id: string, opts?: RequestOptions): Promise<StayExpense> {
    return this._client.get(`/stay/expenses/${enc(id)}`, undefined, opts);
  }

  createExpense(params: CreateStayExpenseParams, opts?: RequestOptions): Promise<StayExpense> {
    return this._client.post('/stay/expenses', params, opts);
  }

  updateExpense(id: string, params: UpdateStayExpenseParams, opts?: RequestOptions): Promise<StayExpense> {
    return this._client.patch(`/stay/expenses/${enc(id)}`, params, opts);
  }

  deleteExpense(id: string, opts?: RequestOptions): Promise<void> {
    return this._client.del(`/stay/expenses/${enc(id)}`, opts);
  }

  // ---- Cleaning Tasks ----

  listCleaningTasks(params?: StayCleaningTaskListParams, opts?: RequestOptions): Promise<Page<StayCleaningTask>> {
    return this._client.getPage('/stay/cleaning-tasks', params as Record<string, string | number | boolean | undefined>, opts);
  }

  retrieveCleaningTask(id: string, opts?: RequestOptions): Promise<StayCleaningTask> {
    return this._client.get(`/stay/cleaning-tasks/${enc(id)}`, undefined, opts);
  }

  createCleaningTask(params: CreateStayCleaningTaskParams, opts?: RequestOptions): Promise<StayCleaningTask> {
    return this._client.post('/stay/cleaning-tasks', params, opts);
  }

  updateCleaningTask(id: string, params: UpdateStayCleaningTaskParams, opts?: RequestOptions): Promise<StayCleaningTask> {
    return this._client.patch(`/stay/cleaning-tasks/${enc(id)}`, params, opts);
  }

  deleteCleaningTask(id: string, opts?: RequestOptions): Promise<void> {
    return this._client.del(`/stay/cleaning-tasks/${enc(id)}`, opts);
  }

  // ---- Settlements ----

  listSettlements(params?: StaySettlementListParams, opts?: RequestOptions): Promise<Page<StaySettlement>> {
    return this._client.getPage('/stay/settlements', params as Record<string, string | number | boolean | undefined>, opts);
  }

  retrieveSettlement(id: string, opts?: RequestOptions): Promise<StaySettlement> {
    return this._client.get(`/stay/settlements/${enc(id)}`, undefined, opts);
  }

  createSettlement(params: CreateStaySettlementParams, opts?: RequestOptions): Promise<StaySettlement> {
    return this._client.post('/stay/settlements', params, opts);
  }

  updateSettlement(id: string, params: UpdateStaySettlementParams, opts?: RequestOptions): Promise<StaySettlement> {
    return this._client.patch(`/stay/settlements/${enc(id)}`, params, opts);
  }

  deleteSettlement(id: string, opts?: RequestOptions): Promise<void> {
    return this._client.del(`/stay/settlements/${enc(id)}`, opts);
  }

  // ---- Compliance (SES / Alloggiati / police reports) ----

  listCompliance(params?: StayComplianceListParams, opts?: RequestOptions): Promise<Page<StayCompliance>> {
    return this._client.getPage('/stay/compliance', params as Record<string, string | number | boolean | undefined>, opts);
  }

  retrieveCompliance(id: string, opts?: RequestOptions): Promise<StayCompliance> {
    return this._client.get(`/stay/compliance/${enc(id)}`, undefined, opts);
  }

  createCompliance(params: CreateStayComplianceParams, opts?: RequestOptions): Promise<StayCompliance> {
    return this._client.post('/stay/compliance', params, opts);
  }

  updateCompliance(id: string, params: UpdateStayComplianceParams, opts?: RequestOptions): Promise<StayCompliance> {
    return this._client.patch(`/stay/compliance/${enc(id)}`, params, opts);
  }

  deleteCompliance(id: string, opts?: RequestOptions): Promise<void> {
    return this._client.del(`/stay/compliance/${enc(id)}`, opts);
  }
}
