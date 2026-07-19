import { createHash, timingSafeEqual } from "node:crypto";

export function verifyKey(submitted: string, expected: string): boolean {
  if (!expected) return false;
  // hash both sides to equal length so timingSafeEqual is usable and length leaks nothing
  const a = createHash("sha256").update(submitted).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
