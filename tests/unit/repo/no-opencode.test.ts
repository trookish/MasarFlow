import { describe, it, expect } from "vitest";
import { scanFiles } from "../_helpers/fs-scan";

/**
 * OpenCode was removed in v0.2.0.0 — no source file may reference it again.
 *
 * Two deliberate, plan-sanctioned exceptions are allowed (and nothing else):
 *
 *  1. `scripts/security-check.mjs` — the black-box guard matrix keeps one
 *     case proving the FORMER bridge path `/api/opencode/ws-call` is not
 *     exempt from the launch token (it now 404s instead of skipping the
 *     guard). The file is owned by the security stream; the case is spec'd in
 *     the P2 plan (P2.T1 "no path is exempt from the token").
 *  2. A legacy-data migration notice, if one is ever added under
 *     `src/lib/db/migrations/` (none exists today — legacy `backend` values
 *     are normalized in `chatThreadSchema` instead).
 *
 * Any other mention — code, comment, fixture, script — fails this test.
 */
const SECURITY_CHECK = "scripts/security-check.mjs";
const SECURITY_CHECK_CASE = "/api/opencode/ws-call";

function isAllowedHit(hit: { file: string; text: string }): boolean {
  return hit.file === SECURITY_CHECK && hit.text.includes(SECURITY_CHECK_CASE);
}

describe("OpenCode is gone", () => {
  it("no source file references it", () => {
    const hits = scanFiles(["src", "desktop/src", "scripts"], /opencode/i)
      .filter((h) => !isAllowedHit(h))
      .map((h) => `${h.file}:${h.line}: ${h.text}`);
    expect(hits).toEqual([]);
  });
});
