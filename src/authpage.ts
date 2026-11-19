// Helpers for the /authorize page. Kept out of worker.ts so they run under node --test.

const DEFAULT_REDIRECT_HOSTS = ["claude.ai", "claude.com"];
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Dynamic client registration is open, so anyone can register a client with their own
// redirect URI and send the owner a real /authorize link. Only hand codes to known hosts.
// `extra` is a comma-separated list of additional https hosts (ALLOWED_REDIRECT_HOSTS).
export function redirectAllowed(redirectUri: string, extra = ""): boolean {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return false;
  }
  if (LOOPBACK.has(url.hostname)) return url.protocol === "http:" || url.protocol === "https:";
  if (url.protocol !== "https:") return false;
  const hosts = [...DEFAULT_REDIRECT_HOSTS, ...extra.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean)];
  return hosts.includes(url.hostname);
}
