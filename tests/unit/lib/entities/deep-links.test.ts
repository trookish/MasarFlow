import { describe, it, expect } from "vitest";
import { ENTITY_KINDS, KIND_META } from "@/lib/entities/registry";
import { readSources } from "../../_helpers/fs-scan";

const views = readSources().filter((s) => s.path.startsWith("src/components/"));

describe("every deep-link param is actually read by a view", () => {
  for (const kind of ENTITY_KINDS) {
    const { param } = KIND_META[kind];
    if (!param) continue;
    it(`${kind}: a view reads "${param}"`, () => {
      const viaGet = (t: string) => t.includes(`get("${param}")`);
      const viaHook = (t: string) =>
        new RegExp(`useUrlSelection\\(\\s*"[^"]+",\\s*"${param}"\\s*\\)`).test(t);
      expect(views.some((v) => viaGet(v.text) || viaHook(v.text))).toBe(true);
    });
  }
});
