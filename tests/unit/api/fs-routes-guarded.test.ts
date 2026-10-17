import { describe, it, expect } from "vitest";
import { readSources } from "../_helpers/fs-scan";

describe("filesystem-touching routes enforce the root allow-list", () => {
  const routes = readSources().filter(
    (s) => /^src\/app\/api\/(fs\/[^/]+|watch)\/route\.ts$/.test(s.path),
  );
  it("finds the expected routes", () => {
    expect(routes.map((r) => r.path).sort()).toEqual([
      "src/app/api/fs/list/route.ts",
      "src/app/api/fs/read/route.ts",
      "src/app/api/fs/search/route.ts",
      "src/app/api/fs/shell/route.ts",
      "src/app/api/fs/write/route.ts",
      "src/app/api/watch/route.ts",
    ]);
  });
  it.each(routes.map((r) => [r.path, r.text] as const))("%s validates its root", (_path, text) => {
    expect(/resolveInsideRoot\(|assertRootAllowed\(/.test(text)).toBe(true);
  });
});
