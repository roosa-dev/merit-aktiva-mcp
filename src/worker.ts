import OAuthProvider, { type AuthRequest, type OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { McpAgent } from "agents/mcp";
import { verifyKey } from "./authkey.js";
import { createServer } from "./server.js";

type Env = {
  OAUTH_PROVIDER: OAuthHelpers;
  ACCESS_KEY: string;
  MERIT_API_ID: string;
  MERIT_API_KEY: string;
  MERIT_BASE_URL?: string;
};

export class MeritMCP extends McpAgent<Env> {
  server = createServer() as never;
  async init() {
    // callMerit reads process.env; populate it from Worker secrets
    process.env.MERIT_API_ID = this.env.MERIT_API_ID;
    process.env.MERIT_API_KEY = this.env.MERIT_API_KEY;
    if (this.env.MERIT_BASE_URL) process.env.MERIT_BASE_URL = this.env.MERIT_BASE_URL;
  }
}

const page = (body: string) =>
  new Response(
    `<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;max-width:28rem;margin:4rem auto">${body}</body>`,
    { headers: { "Content-Type": "text/html" } },
  );

// ponytail: single-owner access-key gate instead of an upstream identity provider;
// swap defaultHandler for a real IdP if this ever gets more than one user
const authHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/authorize") {
      return page("<h2>merit-aktiva-mcp</h2><p>Remote MCP server. Connect your MCP client to <code>/mcp</code>.</p>");
    }
    if (request.method === "GET") {
      const oauthReq = await env.OAUTH_PROVIDER.parseAuthRequest(request);
      const state = btoa(JSON.stringify(oauthReq));
      return page(
        `<h2>Merit Aktiva MCP</h2><p>Client <b>${oauthReq.clientId}</b> requests access to your accounting data.</p>
         <form method="post"><input type="hidden" name="state" value="${state}">
         <input type="password" name="key" placeholder="Access key" autofocus>
         <button>Approve</button></form>`,
      );
    }
    const form = await request.formData();
    if (!verifyKey(String(form.get("key") ?? ""), env.ACCESS_KEY)) {
      return page("<p>Invalid access key.</p>");
    }
    const oauthReq = JSON.parse(atob(String(form.get("state") ?? ""))) as AuthRequest;
    const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
      request: oauthReq,
      userId: "owner",
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
