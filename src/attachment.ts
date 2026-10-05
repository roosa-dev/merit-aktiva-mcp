// Resolves a purchase-invoice Attachment given by reference into Merit's {FileName, FileContent}.
// Accepted forms:
//   { FileName, FileContent }                                  — passed through (base64 PDF)
//   { Url, FileName? }                                         — downloaded by the server
//   { GmailMessageId, GmailAttachmentId?, FileName? }          — fetched from Gmail API
// For Gmail without GmailAttachmentId, the part matching FileName (else the first PDF) is used.

const MAX_BYTES = 10 * 1024 * 1024;

type AttachmentRef = {
  FileName?: string;
  FileContent?: string;
  Url?: string;
  GmailMessageId?: string;
  GmailAttachmentId?: string;
};

type GmailPart = { filename?: string; mimeType?: string; body?: { attachmentId?: string }; parts?: GmailPart[] };

export async function resolveAttachment(body: unknown): Promise<unknown> {
  if (!body || typeof body !== "object") return body;
  const att = (body as { Attachment?: AttachmentRef }).Attachment;
  if (!att || att.FileContent) return body;

  let bytes: Uint8Array;
  let fileName = att.FileName;
  if (att.Url) {
    bytes = await fetchUrl(att.Url);
    fileName ??= decodeURIComponent(new URL(att.Url).pathname.split("/").pop() || "invoice.pdf");
  } else if (att.GmailMessageId) {
    const got = await fetchGmail(att.GmailMessageId, att.GmailAttachmentId, att.FileName);
    bytes = got.bytes;
    fileName ??= got.fileName;
  } else {
    throw new Error("Attachment needs FileContent, Url, or GmailMessageId");
  }

  if (bytes.length > MAX_BYTES) throw new Error(`Attachment is ${bytes.length} bytes, over the ${MAX_BYTES} limit`);
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new Error("Attachment is not a PDF");
  if (!fileName.toLowerCase().endsWith(".pdf")) fileName += ".pdf";

  return { ...body, Attachment: { FileName: fileName, FileContent: Buffer.from(bytes).toString("base64") } };
}

async function fetchUrl(raw: string): Promise<Uint8Array> {
  const url = new URL(raw);
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("Attachment Url must be https");
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Attachment download failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function gmailToken(): Promise<string> {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error("Gmail attachments need GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN");
  }
  const res = await fetch(process.env.GOOGLE_TOKEN_URL ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function fetchGmail(messageId: string, attachmentId: string | undefined, fileName: string | undefined) {
  const base = `${process.env.GMAIL_API_BASE ?? "https://gmail.googleapis.com"}/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`;
  const headers = { Authorization: `Bearer ${await gmailToken()}` };
  const get = async (url: string) => {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Gmail API ${res.status}: ${await res.text()}`);
    return res.json();
  };

  let name = fileName;
  if (!attachmentId) {
    const msg = (await get(`${base}?format=full`)) as { payload: GmailPart };
    const parts: GmailPart[] = [];
    const walk = (p: GmailPart) => { parts.push(p); p.parts?.forEach(walk); };
    walk(msg.payload);
    const withFile = parts.filter((p) => p.filename && p.body?.attachmentId);
    const part = fileName
      ? withFile.find((p) => p.filename === fileName)
      : withFile.find((p) => p.mimeType === "application/pdf" || p.filename!.toLowerCase().endsWith(".pdf"));
    if (!part) throw new Error(`No ${fileName ? `attachment named "${fileName}"` : "PDF attachment"} in message ${messageId}`);
    attachmentId = part.body!.attachmentId!;
    name = part.filename;
  }

  const { data } = (await get(`${base}/attachments/${encodeURIComponent(attachmentId)}`)) as { data: string };
  return { bytes: new Uint8Array(Buffer.from(data, "base64url")), fileName: name ?? "invoice.pdf" };
}
