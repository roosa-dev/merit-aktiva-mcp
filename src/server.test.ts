import test from "node:test";
import assert from "node:assert/strict";
import { createServer as createHttpServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { callMerit, createServer } from "./server.js";
import { sign } from "./sign.js";

async function connectedClient() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([
    createServer().connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

type Captured = { method: string; url: string; contentType: string; body: string };

async function withMeritStub(fn: (captured: Captured[]) => Promise<void>) {
  const captured: Captured[] = [];
  const http = createHttpServer((req: IncomingMessage, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      captured.push({
        method: req.method ?? "",
        url: req.url ?? "",
        contentType: req.headers["content-type"] ?? "",
        body,
      });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify([{ Name: "Test Customer" }]));
    });
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  process.env.MERIT_API_ID = "test-api-id";
  process.env.MERIT_API_KEY = "test-api-key";
  process.env.MERIT_BASE_URL = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  try {
    await fn(captured);
  } finally {
    http.close();
  }
}

test("callMerit POSTs signed request and returns response text", async () => {
  await withMeritStub(async (captured) => {
    const result = await callMerit("/api/v1/getcustomers", { Name: "x" });

    assert.equal(result, JSON.stringify([{ Name: "Test Customer" }]));
    assert.equal(captured.length, 1);
    const req = captured[0];
    assert.equal(req.method, "POST");
    assert.match(req.contentType, /application\/json/);
    assert.equal(req.body, JSON.stringify({ Name: "x" }));

    const url = new URL(req.url, "http://x");
    assert.equal(url.pathname, "/api/v1/getcustomers");
    assert.equal(url.searchParams.get("apiId"), "test-api-id");
    const timestamp = url.searchParams.get("timestamp") ?? "";
    assert.match(timestamp, /^\d{14}$/);
    assert.equal(
      url.searchParams.get("signature"),
      sign("test-api-id", "test-api-key", timestamp, req.body),
    );
  });
});

test("tools are generated from the endpoint table", async () => {
  const client = await connectedClient();
  const { tools } = await client.listTools();

  assert.ok(tools.length >= 55, `expected ~60 tools, got ${tools.length}`);
  const names = tools.map((t) => t.name);
  for (const expected of [
    "get_invoices",
    "create_invoice",
    "get_purchase_invoices",
    "create_purchase_payment",
    "get_customers",
    "get_profit_report",
  ]) {
    assert.ok(names.includes(expected), `missing tool ${expected}`);
  }
  for (const t of tools) {
    assert.ok(t.description && t.description.length > 0, `${t.name} has no description`);
    assert.equal(t.inputSchema.type, "object");
    if (t.name.startsWith("delete_")) {
      assert.match(t.description ?? "", /DESTRUCTIVE/, `${t.name} not marked DESTRUCTIVE`);
    }
  }
});

test("calling a tool POSTs to the mapped Merit endpoint and returns the response", async () => {
  await withMeritStub(async (captured) => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "get_customers", arguments: { Name: "x" } });

    assert.equal(captured.length, 1);
    assert.equal(new URL(captured[0].url, "http://x").pathname, "/api/v1/getcustomers");
    assert.equal(captured[0].body, JSON.stringify({ Name: "x" }));
    const content = result.content as { type: string; text: string }[];
    assert.equal(content[0].type, "text");
    assert.match(content[0].text, /Test Customer/);
    assert.ok(!result.isError);
  });
});

test("unknown tool name returns an error result", async () => {
  const client = await connectedClient();
  const result = await client.callTool({ name: "no_such_tool", arguments: {} });
  assert.ok(result.isError);
});
