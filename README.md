# merit-aktiva-mcp

MCP server for the [Merit Aktiva](https://api.merit.ee/connecting-robots/reference-manual/) accounting API. Exposes ~60 tools covering sales/purchase invoices, payments, customers, vendors, items, general ledger, offers, reference data, and reports — read and write.

## Remote (Cloudflare Workers)

The server can also run as a remote MCP server with OAuth (`src/worker.ts`, `wrangler.jsonc`). Deploy your own: `wrangler kv namespace create OAUTH_KV` (put the id in `wrangler.jsonc`), `wrangler secret put` for `MERIT_API_ID`, `MERIT_API_KEY`, `ACCESS_KEY`, then `wrangler deploy`. Connect with `claude mcp add --transport http merit-aktiva https://<your-worker-url>/mcp`; the authorize page asks for your `ACCESS_KEY`.

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

## Purchase invoice attachments

`create_purchase_invoice_for_approval` (lands in *Kinnitamata ostuarved*) and `create_purchase_invoice` accept the PDF by reference so it never passes through the model:

- `{ "Url": "https://…/invoice.pdf" }` — downloaded by the server (https only)
- `{ "GmailMessageId": "…", "FileName": "Arve 1.pdf" }` — fetched from Gmail; without `FileName`/`GmailAttachmentId` the first PDF in the message is used
- `{ "FileName": "…", "FileContent": "<base64>" }` — passed through as-is

Gmail fetching needs a Google OAuth client and a refresh token with the `gmail.readonly` scope, set as `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` (env vars locally, `wrangler secret put` remotely). The server only checks that the download is a PDF under 10 MB.

## Notes

- Tool inputs are the raw Merit request bodies (documented per tool in its description); dates are `yyyymmdd` strings, list endpoints cap periods at 3 months.
- `delete_*` tools are destructive — Merit has no undo.
- `npm test` runs the test suite (signature verified against the worked example in Merit's auth docs).
