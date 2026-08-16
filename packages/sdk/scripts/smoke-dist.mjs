/**
 * Runtime smoke test for the built SDK bundle (dist/), exercised in CI on the
 * oldest supported Node (18), where the vitest suite cannot run (vitest 4
 * requires Node 20+). It pins the idempotency-safety contract of issue #4
 * against the real bundle with a stubbed global fetch:
 *
 *   1. distinct logical POSTs get distinct generated keys;
 *   2. a retried POST reuses the exact same key;
 *   3. an explicit caller key is preserved byte-for-byte;
 *   4. creditNote sends the required key without manual RequestOptions;
 *   5. PATCH/DELETE are not replayed after a 5xx;
 *   6. GET keeps its bounded retry;
 *   7. key generation still works when global Web Crypto is absent
 *      (the node:crypto fallback path).
 */

import assert from 'node:assert/strict';

import { APIError, Frihet } from '../dist/index.js';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const realFetch = globalThis.fetch;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(status) {
  return jsonResponse({ error: 'smoke_error', message: 'smoke failure' }, status);
}

/** Run `fn` with a stubbed fetch that records every call. */
async function withStubbedFetch(impl, fn) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return impl(calls.length, url, opts);
  };
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = realFetch;
  }
}

const sdk = new Frihet({ apiKey: 'smoke-key', baseUrl: 'https://smoke.test' });

// 4 + 2 — creditNote without RequestOptions sends a generated key, and a
// network-uncertain retry reuses that exact key.
await withStubbedFetch(
  (attempt) =>
    attempt === 1
      ? Promise.reject(new TypeError('fetch failed'))
      : Promise.resolve(jsonResponse({ data: { id: 'cn_1' } }, 201)),
  async (calls) => {
    const result = await sdk.invoices.creditNote('inv_1', { reason: 'error', fullCredit: true });
    assert.equal(result.id, 'cn_1');
    assert.equal(calls.length, 2, 'retried POST must perform two fetches');
    const keys = calls.map((c) => c.opts.headers['Idempotency-Key']);
    assert.match(keys[0], UUID_V4_RE);
    assert.equal(keys[1], keys[0], 'retry must reuse the same key');
  },
);

// 1 — distinct logical POSTs get distinct keys.
await withStubbedFetch(
  () => Promise.resolve(jsonResponse({ data: { id: 'inv_x' } }, 201)),
  async (calls) => {
    await sdk.invoices.create({ clientName: 'One', items: [] });
    await sdk.invoices.create({ clientName: 'Two', items: [] });
    const first = calls[0].opts.headers['Idempotency-Key'];
    const second = calls[1].opts.headers['Idempotency-Key'];
    assert.match(first, UUID_V4_RE);
    assert.match(second, UUID_V4_RE);
    assert.notEqual(second, first, 'distinct POSTs must get distinct keys');
  },
);

// 3 — an explicit caller key wins and is preserved byte-for-byte.
await withStubbedFetch(
  () => Promise.resolve(jsonResponse({ data: { id: 'inv_x' } }, 201)),
  async (calls) => {
    await sdk.invoices.create(
      { clientName: 'Explicit', items: [] },
      { idempotencyKey: 'caller-owned-key' },
    );
    assert.equal(calls[0].opts.headers['Idempotency-Key'], 'caller-owned-key');
  },
);

// 5 — PATCH and DELETE are not replayed after a 5xx.
for (const [label, call] of [
  ['PATCH', () => sdk.invoices.update('inv_1', { clientName: 'No retry' })],
  ['DELETE', () => sdk.invoices.del('inv_1')],
]) {
  await withStubbedFetch(
    () => Promise.resolve(errorResponse(503)),
    async (calls) => {
      await assert.rejects(call(), APIError);
      assert.equal(calls.length, 1, `${label} must not retry after a 5xx`);
    },
  );
}

// 6 — GET keeps its bounded retry and never sends an Idempotency-Key.
await withStubbedFetch(
  (attempt) =>
    attempt === 1
      ? Promise.resolve(errorResponse(503))
      : Promise.resolve(jsonResponse({ data: { id: 'inv_1' } })),
  async (calls) => {
    const invoice = await sdk.invoices.retrieve('inv_1');
    assert.equal(invoice.id, 'inv_1');
    assert.equal(calls.length, 2, 'GET must retry a 5xx');
    assert.equal(calls[0].opts.headers['Idempotency-Key'], undefined);
  },
);

// 7 — without global Web Crypto the node:crypto fallback still yields a
// strong UUID v4 key.
{
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  delete globalThis.crypto;
  try {
    await withStubbedFetch(
      () => Promise.resolve(jsonResponse({ data: { id: 'inv_x' } }, 201)),
      async (calls) => {
        await sdk.invoices.create({ clientName: 'Fallback', items: [] });
        assert.match(calls[0].opts.headers['Idempotency-Key'], UUID_V4_RE);
      },
    );
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
  }
}

console.log('smoke-dist: idempotency-safety contract OK');
