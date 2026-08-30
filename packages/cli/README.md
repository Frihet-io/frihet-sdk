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

## For AI agents (non-interactive)

```bash
export FRIHET_API_KEY=fri_...   # create one at https://app.frihet.io/settings/api
npx -y frihet status --json     # first useful result, no config file, no prompt
```

The CLI and the SDK both read `FRIHET_API_KEY` from the environment, so
nothing has to be written to disk. `frihet login` exists for humans and
prompts on a TTY — **do not route an unattended caller through it.**

If the key is missing, the CLI exits with code `1` and prints a JSON
line carrying `error.code: "FRIHET_API_KEY_MISSING"`,
`error.obtainAt: "https://app.frihet.io/settings/api"`, and a per-recovery
`interactive` flag. Branch on `error.code`, not on the exit code.

## For humans (interactive)

`frihet login` prompts for an API key and saves it to
`~/.frihet/config.json`. Use this only on a TTY.

```bash
frihet login
# Frihet CLI Login
# Get your API key at https://app.frihet.io/settings/api
# API key: <paste>
# Authenticated as Acme Corp. Key saved to ~/.frihet/config.json
```

The same key works for `npx frihet status --json` once it is on disk,
but the env-var path above is preferred for any automated caller.

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
| `FRIHET_API_KEY` | API key. Preferred for any automated caller. |
| `FRIHET_API_URL` | Custom API base URL. |

When `FRIHET_API_KEY` is set, the CLI does **not** read or write
`~/.frihet/config.json` — the env var always wins. `frihet login` only
writes the disk file; it does not set the env var.

## Links

- [SDK](https://www.npmjs.com/package/@frihet/sdk)
- [API Documentation](https://docs.frihet.io/desarrolladores/api-rest)
- [MCP Server](https://www.npmjs.com/package/@frihet/mcp-server)

## License

MIT
