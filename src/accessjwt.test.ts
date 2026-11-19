import test from "node:test";
import assert from "node:assert/strict";
import { verifyAccessJwt, _resetCertCache } from "./accessjwt.js";

const TEAM = "team.cloudflareaccess.com";
const AUD = "aud-123";
const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

async function setup() {
  _resetCertCache();
  const kp = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pub = { ...(await crypto.subtle.exportKey("jwk", kp.publicKey)), kid: "k1" };
  const fetchFn = (async () => new Response(JSON.stringify({ keys: [pub] }))) as unknown as typeof fetch;
  const sign = async (claims: object, kid = "k1") => {
    const head = `${enc({ alg: "RS256", kid })}.${enc(claims)}`;
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", kp.privateKey, new TextEncoder().encode(head));
    return `${head}.${Buffer.from(sig).toString("base64url")}`;
  };
  return { fetchFn, sign };
}

const good = { aud: [AUD], iss: `https://${TEAM}`, email: "a@b.c", exp: 2_000_000_000 };

test("accepts a valid Access token", async () => {
  const { fetchFn, sign } = await setup();
  assert.equal(await verifyAccessJwt(await sign(good), TEAM, AUD, fetchFn, 1_900_000_000), "a@b.c");
});

test("rejects wrong aud, issuer, expiry, key, tampering and absence", async () => {
  const { fetchFn, sign } = await setup();
  const now = 1_900_000_000;
  assert.equal(await verifyAccessJwt(await sign({ ...good, aud: ["other"] }), TEAM, AUD, fetchFn, now), null);
  assert.equal(await verifyAccessJwt(await sign({ ...good, iss: "https://evil" }), TEAM, AUD, fetchFn, now), null);
  assert.equal(await verifyAccessJwt(await sign({ ...good, exp: now - 1 }), TEAM, AUD, fetchFn, now), null);
  assert.equal(await verifyAccessJwt(await sign(good, "nope"), TEAM, AUD, fetchFn, now), null);
  const t = await sign(good);
  const [h, , s] = t.split(".");
  assert.equal(await verifyAccessJwt(`${h}.${enc({ ...good, email: "x@y.z" })}.${s}`, TEAM, AUD, fetchFn, now), null);
  assert.equal(await verifyAccessJwt(null, TEAM, AUD, fetchFn, now), null);
  assert.equal(await verifyAccessJwt("garbage", TEAM, AUD, fetchFn, now), null);
});
