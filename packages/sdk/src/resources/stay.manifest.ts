/**
 * Stay runtime-truth manifest — single source of truth for which Stays
 * methods the Frihet backend actually serves.
 *
 * Verified against the ERP runtime: Frihet-ERP origin/main
 * 0edc7c73013ea0fd87088b2c216408c1eb5aeb0a, path
 * functions/src/publicApi/families/stay.ts (verified byte-identical at that
 * SHA). The Stays resource class derives its fail-closed behavior
 * from this table, and the test suite iterates over it, so regenerating
 * phantom CRUD from an app-kit scaffold without updating this manifest turns
 * the tests red.
 *
 * Statuses:
 * - 'live': the runtime route exists and is served.
 * - 'backend_unavailable': the route is registered but deliberately returns
 *   501 NOT_IMPLEMENTED; the SDK fails locally with reason 'not_implemented'.
 * - 'absent': no runtime route exists (404/405); the SDK fails locally with
 *   reason 'absent' before any HTTP request.
 */
export type StayCapabilityStatus = 'live' | 'backend_unavailable' | 'absent';

export interface StayManifestEntry {
  /** Public method name on the Stays class. */
  method: string;
  verb: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Path template relative to the API base URL (without the /v1 prefix). */
  path: string;
  status: StayCapabilityStatus;
  /**
   * For 'live' list routes: the exact query param names the runtime accepts.
   * The SDK allowlists outgoing params against this list.
   */
  queryParams?: readonly string[];
}

export const STAY_RUNTIME_MANIFEST: readonly StayManifestEntry[] = [
  // ---- Stay (top-level) — no runtime routes exist ----
  { method: 'list', verb: 'GET', path: '/stay', status: 'absent' },
  { method: 'retrieve', verb: 'GET', path: '/stay/:id', status: 'absent' },
  { method: 'create', verb: 'POST', path: '/stay', status: 'absent' },
  { method: 'update', verb: 'PATCH', path: '/stay/:id', status: 'absent' },
  { method: 'del', verb: 'DELETE', path: '/stay/:id', status: 'absent' },
  { method: 'search', verb: 'GET', path: '/stay', status: 'absent' },

  // ---- Properties ----
  {
    method: 'listProperties',
    verb: 'GET',
    path: '/stay/properties',
    status: 'live',
    queryParams: ['q', 'isActive', 'limit', 'offset'],
  },
  { method: 'retrieveProperty', verb: 'GET', path: '/stay/properties/:id', status: 'absent' },
  { method: 'createProperty', verb: 'POST', path: '/stay/properties', status: 'absent' },
  { method: 'updateProperty', verb: 'PATCH', path: '/stay/properties/:id', status: 'absent' },
  { method: 'deleteProperty', verb: 'DELETE', path: '/stay/properties/:id', status: 'absent' },

  // ---- Reservations ----
  {
    method: 'listReservations',
    verb: 'GET',
    path: '/stay/reservations',
    status: 'live',
    queryParams: ['propertyId', 'status', 'checkInFrom', 'checkInTo', 'limit', 'offset'],
  },
  { method: 'retrieveReservation', verb: 'GET', path: '/stay/reservations/:id', status: 'live' },
  { method: 'createReservation', verb: 'POST', path: '/stay/reservations', status: 'backend_unavailable' },
  { method: 'updateReservation', verb: 'PATCH', path: '/stay/reservations/:id', status: 'absent' },
  { method: 'deleteReservation', verb: 'DELETE', path: '/stay/reservations/:id', status: 'absent' },

  // ---- Expenses — no runtime routes exist ----
  { method: 'listExpenses', verb: 'GET', path: '/stay/expenses', status: 'absent' },
  { method: 'retrieveExpense', verb: 'GET', path: '/stay/expenses/:id', status: 'absent' },
  { method: 'createExpense', verb: 'POST', path: '/stay/expenses', status: 'absent' },
  { method: 'updateExpense', verb: 'PATCH', path: '/stay/expenses/:id', status: 'absent' },
  { method: 'deleteExpense', verb: 'DELETE', path: '/stay/expenses/:id', status: 'absent' },

  // ---- Cleaning Tasks — no runtime routes exist ----
  { method: 'listCleaningTasks', verb: 'GET', path: '/stay/cleaning-tasks', status: 'absent' },
  { method: 'retrieveCleaningTask', verb: 'GET', path: '/stay/cleaning-tasks/:id', status: 'absent' },
  { method: 'createCleaningTask', verb: 'POST', path: '/stay/cleaning-tasks', status: 'absent' },
  { method: 'updateCleaningTask', verb: 'PATCH', path: '/stay/cleaning-tasks/:id', status: 'absent' },
  { method: 'deleteCleaningTask', verb: 'DELETE', path: '/stay/cleaning-tasks/:id', status: 'absent' },

  // ---- Settlements — no runtime routes exist ----
  { method: 'listSettlements', verb: 'GET', path: '/stay/settlements', status: 'absent' },
  { method: 'retrieveSettlement', verb: 'GET', path: '/stay/settlements/:id', status: 'absent' },
  { method: 'createSettlement', verb: 'POST', path: '/stay/settlements', status: 'absent' },
  { method: 'updateSettlement', verb: 'PATCH', path: '/stay/settlements/:id', status: 'absent' },
  { method: 'deleteSettlement', verb: 'DELETE', path: '/stay/settlements/:id', status: 'absent' },

  // ---- Compliance — no runtime routes exist ----
  { method: 'listCompliance', verb: 'GET', path: '/stay/compliance', status: 'absent' },
  { method: 'retrieveCompliance', verb: 'GET', path: '/stay/compliance/:id', status: 'absent' },
  { method: 'createCompliance', verb: 'POST', path: '/stay/compliance', status: 'absent' },
  { method: 'updateCompliance', verb: 'PATCH', path: '/stay/compliance/:id', status: 'absent' },
  { method: 'deleteCompliance', verb: 'DELETE', path: '/stay/compliance/:id', status: 'absent' },
];

const MANIFEST_BY_METHOD: ReadonlyMap<string, StayManifestEntry> = new Map(
  STAY_RUNTIME_MANIFEST.map(entry => [entry.method, entry]),
);

/** Look up the manifest entry for a Stays method. Throws if the method is not in the manifest. */
export function stayManifestEntry(method: string): StayManifestEntry {
  const entry = MANIFEST_BY_METHOD.get(method);
  if (!entry) {
    throw new Error(`stay.manifest: no manifest entry for Stays.${method} — manifest is incomplete`);
  }
  return entry;
}
