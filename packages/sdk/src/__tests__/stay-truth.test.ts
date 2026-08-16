import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpClient } from '../client.js';
import { Stays } from '../resources/stay.js';
import { STAY_RUNTIME_MANIFEST, stayManifestEntry } from '../resources/stay.manifest.js';
import {
  CapabilityUnavailableError,
  FrihetError,
  APIError,
  NotFoundError,
  ValidationError,
} from '../error.js';

// --- Mock fetch (same pattern as resources.test.ts) ---

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : `Error ${status}`,
    headers: new Headers(headers),
    json: () => Promise.resolve(data),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  };
}

function errorResponse(status: number, error: string, message?: string) {
  return {
    ok: false,
    status,
    statusText: `Error ${status}`,
    headers: new Headers(),
    json: () => Promise.resolve({ error, message: message ?? error }),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  };
}

/** Minimal invocation of every Stays method (valid args; unavailable methods reject before touching them). */
const INVOKERS: Record<string, (stays: Stays) => Promise<unknown>> = {
  list: s => s.list(),
  retrieve: s => s.retrieve('stay_1'),
  create: s => s.create({ name: 'Villa Sol' }),
  update: s => s.update('stay_1', { name: 'Villa Luna' }),
  del: s => s.del('stay_1'),
  search: s => s.search('villa'),
  listProperties: s => s.listProperties(),
  retrieveProperty: s => s.retrieveProperty('prop_1'),
  createProperty: s => s.createProperty({ name: 'Apt Centro', type: 'apartment' }),
  updateProperty: s => s.updateProperty('prop_1', { name: 'Apt Norte' }),
  deleteProperty: s => s.deleteProperty('prop_1'),
  listReservations: s => s.listReservations(),
  retrieveReservation: s => s.retrieveReservation('res_1'),
  createReservation: s => s.createReservation({
    propertyId: 'prop_1', guestName: 'Ana', checkIn: '2026-09-01', checkOut: '2026-09-05', adults: 2,
  }),
  updateReservation: s => s.updateReservation('res_1', { guestName: 'Ana B' }),
  deleteReservation: s => s.deleteReservation('res_1'),
  listExpenses: s => s.listExpenses(),
  retrieveExpense: s => s.retrieveExpense('exp_1'),
  createExpense: s => s.createExpense({ description: 'Limpieza', amount: 50 }),
  updateExpense: s => s.updateExpense('exp_1', { amount: 60 }),
  deleteExpense: s => s.deleteExpense('exp_1'),
  listCleaningTasks: s => s.listCleaningTasks(),
  retrieveCleaningTask: s => s.retrieveCleaningTask('ct_1'),
  createCleaningTask: s => s.createCleaningTask({ propertyId: 'prop_1', scheduledDate: '2026-09-06' }),
  updateCleaningTask: s => s.updateCleaningTask('ct_1', { status: 'done' }),
  deleteCleaningTask: s => s.deleteCleaningTask('ct_1'),
  listSettlements: s => s.listSettlements(),
  retrieveSettlement: s => s.retrieveSettlement('set_1'),
  createSettlement: s => s.createSettlement({ propertyId: 'prop_1', periodFrom: '2026-08-01', periodTo: '2026-08-31' }),
  updateSettlement: s => s.updateSettlement('set_1', { status: 'confirmed' }),
  deleteSettlement: s => s.deleteSettlement('set_1'),
  listCompliance: s => s.listCompliance(),
  retrieveCompliance: s => s.retrieveCompliance('cmp_1'),
  createCompliance: s => s.createCompliance({ reservationId: 'res_1', propertyId: 'prop_1', reportType: 'ses' }),
  updateCompliance: s => s.updateCompliance('cmp_1', { status: 'submitted' }),
  deleteCompliance: s => s.deleteCompliance('cmp_1'),
};

function queryParamNames(url: string): string[] {
  return [...new URL(url).searchParams.keys()].sort();
}

describe('Stays runtime-truth gating (mocked fetch)', () => {
  let stays: Stays;

  beforeEach(() => {
    mockFetch.mockReset();
    stays = new Stays(new HttpClient({ apiKey: 'fri_test_123', baseUrl: 'https://test.api.frihet.io/v1' }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- Manifest integrity: it is the single source of truth ---

  it('manifest covers exactly the public methods of the Stays class', () => {
    const manifestMethods = STAY_RUNTIME_MANIFEST.map(e => e.method).sort();
    const classMethods = Object.getOwnPropertyNames(Stays.prototype)
      .filter(name => name !== 'constructor' && !name.startsWith('_'))
      .sort();
    expect(manifestMethods).toEqual(classMethods);
    expect(Object.keys(INVOKERS).sort()).toEqual(classMethods);
  });

  // --- Absent capabilities: fail closed, zero network dispatch ---

  const absentEntries = STAY_RUNTIME_MANIFEST.filter(e => e.status === 'absent');

  it.each(absentEntries.map(e => [e.method, e] as const))(
    '%s rejects with CapabilityUnavailableError (reason absent) and sends no HTTP request',
    async (method, entry) => {
      const error = await INVOKERS[entry.method]!(stays).catch(e => e) as CapabilityUnavailableError;

      expect(error).toBeInstanceOf(CapabilityUnavailableError);
      expect(error).toBeInstanceOf(FrihetError);
      expect(error).not.toBeInstanceOf(APIError);
      expect(error.reason).toBe('absent');
      expect(error.capability).toContain(`Stays.${method}`);
      expect(error.message).toMatch(/no such route/i);
      expect(mockFetch).not.toHaveBeenCalled();
    },
  );

  // --- Backend-registered but deliberately not implemented (501) ---

  it('createReservation rejects with reason not_implemented and sends no HTTP request', async () => {
    const error = await INVOKERS.createReservation!(stays).catch(e => e) as CapabilityUnavailableError;

    expect(error).toBeInstanceOf(CapabilityUnavailableError);
    expect(error.reason).toBe('not_implemented');
    expect(error.message).toMatch(/501/);
    expect(error.message).not.toMatch(/no such route/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('manifest marks createReservation as backend_unavailable', () => {
    expect(stayManifestEntry('createReservation').status).toBe('backend_unavailable');
  });

  // --- LIVE: listProperties ---

  it('listProperties sends GET /stay/properties with only q/isActive/limit/offset', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [{ id: 'prop_1' }], total: 1, limit: 10, offset: 5 }));

    const page = await stays.listProperties({ q: 'beach', isActive: true, limit: 10, offset: 5 });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(url).pathname).toBe('/v1/stay/properties');
    expect(opts.method).toBe('GET');
    expect(queryParamNames(url)).toEqual(['isActive', 'limit', 'offset', 'q']);
    expect(page.data[0]!.id).toBe('prop_1');
    expect(page.total).toBe(1);
  });

  it('listProperties with no params sends no query string', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], total: 0, limit: 20, offset: 0 }));

    await stays.listProperties();

    const [url] = mockFetch.mock.calls[0]!;
    expect(queryParamNames(url)).toEqual([]);
  });

  it('listProperties rejects a defined "type" param and sends no HTTP request', async () => {
    const error = await stays.listProperties({ type: 'villa' }).catch(e => e) as CapabilityUnavailableError;

    expect(error).toBeInstanceOf(CapabilityUnavailableError);
    expect(error.reason).toBe('absent');
    expect(error.capability).toContain('"type"');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // --- LIVE: listReservations ---

  it('listReservations sends GET /stay/reservations with only the canonical params', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [{ id: 'res_1' }], total: 1, limit: 5, offset: 0 }));

    const page = await stays.listReservations({
      propertyId: 'prop_1',
      status: 'confirmed',
      checkInFrom: '2026-09-01',
      checkInTo: '2026-09-30',
      limit: 5,
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(url).pathname).toBe('/v1/stay/reservations');
    expect(opts.method).toBe('GET');
    expect(queryParamNames(url)).toEqual(['checkInFrom', 'checkInTo', 'limit', 'propertyId', 'status']);
    expect(page.data[0]!.id).toBe('res_1');
  });

  it('listReservations maps deprecated from/to aliases to checkInFrom/checkInTo', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], total: 0, limit: 20, offset: 0 }));

    await stays.listReservations({ from: '2026-09-01', to: '2026-09-30' });

    const [url] = mockFetch.mock.calls[0]!;
    const params = new URL(url).searchParams;
    expect(params.get('checkInFrom')).toBe('2026-09-01');
    expect(params.get('checkInTo')).toBe('2026-09-30');
    expect(params.has('from')).toBe(false);
    expect(params.has('to')).toBe(false);
  });

  it('listReservations throws ValidationError when alias and canonical param are both set', async () => {
    await expect(stays.listReservations({ from: '2026-09-01', checkInFrom: '2026-09-01' }))
      .rejects.toThrow(ValidationError);
    await expect(stays.listReservations({ to: '2026-09-30', checkInTo: '2026-09-30' }))
      .rejects.toThrow(ValidationError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each(['q', 'channel'] as const)(
    'listReservations rejects a defined "%s" param and sends no HTTP request',
    async (param) => {
      const error = await stays.listReservations({ [param]: 'x' }).catch(e => e) as CapabilityUnavailableError;

      expect(error).toBeInstanceOf(CapabilityUnavailableError);
      expect(error.reason).toBe('absent');
      expect(error.capability).toContain(`"${param}"`);
      expect(mockFetch).not.toHaveBeenCalled();
    },
  );

  // --- LIVE: retrieveReservation response contract ---

  it('retrieveReservation sends GET /stay/reservations/:id and unwraps the {data} envelope', async () => {
    const reservation = { id: 'res_42', propertyId: 'prop_1', guestName: 'Ana', status: 'confirmed' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: reservation }));

    const result = await stays.retrieveReservation('res_42');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(url).pathname).toBe('/v1/stay/reservations/res_42');
    expect(opts.method).toBe('GET');
    expect(result).toEqual(reservation);
  });

  it('retrieveReservation surfaces a 404 as NotFoundError', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(404, 'not_found', 'Reservation not found'));

    await expect(stays.retrieveReservation('res_missing')).rejects.toThrow(NotFoundError);
  });
});
