import { describe, expect, it } from "vitest";
import { describeRoot, formatBytes, storageSummary } from "@/lib/tools/system";
import { envForDisplay, redactEnv } from "@desktop-shared/redact";

describe("formatBytes", () => {
  it("uses human units and never shows a bare number", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1024 * 1024 * 3.5)).toBe("3.5 MB");
    expect(formatBytes(1024 ** 3 * 2)).toBe("2.0 GB");
  });
});

describe("storageSummary", () => {
  it("describes how full the workspace store is", () => {
    expect(storageSummary(100, 100)).toBe("full");
    expect(storageSummary(85, 100)).toBe("nearly full");
    expect(storageSummary(30, 100)).toBe("healthy");
    expect(storageSummary(1, 0)).toBe("unknown");
  });
});

describe("describeRoot", () => {
  it("states allowed / not allowed in the user's words", () => {
    expect(describeRoot("C:\\Games\\Roguelike", true)).toContain("allowed");
    expect(describeRoot("C:\\Games\\Roguelike", false)).toContain("not allowed");
    expect(describeRoot("C:\\Games\\Roguelike", true)).toContain("Roguelike");
  });
});

describe("redactEnv", () => {
  it("masks token/key/secret/password values and keeps the rest", () => {
    const rows = redactEnv({
      MASARFLOW_TOKEN: "super-secret-value",
      MASARFLOW_DATA_DIR: "C:\\data",
      MY_API_KEY: "k-123",
      DB_PASSWORD: "p-123",
      GITHUB_SECRET: "s-123",
      PATH: "/usr/bin",
    });
    const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));
    expect(byKey.MASARFLOW_TOKEN.value).toBe("[REDACTED]");
    expect(byKey.MASARFLOW_TOKEN.redacted).toBe(true);
    expect(byKey.MY_API_KEY.value).toBe("[REDACTED]");
    expect(byKey.DB_PASSWORD.value).toBe("[REDACTED]");
    expect(byKey.GITHUB_SECRET.value).toBe("[REDACTED]");
    expect(byKey.MASARFLOW_DATA_DIR.value).toBe("C:\\data");
    expect(byKey.PATH.value).toBe("/usr/bin");
    // The actual secret string must not appear anywhere in what the panel gets.
    expect(JSON.stringify(rows)).not.toContain("super-secret-value");
  });

  it("sorts rows by key and drops empty values", () => {
    const rows = redactEnv({ MASARFLOW_VERSION: "0.2.0", MASARFLOW_SMOKE: undefined });
    expect(rows.map((row) => row.key)).toEqual(["MASARFLOW_VERSION"]);
  });
});

describe("envForDisplay", () => {
  it("only ever exposes MasarFlow's own environment keys", () => {
    const rows = envForDisplay({ MASARFLOW_VERSION: "0.2.0", SECRET_API_KEY: "x", HOME: "/home/me" });
    expect(rows.map((row) => row.key)).toEqual(["MASARFLOW_VERSION"]);
  });
});
