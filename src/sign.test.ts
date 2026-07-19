import test from "node:test";
import assert from "node:assert/strict";
import { sign, timestampUtc } from "./sign.js";

test("reproduces the worked example from Merit's authentication docs", () => {
  const body = JSON.stringify({
    CustName: "Kliendinimi",
    CustId: "3a274294-9c60-4a3d-93f0-1874253f073e",
    OverDueDays: 5,
    DebtDate: "20220501",
  });
  const sig = sign(
    "670fe52f-558a-4be8-ade0-526e01a106d0",
    "AoCmZGUfWMMhLJ+Eb6oRF4pAEw9XJP9b/RL5c2Gqk2w=",
    "20240624205902",
    body,
  );
  assert.equal(sig, "dt6dkfuj+OfX01YkvvAoN/fekAUGr6AvVlQhUUja9Qc=");
});

test("timestamp is yyyyMMddHHmmss UTC", () => {
  assert.equal(timestampUtc(new Date("2024-06-24T20:59:02Z")), "20240624205902");
});
