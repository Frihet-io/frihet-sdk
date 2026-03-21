import { describe, it, expect } from 'vitest';
import { Frihet } from '../index.js';
import { HttpClient } from '../client.js';
import {
  FrihetError,
  APIError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  TimeoutError,
} from '../error.js';
import { Invoices } from '../resources/invoices.js';
import { Expenses } from '../resources/expenses.js';
import { Clients } from '../resources/clients.js';
import { Products } from '../resources/products.js';
import { Quotes } from '../resources/quotes.js';
import { Vendors } from '../resources/vendors.js';
import { Webhooks } from '../resources/webhooks.js';
import { Intelligence } from '../resources/intelligence.js';

// --- HttpClient constructor ---

describe('HttpClient', () => {
  it('throws if apiKey is missing', () => {
    expect(() => new HttpClient({ apiKey: '' })).toThrow('apiKey is required');
  });

  it('throws if apiKey is undefined-ish', () => {
    // @ts-expect-error intentionally passing bad input
    expect(() => new HttpClient({})).toThrow('apiKey is required');
  });

  it('sets default base URL when none provided', () => {
    const c = new HttpClient({ apiKey: 'fri_test_123' });
    expect(c.baseUrl).toBe('https://api.frihet.io/v1');
  });

  it('uses custom base URL and strips trailing slashes', () => {
    const c = new HttpClient({ apiKey: 'fri_test_123', baseUrl: 'http://localhost:3000/v1///' });
    expect(c.baseUrl).toBe('http://localhost:3000/v1');
  });

  it('uses default timeout of 30 000 ms', () => {
    const c = new HttpClient({ apiKey: 'fri_test_123' });
    expect(c.timeout).toBe(30_000);
  });

  it('accepts custom timeout', () => {
    const c = new HttpClient({ apiKey: 'fri_test_123', timeout: 5_000 });
    expect(c.timeout).toBe(5_000);
  });

  it('stores the apiKey', () => {
    const c = new HttpClient({ apiKey: 'fri_test_123' });
    expect(c.apiKey).toBe('fri_test_123');
  });
});

// --- Frihet (main client) resource accessors ---

describe('Frihet', () => {
  const frihet = new Frihet({ apiKey: 'fri_test_123' });

  it('has invoices accessor', () => {
    expect(frihet.invoices).toBeInstanceOf(Invoices);
  });

  it('has expenses accessor', () => {
    expect(frihet.expenses).toBeInstanceOf(Expenses);
  });

  it('has clients accessor', () => {
    expect(frihet.clients).toBeInstanceOf(Clients);
  });

  it('has products accessor', () => {
    expect(frihet.products).toBeInstanceOf(Products);
  });

  it('has quotes accessor', () => {
    expect(frihet.quotes).toBeInstanceOf(Quotes);
  });

  it('has vendors accessor', () => {
    expect(frihet.vendors).toBeInstanceOf(Vendors);
  });

  it('has webhooks accessor', () => {
    expect(frihet.webhooks).toBeInstanceOf(Webhooks);
  });

  it('has intelligence accessor', () => {
    expect(frihet.intelligence).toBeInstanceOf(Intelligence);
  });

  it('throws if apiKey is missing', () => {
    // @ts-expect-error intentional
    expect(() => new Frihet({})).toThrow('apiKey is required');
  });
});

// --- Error classes ---

describe('Error classes', () => {
  describe('FrihetError', () => {
    it('is an instance of Error', () => {
      const err = new FrihetError('boom');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(FrihetError);
      expect(err.name).toBe('FrihetError');
      expect(err.message).toBe('boom');
    });
  });

  describe('APIError', () => {
    it('captures status, code, and requestId', () => {
      const err = new APIError(500, 'server_error', 'something broke', 'req_123');
      expect(err).toBeInstanceOf(FrihetError);
      expect(err).toBeInstanceOf(APIError);
      expect(err.name).toBe('APIError');
      expect(err.status).toBe(500);
      expect(err.code).toBe('server_error');
      expect(err.message).toBe('something broke');
      expect(err.requestId).toBe('req_123');
    });

    it('requestId is optional', () => {
      const err = new APIError(500, 'server_error', 'oops');
      expect(err.requestId).toBeUndefined();
    });
  });

  describe('AuthenticationError', () => {
    it('defaults to 401 with correct message', () => {
      const err = new AuthenticationError();
      expect(err).toBeInstanceOf(APIError);
      expect(err.name).toBe('AuthenticationError');
      expect(err.status).toBe(401);
      expect(err.code).toBe('authentication_error');
      expect(err.message).toBe('Invalid or missing API key');
    });

    it('accepts custom message', () => {
      const err = new AuthenticationError('Token expired');
      expect(err.message).toBe('Token expired');
    });
  });

  describe('NotFoundError', () => {
    it('defaults to 404', () => {
      const err = new NotFoundError();
      expect(err).toBeInstanceOf(APIError);
      expect(err.name).toBe('NotFoundError');
      expect(err.status).toBe(404);
      expect(err.code).toBe('not_found');
      expect(err.message).toBe('Resource not found');
    });

    it('accepts custom message', () => {
      const err = new NotFoundError('Invoice not found');
      expect(err.message).toBe('Invoice not found');
    });
  });

  describe('ValidationError', () => {
    it('captures details array', () => {
      const details = [{ field: 'clientName', message: 'required' }];
      const err = new ValidationError('Validation failed', details);
      expect(err).toBeInstanceOf(APIError);
      expect(err.name).toBe('ValidationError');
      expect(err.status).toBe(400);
      expect(err.code).toBe('validation_error');
      expect(err.details).toEqual(details);
    });

    it('details is optional', () => {
      const err = new ValidationError('bad input');
      expect(err.details).toBeUndefined();
    });
  });

  describe('RateLimitError', () => {
    it('defaults to 429 with retryAfter', () => {
      const err = new RateLimitError(60);
      expect(err).toBeInstanceOf(APIError);
      expect(err.name).toBe('RateLimitError');
      expect(err.status).toBe(429);
      expect(err.retryAfter).toBe(60);
    });

    it('retryAfter is optional', () => {
      const err = new RateLimitError();
      expect(err.retryAfter).toBeUndefined();
    });
  });

  describe('TimeoutError', () => {
    it('includes timeout value in message', () => {
      const err = new TimeoutError(5000);
      expect(err).toBeInstanceOf(FrihetError);
      expect(err.name).toBe('TimeoutError');
      expect(err.message).toBe('Request timed out after 5000ms');
    });

    it('is NOT an APIError (no HTTP response)', () => {
      const err = new TimeoutError(1000);
      expect(err).not.toBeInstanceOf(APIError);
    });
  });
});
