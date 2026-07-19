import { createHmac } from "node:crypto";

export function timestampUtc(d = new Date()): string {
  return d.toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

export function sign(apiId: string, apiKey: string, timestamp: string, body: string): string {
  return createHmac("sha256", apiKey).update(apiId + timestamp + body).digest("base64");
}
