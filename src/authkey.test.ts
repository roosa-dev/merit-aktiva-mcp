import test from "node:test";
import assert from "node:assert/strict";
import { verifyKey } from "./authkey.js";

test("verifyKey accepts only the exact key", () => {
  assert.equal(verifyKey("secret-123", "secret-123"), true);
  assert.equal(verifyKey("secret-124", "secret-123"), false);
  assert.equal(verifyKey("", "secret-123"), false);
  assert.equal(verifyKey("secret-1234", "secret-123"), false);
  assert.equal(verifyKey("secret-123", ""), false); // unset server key never matches
});
