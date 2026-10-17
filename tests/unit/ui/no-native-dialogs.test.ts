import { describe, expect, it } from "vitest";
import { readSources } from "../_helpers/fs-scan";
import { expectShrinkingAllowlist } from "../_helpers/shrinking-allowlist";

/**
 * The app must never use window.alert/confirm/prompt: they are unstyled, block
 * the renderer (which owns the dock's pointer capture), cannot be themed, and
 * give the user no place to explain a consequence. Use ConfirmDialog for
 * decisions and the toast store for outcomes.
 */

/**
 * Files that still call a native dialog, each with a reason. P8.T24 owns only
 * the palette paths, so the remaining calls are pinned here instead of being
 * fixed blind; the list may only shrink.
 *
 * - src/components/shell/db-gate.tsx — `window.confirm` before wiping the
 *   workspace on the error-recovery screen. Replace with ConfirmDialog (the
 *   shell/data stream owns that screen).
 * - src/components/settings/auto-backups-card.tsx — `window.confirm` before
 *   replacing the workspace from a backup. Replace with ConfirmDialog (the
 *   settings stream owns that card).
 */
const NATIVE_DIALOG_DEBT = [
  "src/components/shell/db-gate.tsx",
  "src/components/settings/auto-backups-card.tsx",
];

/** Comments are prose, not calls: strip block and whole-line comments first. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
}

const NATIVE_CALL = /\b(window\.)?(alert|confirm|prompt)\s*\(/g;

/**
 * True when the (comment-stripped) source calls a native dialog. A bare call
 * is exempt when the same file declares its own helper with that name
 * (data-backup-card.tsx has `function confirm(...)`, its own inline
 * confirmation UI — not window.confirm); a `window.`-prefixed call is never
 * exempt.
 */
function callsNativeDialog(text: string): boolean {
  const code = stripComments(text);
  for (const match of code.matchAll(NATIVE_CALL)) {
    if (match[1] !== undefined) return true;
    if (new RegExp(`\\b(function|const|let|var)\\s+${match[2]}\\b`).test(code)) continue;
    return true;
  }
  return false;
}

describe("no native dialogs", () => {
  it("has no alert/confirm/prompt calls in application source", () => {
    const offenders = readSources()
      .filter((source) => source.path.startsWith("src/"))
      .filter((source) => callsNativeDialog(source.text))
      .map((source) => source.path);
    expectShrinkingAllowlist(offenders, NATIVE_DIALOG_DEBT);
  });

  it("routes destructive commands through ConfirmDialog", () => {
    const registry = readSources().find((s) => s.path === "src/lib/commands/registry.ts")?.text ?? "";
    const dangerous = registry.match(/tone: "danger"/g)?.length ?? 0;
    const confirmations = registry.match(/confirm: \{/g)?.length ?? 0;
    expect(dangerous).toBeGreaterThan(0);
    expect(confirmations).toBe(dangerous);
  });
});
