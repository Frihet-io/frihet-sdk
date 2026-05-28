# @frihet/sdk

Official TypeScript SDK for the [Frihet](https://frihet.io) API. AI-native business management.

## Install

```bash
npm install @frihet/sdk
```

## Quick start

```typescript
import Frihet from '@frihet/sdk';

const frihet = new Frihet({ apiKey: 'fri_...' });

// Create an invoice
const invoice = await frihet.invoices.create({
  clientName: 'Acme Corp',
  items: [{ description: 'Consulting', quantity: 10, unitPrice: 150 }],
});

// List overdue invoices
const overdue = await frihet.invoices.list({ status: 'overdue' });

// Mark as paid
await frihet.invoices.markPaid(invoice.id);

// Send by email
await frihet.invoices.send(invoice.id, { recipientEmail: 'billing@acme.com' });

// Download PDF
const pdf = await frihet.invoices.pdf(invoice.id);
```

## Resources

| Resource | Methods |
|----------|---------|
| `frihet.invoices` | `list`, `retrieve`, `create`, `update`, `del`, `search`, `markPaid`, `send`, `pdf`, `createBatch` |
| `frihet.expenses` | `list`, `retrieve`, `create`, `update`, `del`, `search`, `createBatch` |
| `frihet.clients` | `list`, `retrieve`, `create`, `update`, `del`, `search` |
| `frihet.vendors` | `list`, `retrieve`, `create`, `update`, `del`, `search` |
| `frihet.products` | `list`, `retrieve`, `create`, `update`, `del`, `search` |
| `frihet.quotes` | `list`, `retrieve`, `create`, `update`, `del`, `search`, `send`, `pdf` |
| `frihet.webhooks` | `list`, `retrieve`, `create`, `update`, `del` |
| `frihet.intelligence` | `context`, `summary`, `monthly`, `quarterly` |

## Intelligence

```typescript
// Full business context (one call for AI agents)
const ctx = await frihet.intelligence.context();

// Monthly P&L with tax liability
const march = await frihet.intelligence.monthly('2026-03');

// Quarterly tax prep (Modelo 303/130)
const q1 = await frihet.intelligence.quarterly('2026-Q1');

// Financial summary with date range
const ytd = await frihet.intelligence.summary({ from: '2026-01-01', to: '2026-12-31' });
```

## Error handling

```typescript
import Frihet, { RateLimitError, NotFoundError, ValidationError } from '@frihet/sdk';

try {
  await frihet.invoices.retrieve('nonexistent');
} catch (err) {
  if (err instanceof NotFoundError) {
    console.log('Invoice not found');
  } else if (err instanceof RateLimitError) {
    console.log(`Retry after ${err.retryAfter}s`);
  } else if (err instanceof ValidationError) {
    console.log('Validation:', err.details);
  }
}
```

## Webhook verification

```typescript
import { webhookSignatureVerify } from '@frihet/sdk';

const isValid = webhookSignatureVerify(
  rawBody,
  req.headers['x-frihet-signature'],
  webhookSecret,
);
```

Node-only, synchronous. Accepts the canonical Frihet header
(`timestamp=<unix>, signature=<hex64>`) plus `sha256=<hex64>` and raw hex
for compatibility. Validates timestamp freshness (default 300 s) and
uses `crypto.timingSafeEqual` over hex-sanitized buffers — see
`functions/src/webhookVerification.ts` for the equivalent server impl.

For non-Node runtimes use the async `Webhooks.verifySignature` static
helper instead.

## HR (leaves + attendance + payroll)

```typescript
import {
  createLeaveRequest,
  approveLeave,
  rejectLeave,
  type LeaveType,
  type LeaveEntitlement,
  type AttendanceEntry,
  type PayrollProfile,
  type PayrollExportFormat,
} from '@frihet/sdk';

// helpers expect a transport — pass the same client your Frihet instance uses
const req = await createLeaveRequest(client, {
  employeeId: 'emp_123',
  type: 'vacation',
  startDate: '2026-07-01',
  endDate: '2026-07-15',
});

await approveLeave(client, req.id, 'Cobertura confirmada');
// or: await rejectLeave(client, req.id, 'Coincide con cierre fiscal');
```

## Banking (exceptions + rules)

```typescript
import {
  bankRuleSimulate,
  type BankException,
  type BankExceptionStatus,
  type BankRule,
  type CreateBankRuleParams,
} from '@frihet/sdk';

const draft: CreateBankRuleParams = {
  name: 'AWS hosting',
  priority: 100,
  isActive: true,
  conditions: [{ field: 'counterparty', operator: 'contains', value: 'AMAZON WEB' }],
  action: 'categorize_expense',
  actionConfig: { category: 'hosting' },
};
const { matched, sample } = await bankRuleSimulate(client, draft);
```

## Period close

```typescript
import { periodCloseStatus, type PeriodClose } from '@frihet/sdk';

const current = await periodCloseStatus(client);          // most recent close
const march = await periodCloseStatus(client, '2026-03'); // specific period
```

## Configuration

```typescript
const frihet = new Frihet({
  apiKey: 'fri_...',
  baseUrl: 'https://api.frihet.io/v1', // default
  timeout: 30000, // 30s default
});

// Per-request options
await frihet.invoices.create(data, {
  idempotencyKey: 'unique-key-123',
  timeout: 60000,
});
```

## Features

- Full TypeScript types with autocompletion
- Automatic retry on rate limits (429) and server errors (5xx)
- Exponential backoff with configurable retries
- Idempotency key support for safe retries
- Dual CJS/ESM output
- Zero runtime dependencies
- Request ID tracking on errors
- HMAC webhook signature verification

## Links

- [API Documentation](https://docs.frihet.io/desarrolladores/api-rest)
- [MCP Server](https://www.npmjs.com/package/@frihet/mcp-server)
- [CLI](https://www.npmjs.com/package/frihet)

## License

MIT
