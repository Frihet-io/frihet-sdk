# frihet

Official CLI for [Frihet](https://frihet.io). Manage your business from the terminal.

## Install

```bash
npm install -g frihet
```

Or use directly:

```bash
npx frihet status
```

## Setup

```bash
frihet login
# Enter your API key from https://app.frihet.io/settings/security
```

Or set the environment variable:

```bash
export FRIHET_API_KEY=fri_...
```

## Commands

### Business status

```bash
frihet status
# Revenue:   EUR 15,200.00
# Expenses:  EUR 3,400.00
# Net:       EUR 11,800.00
# Overdue:   4 invoices (EUR 3,200.00)
```

### Invoices

```bash
# List invoices
frihet invoices list
frihet invoices list --status overdue
frihet invoices list --from 2026-01-01 --to 2026-03-31

# Create invoice
frihet invoices create --client "Acme Corp" --item "Consulting,10,150" --tax 21

# Create and send immediately
frihet invoices create --client "Acme" --item "Design,5,200" --send billing@acme.com

# View details
frihet invoices get inv_abc123

# Mark as paid
frihet invoices paid inv_abc123

# Send by email
frihet invoices send inv_abc123 --to billing@acme.com
```

### Expenses

```bash
# List expenses
frihet expenses list
frihet expenses list --from 2026-03-01

# Create expense
frihet expenses create --desc "Adobe Creative Cloud" --amount 59.99 --category software
```

### Clients

```bash
# List clients
frihet clients list
frihet clients list -q "Acme"

# Create client
frihet clients create --name "Acme Corp" --email billing@acme.com --tax-id B12345678
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `FRIHET_API_KEY` | API key (overrides `~/.frihet/config.json`) |
| `FRIHET_API_URL` | Custom API base URL |

## Links

- [SDK](https://www.npmjs.com/package/@frihet/sdk)
- [API Documentation](https://docs.frihet.io/desarrolladores/api-rest)
- [MCP Server](https://www.npmjs.com/package/@frihet/mcp-server)

## License

MIT
