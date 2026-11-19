import test from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, redirectAllowed } from "./authpage.js";

test("escapeHtml neutralises markup", () => {
  assert.equal(escapeHtml(`<b x="1">'&'</b>`), "&#60;b x=&#34;1&#34;&#62;&#39;&#38;&#39;&#60;/b&#62;");
});

test("redirectAllowed accepts Claude and loopback callbacks", () => {
  assert.equal(redirectAllowed("https://claude.ai/api/mcp/auth_callback"), true);
  assert.equal(redirectAllowed("https://claude.com/api/mcp/auth_callback"), true);
  assert.equal(redirectAllowed("http://localhost:53123/callback"), true);
  assert.equal(redirectAllowed("http://127.0.0.1:9999/cb"), true);
});

test("redirectAllowed rejects other hosts and schemes", () => {
  assert.equal(redirectAllowed("https://evil.example/cb"), false);
  assert.equal(redirectAllowed("https://claude.ai.evil.example/cb"), false);
  assert.equal(redirectAllowed("http://claude.ai/cb"), false);
  assert.equal(redirectAllowed("javascript:alert(1)"), false);
  assert.equal(redirectAllowed("not a url"), false);
});

test("redirectAllowed honours extra hosts", () => {
  assert.equal(redirectAllowed("https://cursor.sh/cb", "cursor.sh, example.com"), true);
  assert.equal(redirectAllowed("https://other.sh/cb", "cursor.sh"), false);
});
