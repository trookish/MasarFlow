import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { readSources, REPO_ROOT } from "../_helpers/fs-scan";

/**
 * The e2e suite addresses the shell through these anchors. P8 rewrites the
 * shell; this test is what makes a silent rename fail in `pnpm test` instead of
 * in a 40-second packaged-app launch.
 *
 * `data-dock-url` is on the list because the dock specs address a specific
 * panel through `[data-testid="dock-panel"][data-dock-url="<panel id>"]` —
 * a rename there breaks the tab-interaction measurement silently.
 */
const REQUIRED = [
  { anchor: 'data-testid="app-shell"', file: "src/app/(workspace)/layout.tsx" },
  { anchor: 'data-testid="shell-ready"', file: "" }, // any source may own it
  { anchor: 'data-testid="dock-panel"', file: "" },
  { anchor: "data-dock-tab", file: "" },
  { anchor: "data-dock-url", file: "" },
];

describe("e2e anchor contract", () => {
  it("every anchor exists in src", () => {
    const sources = readSources(join(REPO_ROOT, "src"));
    const missing = REQUIRED.filter(({ anchor, file }) =>
      file
        ? !sources.some((s) => s.path === file && s.text.includes(anchor))
        : !sources.some((s) => s.text.includes(anchor)),
    ).map((r) => r.anchor);
    expect(missing).toEqual([]);
  });
});
