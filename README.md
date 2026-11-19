# merit-aktiva-mcp

MCP server for the [Merit Aktiva](https://api.merit.ee/connecting-robots/reference-manual/) accounting API. Exposes ~60 tools covering sales/purchase invoices, payments, customers, vendors, items, general ledger, offers, reference data, and reports — read and write.

## Remote (Cloudflare Workers)

The server can also run as a remote MCP server with OAuth (`src/worker.ts`). To deploy your own:

1. `cp wrangler.example.jsonc wrangler.jsonc` (gitignored) and set your account id and domain.
2. `wrangler kv namespace create OAUTH_KV` and put the id in `wrangler.jsonc`.
3. `scripts/set-merit-keys.sh` asks for `MERIT_API_ID` / `MERIT_API_KEY`, checks them against Merit, and stores them as Worker secrets. Other secrets (e.g. the `GOOGLE_*` ones below): `scripts/set-secrets.sh default NAME...`.
4. Protect the authorize page, either:
   - **Cloudflare Access (recommended):** create a self-hosted Access application for `<your-domain>/authorize` only (the MCP and OAuth endpoints must stay reachable by clients), and set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in `vars`. The Worker verifies the Access JWT itself; or
   - **a shared key:** `wrangler secret put ACCESS_KEY` and leave the Access vars out.
5. `wrangler deploy`, then connect your client to `https://<your-domain>/mcp` (the `/mcp` path is required).

Authorization codes are only issued to `claude.ai`, `claude.com` and loopback redirect URIs; add more hosts with the `ALLOWED_REDIRECT_HOSTS` variable (comma-separated). For a second Merit company, add an `env` block (see the example config) and deploy with `--env <name>`.

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
