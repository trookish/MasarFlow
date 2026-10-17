import { describe, it } from "vitest";
import { join } from "node:path";
import { readSources, REPO_ROOT } from "../_helpers/fs-scan";
import { expectShrinkingAllowlist } from "../_helpers/shrinking-allowlist";

/**
 * Settings that exist in the Settings screen but change nothing.
 *
 * A leaf key of PAGE_SETTINGS_DEFAULTS is consumed when code outside the store
 * and outside src/components/settings/** reads it (as `.key` or as a bare word).
 * Scope note: only the page-settings store is scanned — the other persisted
 * stores are runtime state (dock layout, theme, project selection), not
 * user-facing settings, and are covered by their own unit tests.
 *
 * Verified 2026-10-16: 18 groups / 47 keys, exactly one dead key.
 */
const DEAD_SETTINGS: string[] = ["chat.codeHighlighting"];

function leafKeys(): string[] {
  const store = readSources(join(REPO_ROOT, "src")).find(
    (s) => s.path === "src/lib/stores/page-settings.ts",
  );
  if (!store) throw new Error("page-settings.ts not found — the scan is broken, not the settings");
  const anchor = store.text.indexOf("PAGE_SETTINGS_DEFAULTS: AllPageSettings = {");
  if (anchor === -1) throw new Error("PAGE_SETTINGS_DEFAULTS literal not found");
  const start = store.text.indexOf("{", anchor);
  let depth = 0;
  let end = -1;
  for (let i = start; i < store.text.length; i++) {
    if (store.text[i] === "{") depth++;
    else if (store.text[i] === "}" && --depth === 0) { end = i + 1; break; }
  }
  const defaults = new Function("return " + store.text.slice(start, end))() as Record<
    string,
    Record<string, unknown>
  >;
  return Object.entries(defaults).flatMap(([group, obj]) =>
    Object.keys(obj).map((key) => `${group}.${key}`),
  );
}

describe("settings have consumers", () => {
  it("every page setting is read somewhere outside the settings screen", () => {
    const consumers = readSources(join(REPO_ROOT, "src")).filter(
      (s) =>
        s.path !== "src/lib/stores/page-settings.ts" &&
        !s.path.startsWith("src/components/settings/"),
    );
    const dead = leafKeys()
      .filter((k) => {
        const key = k.split(".")[1];
        return !consumers.some(
          (s) =>
            new RegExp("\\." + key + "\\b").test(s.text) ||
            new RegExp("\\b" + key + "\\b").test(s.text),
        );
      })
      .sort();
    expectShrinkingAllowlist(dead, DEAD_SETTINGS);
  });

  it("the scan sees a non-trivial key set (guards against a broken parser)", () => {
    const keys = leafKeys();
    if (keys.length < 40) throw new Error(`expected ≥40 leaf keys, saw ${keys.length}`);
  });
});
