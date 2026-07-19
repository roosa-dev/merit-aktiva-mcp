# merit-aktiva-mcp

MCP server for the [Merit Aktiva](https://api.merit.ee/connecting-robots/reference-manual/) accounting API. Exposes ~60 tools covering sales/purchase invoices, payments, customers, vendors, items, general ledger, offers, reference data, and reports — read and write.

## Remote (Cloudflare Workers)

The server can also run as a remote MCP server with OAuth (`src/worker.ts`, `wrangler.jsonc`):

```sh
claude mcp add --transport http merit-aktiva https://merit-mcp.roosa.dev/mcp
```

The OAuth authorize page asks for an access key (Worker secret `ACCESS_KEY`). Deploy your own: `wrangler kv namespace create OAUTH_KV` (put the id in `wrangler.jsonc`), `wrangler secret put` for `MERIT_API_ID`, `MERIT_API_KEY`, `ACCESS_KEY`, then `wrangler deploy`.

## Setup (local stdio)

Get your API id and key from Merit Aktiva: Settings → Common settings → API settings.

```sh
claude mcp add merit-aktiva -e MERIT_API_ID=<id> -e MERIT_API_KEY=<key> -- npx -y merit-aktiva-mcp
```

Or from a checkout: `npm install && npm run build`, then use `node /path/to/merit-aktiva-mcp/dist/index.js` as the command.

Environment variables:

- `MERIT_API_ID` (required)
- `MERIT_API_KEY` (required)
- `MERIT_BASE_URL` (optional, default `https://aktiva.merit.ee`; Poland: `https://program.360ksiegowosc.pl`)

Instead of `-e` flags you can put these in a `.env` file (KEY=VALUE lines) in the project root or the working directory; real environment variables take precedence. `.env` is gitignored.

## Notes

- Tool inputs are the raw Merit request bodies (documented per tool in its description); dates are `yyyymmdd` strings, list endpoints cap periods at 3 months.
- `delete_*` tools are destructive — Merit has no undo.
- `npm test` runs the test suite (signature verified against the worked example in Merit's auth docs).
