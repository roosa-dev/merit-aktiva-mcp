import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnv } from "./env.js";

test("loads KEY=VALUE pairs from a .env file without overriding existing env", () => {
  const dir = mkdtempSync(join(tmpdir(), "merit-env-"));
  const file = join(dir, ".env");
  writeFileSync(
    file,
    '# comment\nMERIT_TEST_A=hello\nMERIT_TEST_B="quoted value"\nMERIT_TEST_EXISTING=from-file\n\n',
  );
  process.env.MERIT_TEST_EXISTING = "already-set";
  delete process.env.MERIT_TEST_A;
  delete process.env.MERIT_TEST_B;

  loadEnv(file);

  assert.equal(process.env.MERIT_TEST_A, "hello");
  assert.equal(process.env.MERIT_TEST_B, "quoted value");
  assert.equal(process.env.MERIT_TEST_EXISTING, "already-set");
});

test("missing .env file is a no-op", () => {
  loadEnv("/nonexistent/path/.env");
});
