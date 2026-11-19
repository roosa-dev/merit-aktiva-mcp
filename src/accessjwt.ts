// Verifies the Cf-Access-Jwt-Assertion header Cloudflare Access adds to requests it let through.
// Checking it in the Worker means a misconfigured or removed Access app fails closed.

type Jwk = JsonWebKey & { kid: string };
type Claims = { aud?: string | string[]; exp?: number; nbf?: number; iss?: string; email?: string };

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const json = (s: string) => JSON.parse(new TextDecoder().decode(b64url(s)));

let cache: { url: string; keys: Jwk[]; at: number } | undefined;

async function certs(teamDomain: string, fetchFn: typeof fetch): Promise<Jwk[]> {
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  if (cache?.url === url && Date.now() - cache.at < 10 * 60_000) return cache.keys;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`Access certs ${res.status}`);
  const keys = ((await res.json()) as { keys: Jwk[] }).keys;
  cache = { url, keys, at: Date.now() };
  return keys;
}

// Returns the verified email, or null if the token is missing or invalid.
export async function verifyAccessJwt(
  token: string | null,
  teamDomain: string,
  aud: string,
  fetchFn: typeof fetch = fetch,
  now = Date.now() / 1000,
): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = json(parts[0]) as { alg?: string; kid?: string };
    if (header.alg !== "RS256") return null;
    const jwk = (await certs(teamDomain, fetchFn)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;
    const c = json(parts[1]) as Claims;
    const auds = Array.isArray(c.aud) ? c.aud : [c.aud];
    if (!auds.includes(aud)) return null;
    if (c.iss !== `https://${teamDomain}`) return null;
    if (!c.exp || c.exp < now || (c.nbf && c.nbf > now + 60)) return null;
    return c.email ?? "unknown";
  } catch {
    return null;
  }
}

export function _resetCertCache() {
  cache = undefined;
}
