# merit-aktiva-mcp

MCP server for the [Merit Aktiva](https://api.merit.ee/connecting-robots/reference-manual/) accounting API. Exposes ~60 tools covering sales/purchase invoices, payments, customers, vendors, items, general ledger, offers, reference data, and reports — read and write.

## Setup

Get your API id and key from Merit Aktiva: Settings → Common settings → API settings.

```sh
npm install && npm run build
claude mcp add merit-aktiva -e MERIT_API_ID=<id> -e MERIT_API_KEY=<key> -- node /path/to/merit-aktiva-mcp/dist/index.js
```

Environment variables:

- `MERIT_API_ID` (required)
- `MERIT_API_KEY` (required)
- `MERIT_BASE_URL` (optional, default `https://aktiva.merit.ee`; Poland: `https://program.360ksiegowosc.pl`)

Instead of `-e` flags you can put these in a `.env` file (KEY=VALUE lines) in the project root or the working directory; real environment variables take precedence. `.env` is gitignored.

## Notes

- Tool inputs are the raw Merit request bodies (documented per tool in its description); dates are `yyyymmdd` strings, list endpoints cap periods at 3 months.
- `delete_*` tools are destructive — Merit has no undo.
- `npm test` runs the test suite (signature verified against the worked example in Merit's auth docs).
