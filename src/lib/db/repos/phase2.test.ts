import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { codeFindingsRepo } from "./codeFindings";
import { linkSuggestionsRepo } from "./linkSuggestions";
import { parsedContentsRepo } from "./parsedContents";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("codeFindingsRepo", () => {
  it("upserts by (projectId, path) — re-analysis replaces the row", async () => {
    const a = await codeFindingsRepo.upsert({
      projectId: "p1",
      path: "src/a.ts",
      language: "typescript",
      violations: [{ rule: "no-console", severity: "warning", message: "console", line: 3, snippet: "console.log" }],
      metrics: { loc: 10, cyclomatic: 2, cognitive: 1 },
      symbols: [],
    });
    expect(a.id).toBeTruthy();

    const b = await codeFindingsRepo.upsert({
      projectId: "p1",
      path: "src/a.ts",
      language: "typescript",
      violations: [],
      metrics: { loc: 12, cyclomatic: 3, cognitive: 1 },
      symbols: [{ name: "foo", kind: "function", line: 1 }],
    });
    expect(b.id).toBe(a.id);
    const all = await codeFindingsRepo.listByProject("p1");
    expect(all).toHaveLength(1);
    expect(all[0].metrics.loc).toBe(12);
    expect(all[0].symbols).toHaveLength(1);
  });

  it("scopes by project and removes by path", async () => {
    await codeFindingsRepo.upsert({
      projectId: "p1",
      path: "src/a.ts",
      language: "typescript",
      violations: [],
      metrics: { loc: 0, cyclomatic: 0, cognitive: 0 },
      symbols: [],
    });
    await codeFindingsRepo.upsert({
      projectId: "p2",
      path: "src/a.ts",
      language: "typescript",
      violations: [],
      metrics: { loc: 0, cyclomatic: 0, cognitive: 0 },
      symbols: [],
    });
    expect(await codeFindingsRepo.listByProject("p1")).toHaveLength(1);
    await codeFindingsRepo.removeByPath("p1", "src/a.ts");
    expect(await codeFindingsRepo.listByProject("p1")).toHaveLength(0);
    expect(await codeFindingsRepo.listByProject("p2")).toHaveLength(1);
  });
});

describe("linkSuggestionsRepo", () => {
  it("lists pending and transitions status", async () => {
    const s = await linkSuggestionsRepo.create({
      projectId: "p1",
      sourceType: "note",
      sourceId: "n1",
      targetType: "note",
      targetId: "n2",
      linkType: "relates",
      score: 0.8,
      reason: "shared concepts",
    });
    expect(await linkSuggestionsRepo.listPending("p1")).toHaveLength(1);
    expect((await linkSuggestionsRepo.listByProject("p1"))[0].status).toBe("pending");

    await linkSuggestionsRepo.setStatus(s.id, "accepted");
    expect(await linkSuggestionsRepo.listPending("p1")).toHaveLength(0);
    expect((await linkSuggestionsRepo.listByProject("p1"))[0].status).toBe("accepted");
  });
});

describe("parsedContentsRepo", () => {
  it("upserts by path and caches extracted text", async () => {
    await parsedContentsRepo.upsert({
      projectId: "p1",
      path: "docs/spec.pdf",
      modality: "pdf",
      text: "extracted body",
      meta: { pages: 3 },
      hash: "abc",
    });
    const got = await parsedContentsRepo.getByPath("p1", "docs/spec.pdf");
    expect(got?.text).toBe("extracted body");
    expect(got?.meta.pages).toBe(3);

    const updated = await parsedContentsRepo.upsert({
      projectId: "p1",
      path: "docs/spec.pdf",
      modality: "pdf",
      text: "new body",
      meta: {},
      hash: "def",
    });
    expect(updated.id).toBe(got?.id);
    expect((await parsedContentsRepo.getByPath("p1", "docs/spec.pdf"))?.text).toBe("new body");
  });
});
