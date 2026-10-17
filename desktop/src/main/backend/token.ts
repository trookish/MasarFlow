import { randomBytes, timingSafeEqual } from "node:crypto";

/** Per-launch secret shared by main and the embedded server only. */
export function createLaunchToken(): string {
  return randomBytes(32).toString("hex");
}

/** Constant-time compare; an empty expected token never matches. */
export function tokensMatch(expected: string, actual: string | null | undefined): boolean {
  if (!expected || !actual) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}
