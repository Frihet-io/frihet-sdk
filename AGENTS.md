# Frihet SDK + CLI

Official TypeScript SDK (`@frihet/sdk`) and CLI (`frihet`) for the Frihet API. pnpm workspace, Node >= 18, MIT.

Two audiences read this file. If you are an agent **using** Frihet, read "Using Frihet from an agent". If you are an agent **changing this repo**, read the rest.

## Using Frihet from an agent

```bash
export FRIHET_API_KEY=fri_...          # create one at https://app.frihet.io/settings/api
npx -y frihet status --json            # first useful result, no config file, no login prompt
```

The SDK and the CLI both read `FRIHET_API_KEY` from the environment, so nothing has to be written to disk. `frihet login` exists for humans and prompts on a TTY — never route an unattended caller through it.

**Draft, show, stop.** The same contract the [MCP server](https://github.com/Frihet-io/frihet-mcp) enforces applies here, because both sit on the same REST API:

```typescript
import Frihet from '@frihet/sdk';
const frihet = new Frihet({ apiKey: process.env.FRIHET_API_KEY! });

const context = await frihet.intelligence.context();     // orient: fiscal zone, currency, defaults
const invoice = await frihet.invoices.create({           // propose: created as a draft
  clientName: 'Acme Corp',
  items: [{ description: 'Consulting', quantity: 10, unitPrice: 150 }],
});
// STOP. Report invoice.id and the totals. Do not call send() or markPaid().
```

Omit `status` and the API creates the record as a **draft** (`POST /v1/invoices` and `/v1/quotes` both default to `status: 'draft'`): no fiscal number, no VeriFactu hash, nothing filed with a tax authority. Issuing is a separate step and belongs to a human.

**These require an explicit human instruction — they leave Frihet and you cannot undo them:**

| Call | Why |
|------|-----|
| `frihet.invoices.send`, `frihet.quotes.send` | Emails a third party |
| `frihet.invoices.markPaid` | Asserts money arrived |
| `frihet.deposits.apply`, `frihet.deposits.refund` | Moves money |
| `frihet.webhooks.create`, `frihet.webhooks.update`, `frihet.webhooks.del` | Changes what Frihet delivers to other systems |
| `frihet.team.invite` | Invites a person |

The SDK deliberately exposes **no** e-invoicing, VeriFactu, TicketBAI or FACe method. Those submissions are reachable only through the REST API and the MCP server, both of which gate them behind an explicit confirmation. Do not add a convenience wrapper for them here.

**Failure handling.** Errors are typed — `AuthenticationError` (401), `ValidationError` (400), `NotFoundError` (404), `RateLimitError` (429, `err.retryAfter` seconds), `ConflictError` (409). 429 and 5xx are retried up to 3 times automatically with a shared `Idempotency-Key`; do not add your own retry loop on top. After a 409 on a POST, read the resource back rather than retrying with a fresh key — a new key would create a second fiscal document.

Machine-readable onboarding for the MCP surface: [`docs/agent-onboarding.json`](https://github.com/Frihet-io/frihet-mcp/blob/main/docs/agent-onboarding.json).

## Build & test

```bash
pnpm install
pnpm build                      # tsup → dist/ for both packages
pnpm typecheck                  # tsc --noEmit, both packages
pnpm --filter @frihet/sdk test  # vitest
pnpm --filter frihet test       # vitest (CLI contract tests)
```

**Pre-commit**: `pnpm build`, `pnpm typecheck` and both suites must pass. CI runs the matrix on Node 18/20/22; vitest 4 needs Node 20+, so Node 18 only smoke-tests the built bundle (`packages/sdk/scripts/smoke-dist.mjs`).

## Code style

- TypeScript strict, ESM, `.js` extensions on relative imports (NodeNext)
- One file per API resource under `packages/sdk/src/resources/`
- Errors: throw the typed classes from `src/error.ts`, never a bare `Error`, so callers can branch
- No `Math.random` in anything retry- or idempotency-related — `generateIdempotencyKey` deliberately falls back to `node:crypto`, not weak entropy
- CLI commands take `--json`; human output goes through `src/output.ts`

## Conventions

- Commits: `feat(sdk): add <resource>` / `fix(cli): ...`
- Branches: `feat/<slug>`, `fix/<slug>`
- SDK and CLI version together; CLI depends on `workspace:*`

## Gotchas

- **The SDK mirrors runtime truth, not the roadmap.** A resource that the API does not serve must fail closed before the HTTP call (see `resources/stay.manifest.ts` and `channels.ts`), not send a request that 404s. Adding an optimistic method is how the SDK starts lying.
- **`/settings/security` does not issue API keys** — `/settings/api` does. Both are real screens, which is why the wrong one went unnoticed.
- **`shouldOutputJson()` scans raw `process.argv`**, so `--json` works even where a command forgot to declare the option. Declare it anyway; the help output is the contract.
- **Retries share one `Idempotency-Key` per logical request** (`RequestState`). Generating a key per attempt would defeat the whole mechanism.
- **`Retry-After` above 60s is not slept through** — it is surfaced to the caller instead of scheduling an hours-long timer.
