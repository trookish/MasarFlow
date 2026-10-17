import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listLogs, readLogTail, safeLogName, tailLines } from "@desktop/logs";
import { lineLevel, levelFilterLabel, passesFilter } from "@/lib/tools/logs";

describe("tailLines", () => {
  it("returns the last N lines and drops the trailing newline", () => {
    expect(tailLines("a\nb\nc\n", 2)).toEqual(["b", "c"]);
    expect(tailLines("only", 5)).toEqual(["only"]);
    expect(tailLines("", 5)).toEqual([]);
  });

  it("caps the number of lines it will ever return", () => {
    const big = Array.from({ length: 2000 }, (_, i) => `line ${i}`).join("\n");
    expect(tailLines(big, 10_000)).toHaveLength(1000);
  });
});

describe("safeLogName", () => {
  it("accepts plain file names and rejects traversal", () => {
    expect(safeLogName("main.log")).toBe("main.log");
    expect(safeLogName("app-2026-10-16.log")).toBe("app-2026-10-16.log");
    expect(safeLogName("../secrets.json")).toBeNull();
    expect(safeLogName("sub/dir.log")).toBeNull();
    expect(safeLogName("sub\\dir.log")).toBeNull();
    expect(safeLogName("")).toBeNull();
    expect(safeLogName(".env")).toBeNull();
  });
});

describe("listLogs / readLogTail", () => {
  it("lists log files newest first and tails one of them", () => {
    const dir = mkdtempSync(join(tmpdir(), "masarflow-logs-"));
    mkdirSync(join(dir, "nested"));
    writeFileSync(join(dir, "main.log"), "one\ntwo\nthree\n");
    writeFileSync(join(dir, "other.txt"), "not a log\n");
    writeFileSync(join(dir, "nested", "deep.log"), "ignored\n");

    const files = listLogs(dir);
    expect(files.map((f) => f.name)).toEqual(["main.log"]);
    expect(files[0].bytes).toBeGreaterThan(0);

    expect(readLogTail(dir, "main.log", 2)).toEqual(["two", "three"]);
    expect(readLogTail(dir, "missing.log")).toEqual([]);
    expect(readLogTail(dir, "../secrets.json")).toEqual([]);
    expect(listLogs(join(dir, "does-not-exist"))).toEqual([]);
  });
});

describe("lineLevel", () => {
  it("classifies by the strongest signal in the line", () => {
    expect(lineLevel("2026-10-16 ERROR cannot bind port")).toBe("error");
    expect(lineLevel("warn: slow query")).toBe("warn");
    expect(lineLevel("Server listening on 4010")).toBe("info");
    expect(lineLevel("")).toBe("info");
  });

  it("labels the filter for the UI", () => {
    expect(levelFilterLabel("error")).toBe("Errors only");
    expect(levelFilterLabel("all")).toBe("Everything");
  });
});

describe("passesFilter", () => {
  it("shows errors and warnings when asked", () => {
    expect(passesFilter("ERROR boom", "error")).toBe(true);
    expect(passesFilter("warn: slow", "error")).toBe(false);
    expect(passesFilter("warn: slow", "warn")).toBe(true);
    expect(passesFilter("all good", "warn")).toBe(false);
    expect(passesFilter("all good", "all")).toBe(true);
  });
});
