/**
 * Wave-2 CLI command tests — banking, fiscal, and search commands.
 *
 * Exercises the Commander command definitions against a stubbed fetch so we
 * verify the exact REST routes, query parameters, --json output contract, and
 * human-readable formatting without hitting the network.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bankingCommand } from '../commands/banking.js';
import { fiscalCommand } from '../commands/fiscal.js';
import { searchCommand } from '../commands/search.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    headers: new Headers(),
    json: () => Promise.resolve(data),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  };
}

let savedArgv: string[];
let savedApiKey: string | undefined;
let savedBaseUrl: string | undefined;

beforeEach(() => {
  mockFetch.mockReset();
  savedArgv = [...process.argv];
  savedApiKey = process.env['FRIHET_API_KEY'];
  savedBaseUrl = process.env['FRIHET_API_URL'];
  process.env['FRIHET_API_KEY'] = 'fri_cli_test_key';
  process.env['FRIHET_API_URL'] = 'https://test.api.frihet.io/v1';
});

afterEach(() => {
  process.argv = savedArgv;
  if (savedApiKey === undefined) delete process.env['FRIHET_API_KEY'];
  else process.env['FRIHET_API_KEY'] = savedApiKey;
  if (savedBaseUrl === undefined) delete process.env['FRIHET_API_URL'];
  else process.env['FRIHET_API_URL'] = savedBaseUrl;
  vi.restoreAllMocks();
});

describe('CLI command contract — --json declared on Wave-2 commands', () => {
  it('declares --json on banking accounts/transactions, fiscal status subcommands, and search', () => {
    for (const sub of bankingCommand.commands) {
      expect(sub.options.some(o => o.long === '--json'), `banking ${sub.name()}`).toBe(true);
    }
    expect(bankingCommand.commands.map(c => c.name())).toEqual(['accounts', 'transactions']);

    for (const sub of fiscalCommand.commands) {
      expect(sub.options.some(o => o.long === '--json'), `fiscal ${sub.name()}`).toBe(true);
    }
    expect(fiscalCommand.commands.map(c => c.name())).toEqual([
      'verifactu-status',
      'face-status',
      'ticketbai-status',
    ]);

    expect(searchCommand.options.some(o => o.long === '--json')).toBe(true);
  });
});

describe('frihet banking', () => {
  it('banking accounts --json calls GET /v1/banking/accounts and emits JSON', async () => {
    const payload = {
      data: [
        {
          id: 'acc_1',
          provider: 'saltedge',
          bankName: 'BBVA',
          accountName: 'Operating EUR',
          accountNumber: '1234',
          iban: 'ES91****1234',
          currency: 'EUR',
          isActive: true,
          lastSyncAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 1,
      limit: 10,
      offset: 0,
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(payload));
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.map(String).join(' ')));

    process.argv = ['node', 'frihet', 'banking', 'accounts', '--provider', 'saltedge', '--active', '--limit', '10', '--json'];
    await bankingCommand.parseAsync(['accounts', '--provider', 'saltedge', '--active', '--limit', '10', '--json'], { from: 'user' });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    const url = new URL(rawUrl);
    expect(url.pathname).toBe('/v1/banking/accounts');
    expect(url.searchParams.get('provider')).toBe('saltedge');
    expect(url.searchParams.get('isActive')).toBe('true');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(opts.method).toBe('GET');
    expect(JSON.parse(logs[0]!)).toEqual(payload);
  });

  it('banking transactions calls GET /v1/banking/transactions with filters', async () => {
    const payload = {
      data: [
        {
          id: 'tx_1',
          date: '2026-11-15',
          description: 'AWS EMEA',
          amount: -49.99,
          category: 'hosting',
          status: 'categorized',
        },
      ],
      total: 1,
      limit: 5,
      offset: 0,
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(payload));
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.map(String).join(' ')));

    process.argv = ['node', 'frihet', 'banking', 'transactions', '--account', 'acc_1', '--reconciled', 'false', '--limit', '5'];
    await bankingCommand.parseAsync(['transactions', '--account', 'acc_1', '--reconciled', 'false', '--limit', '5'], { from: 'user' });

    const [rawUrl] = mockFetch.mock.calls[0]!;
    const url = new URL(rawUrl);
    expect(url.pathname).toBe('/v1/banking/transactions');
    expect(url.searchParams.get('accountId')).toBe('acc_1');
    expect(url.searchParams.get('reconciled')).toBe('false');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(logs.join('\n')).toContain('AWS EMEA');
  });
});

describe('frihet fiscal', () => {
  it('fiscal verifactu-status <id> --json calls GET /v1/fiscal/verifactu/:id/status', async () => {
    const payload = {
      invoiceId: 'inv_10',
      status: 'accepted',
      accepted: true,
      csv: 'VF-CSV-001',
      submittedAt: '2026-11-21T10:00:00.000Z',
      retryCount: 0,
      lastError: null,
      sandbox: false,
      aeatWarnings: [],
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: payload }));
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.map(String).join(' ')));

    process.argv = ['node', 'frihet', 'fiscal', 'verifactu-status', 'inv_10', '--json'];
    await fiscalCommand.parseAsync(['verifactu-status', 'inv_10', '--json'], { from: 'user' });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/fiscal/verifactu/inv_10/status');
    expect(opts.method).toBe('GET');
    expect(JSON.parse(logs[0]!)).toEqual(payload);
  });

  it('fiscal face-status <id> calls GET /v1/invoices/:id/face/status', async () => {
    const payload = {
      numeroRegistro: 'REG/2026/001',
      estadoTramitacion: '1200',
      codigo: '1200',
      descripcion: 'Registrada',
      motivo: null,
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: payload }));
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.map(String).join(' ')));

    process.argv = ['node', 'frihet', 'fiscal', 'face-status', 'inv_10'];
    await fiscalCommand.parseAsync(['face-status', 'inv_10'], { from: 'user' });

    const [rawUrl] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/invoices/inv_10/face/status');
    expect(logs.join('\n')).toContain('REG/2026/001');
  });

  it('fiscal ticketbai-status <id> --json calls GET /v1/invoices/:id/ticketbai/status', async () => {
    const payload = {
      accepted: true,
      csv: 'TBAI-48-001',
      tbaiIdentifier: 'TBAI-B-001',
      estado: 'accepted',
      qrUrl: 'https://batuz.eus/QRTBAI/?id=TBAI-B-001',
      submittedAt: '2026-11-21T10:00:00.000Z',
      errors: null,
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: payload }));
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.map(String).join(' ')));

    process.argv = ['node', 'frihet', 'fiscal', 'ticketbai-status', 'inv_10', '--json'];
    await fiscalCommand.parseAsync(['ticketbai-status', 'inv_10', '--json'], { from: 'user' });

    const [rawUrl] = mockFetch.mock.calls[0]!;
    expect(new URL(rawUrl).pathname).toBe('/v1/invoices/inv_10/ticketbai/status');
    expect(JSON.parse(logs[0]!)).toEqual(payload);
  });
});

describe('frihet search', () => {
  it('search <query> --types ... --json calls GET /v1/search/global', async () => {
    const payload = {
      data: [
        {
          type: 'invoices',
          id: 'inv_1',
          label: 'F2026-001',
          secondary: 'Acme SL',
          date: '2026-11-01',
          amount: 1210,
          status: 'sent',
        },
      ],
      total: 1,
      limit: 10,
      offset: 0,
      hasMore: false,
      query: 'Acme',
      types: ['invoices', 'clients'],
      truncated: false,
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(payload));
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.map(String).join(' ')));

    process.argv = ['node', 'frihet', 'search', 'Acme', '--types', 'invoices,clients', '--limit', '10', '--json'];
    await searchCommand.parseAsync(['Acme', '--types', 'invoices,clients', '--limit', '10', '--json'], { from: 'user' });

    const [rawUrl, opts] = mockFetch.mock.calls[0]!;
    const url = new URL(rawUrl);
    expect(url.pathname).toBe('/v1/search/global');
    expect(url.searchParams.get('q')).toBe('Acme');
    expect(url.searchParams.get('types')).toBe('invoices,clients');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(opts.method).toBe('GET');
    expect(JSON.parse(logs[0]!)).toEqual(payload);
  });
});
