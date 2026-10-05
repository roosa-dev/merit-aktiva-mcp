import test from "node:test";
import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { resolveAttachment } from "./attachment.js";

const PDF = Buffer.from("%PDF-1.4 test invoice");

// Fake Google token endpoint + Gmail API + plain file host on one loopback server.
async function withGoogleStub(fn: (base: string, seen: string[]) => Promise<void>) {
  const seen: string[] = [];
  const http = createHttpServer((req, res) => {
    seen.push(`${req.method} ${req.url} ${req.headers.authorization ?? ""}`);
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/token") return res.end(JSON.stringify({ access_token: "tok" }));
    if (req.url === "/gmail/v1/users/me/messages/m1?format=full") {
      return res.end(JSON.stringify({ payload: { parts: [
        { filename: "", mimeType: "text/html", body: {} },
        { filename: "report.xlsx", mimeType: "application/vnd.ms-excel", body: { attachmentId: "a0" } },
        { filename: "Arve 1.pdf", mimeType: "application/pdf", body: { attachmentId: "a1" } },
        { filename: "Arve 2.pdf", mimeType: "application/pdf", body: { attachmentId: "a2" } },
      ] } }));
    }
    const att = req.url?.match(/^\/gmail\/v1\/users\/me\/messages\/m1\/attachments\/(a\d)$/);
    if (att) return res.end(JSON.stringify({ data: Buffer.from(`%PDF-${att[1]}`).toString("base64url") }));
    if (req.url === "/files/inv.pdf") return res.end(PDF);
    if (req.url === "/files/page.html") return res.end("<html>");
    res.statusCode = 404;
    res.end("nope");
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  Object.assign(process.env, {
    GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_REFRESH_TOKEN: "refresh",
    GOOGLE_TOKEN_URL: `${base}/token`, GMAIL_API_BASE: base,
  });
  try {
    await fn(base, seen);
  } finally {
    http.close();
  }
}

const content = (r: unknown) => (r as { Attachment: { FileName: string; FileContent: string } }).Attachment;

test("FileContent and bodies without Attachment pass through unchanged", async () => {
  const body = { BillNo: "1", Attachment: { FileName: "a.pdf", FileContent: "QUJD" } };
  assert.equal(await resolveAttachment(body), body);
  assert.deepEqual(await resolveAttachment({ BillNo: "1" }), { BillNo: "1" });
});

test("Url attachments are downloaded and base64-encoded, keeping other fields", async () => {
  await withGoogleStub(async (base) => {
    const out = await resolveAttachment({ BillNo: "1", Attachment: { Url: `${base}/files/inv.pdf` } });
    assert.equal((out as { BillNo: string }).BillNo, "1");
    assert.deepEqual(content(out), { FileName: "inv.pdf", FileContent: PDF.toString("base64") });
  });
});

test("non-PDF downloads and non-https urls are rejected", async () => {
  await withGoogleStub(async (base) => {
    await assert.rejects(resolveAttachment({ Attachment: { Url: `${base}/files/page.html` } }), /not a PDF/);
    await assert.rejects(resolveAttachment({ Attachment: { Url: "http://example.com/x.pdf" } }), /https/);
  });
});

test("Gmail message without attachment id picks the named PDF, else the first PDF", async () => {
  await withGoogleStub(async (_base, seen) => {
    const named = await resolveAttachment({ Attachment: { GmailMessageId: "m1", FileName: "Arve 2.pdf" } });
    assert.deepEqual(content(named), { FileName: "Arve 2.pdf", FileContent: Buffer.from("%PDF-a2").toString("base64") });

    const first = await resolveAttachment({ Attachment: { GmailMessageId: "m1" } });
    assert.equal(content(first).FileName, "Arve 1.pdf");
    assert.ok(seen.some((s) => s.startsWith("GET /gmail/") && s.endsWith("Bearer tok")), "Gmail calls carry the access token");
  });
});

test("Gmail with explicit attachment id fetches it directly", async () => {
  await withGoogleStub(async (_base, seen) => {
    const out = await resolveAttachment({ Attachment: { GmailMessageId: "m1", GmailAttachmentId: "a2", FileName: "x" } });
    assert.deepEqual(content(out), { FileName: "x.pdf", FileContent: Buffer.from("%PDF-a2").toString("base64") });
    assert.ok(!seen.some((s) => s.includes("format=full")));
  });
});

test("Gmail without credentials fails with a clear message", async () => {
  const saved = process.env.GOOGLE_REFRESH_TOKEN;
  delete process.env.GOOGLE_REFRESH_TOKEN;
  try {
    await assert.rejects(resolveAttachment({ Attachment: { GmailMessageId: "m1" } }), /GOOGLE_REFRESH_TOKEN/);
  } finally {
    if (saved) process.env.GOOGLE_REFRESH_TOKEN = saved;
  }
});
