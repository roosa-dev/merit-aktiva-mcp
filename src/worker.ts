import OAuthProvider, { type AuthRequest, type OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { McpAgent } from "agents/mcp";
import { escapeHtml, redirectAllowed } from "./authpage.js";
import { verifyKey } from "./authkey.js";
import { verifyAccessJwt } from "./accessjwt.js";
import { createServer } from "./server.js";

type Env = {
  OAUTH_PROVIDER: OAuthHelpers;
  ACCESS_KEY?: string;
  // when both are set, Cloudflare Access (in front of /authorize) replaces the access key
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ALLOWED_REDIRECT_HOSTS?: string;
  MERIT_API_ID: string;
  MERIT_API_KEY: string;
  MERIT_BASE_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REFRESH_TOKEN?: string;
};

export class MeritMCP extends McpAgent<Env> {
  server = createServer() as never;
  async init() {
    // callMerit reads process.env; populate it from Worker secrets
    process.env.MERIT_API_ID = this.env.MERIT_API_ID;
    process.env.MERIT_API_KEY = this.env.MERIT_API_KEY;
    if (this.env.MERIT_BASE_URL) process.env.MERIT_BASE_URL = this.env.MERIT_BASE_URL;
    // optional: Gmail read access for fetching invoice attachments by message id
    for (const k of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"] as const) {
      if (this.env[k]) process.env[k] = this.env[k];
    }
  }
}

const page = (body: string, status = 200) =>
  new Response(
    `<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;max-width:28rem;margin:4rem auto">${body}</body>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
        "Referrer-Policy": "same-origin",
        "Cache-Control": "no-store",
      },
    },
  );

// Login gate for /authorize: Cloudflare Access (verified via its JWT) when configured,
// otherwise a single shared access key.
const authHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/authorize") {
      return page("<h2>merit-aktiva-mcp</h2><p>Remote MCP server. Connect your MCP client to <code>/mcp</code>.</p>");
    }
    // The form posts back to this same URL, so the OAuth request is re-parsed (and re-validated)
    // from the query string on POST too, rather than trusting a client-supplied copy.
    const oauthReq = await env.OAUTH_PROVIDER.parseAuthRequest(request);
    if (!redirectAllowed(oauthReq.redirectUri, env.ALLOWED_REDIRECT_HOSTS)) {
      return page(`<p>Redirect to <code>${escapeHtml(oauthReq.redirectUri)}</code> is not allowed.</p>`, 400);
    }
    const useAccess = Boolean(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);
    let userId = "owner";
    if (useAccess) {
      const email = await verifyAccessJwt(request.headers.get("Cf-Access-Jwt-Assertion"), env.ACCESS_TEAM_DOMAIN!, env.ACCESS_AUD!);
      if (!email) return page("<p>Cloudflare Access login required.</p>", 403);
      userId = email;
    }
    if (request.method === "GET") {
      const client = await env.OAUTH_PROVIDER.lookupClient(oauthReq.clientId);
      const name = client?.clientName ? escapeHtml(client.clientName) : "Unnamed client";
      return page(
        `<h2>Merit Aktiva MCP</h2><p><code>${escapeHtml(url.host)}</code></p><p><b>${name}</b> requests access to your accounting data.</p>
         <p>Access will be granted to <code>${escapeHtml(new URL(oauthReq.redirectUri).host)}</code>.</p>
         ${useAccess ? `<p>Signed in as <b>${escapeHtml(userId)}</b>.</p>` : ""}
         <form method="post">${useAccess ? "" : `<input type="password" name="key" placeholder="Access key" autocomplete="current-password" autofocus>`}
         <button>Approve</button></form>`,
      );
    }
    if (request.method !== "POST") return page("<p>Method not allowed.</p>", 405);
    // CSRF: the approve form must be submitted from this page itself
    const sameSite = request.headers.get("Origin") === url.origin || request.headers.get("Sec-Fetch-Site") === "same-origin";
    if (!sameSite) return page("<p>Cross-site request rejected.</p>", 403);
    if (!useAccess) {
      const form = await request.formData();
      if (!verifyKey(String(form.get("key") ?? ""), env.ACCESS_KEY ?? "")) {
        return page("<p>Invalid access key.</p>", 403);
      }
    }
    const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
      request: oauthReq,
      userId,
      metadata: {},
      scope: oauthReq.scope,
      props: {},
    });
    return Response.redirect(redirectTo, 302);
  },
};

export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: MeritMCP.serve("/mcp") as never,
  defaultHandler: authHandler as never,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
