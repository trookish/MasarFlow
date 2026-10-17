import { describe, it, expect } from "vitest";
import { redactText, isAllowedPath, buildDiagnosticsReport, REDACTION_RULES } from "@desktop-shared/diagnostics";

const opts = { allowedPaths: ["C:\\Users\\trookish\\Dev\\MyGame"], userHome: "C:\\Users\\trookish" };

describe("isAllowedPath", () => {
  it("accepts the root and anything under it, case-insensitively", () => {
    expect(isAllowedPath("C:\\Users\\trookish\\Dev\\MyGame", opts.allowedPaths)).toBe(true);
    expect(isAllowedPath("C:\\Users\\trookish\\Dev\\MyGame\\src\\main.cs", opts.allowedPaths)).toBe(true);
    expect(isAllowedPath("c:/users/trookish/dev/mygame/src", opts.allowedPaths)).toBe(true);
  });
  it("rejects siblings that merely share a prefix", () => {
    expect(isAllowedPath("C:\\Users\\trookish\\Dev\\MyGame2", opts.allowedPaths)).toBe(false);
    expect(isAllowedPath("C:\\Users\\trookish\\Dev", opts.allowedPaths)).toBe(false);
    expect(isAllowedPath("D:\\secret", opts.allowedPaths)).toBe(false);
  });
});

describe("redactText", () => {
  it("masks the home directory and foreign paths", () => {
    const out = redactText("cwd=C:\\Users\\trookish\\AppData\\Roaming\\MasarFlow\\logs other=D:\\keys", opts);
    expect(out).toContain("%USERPROFILE%");
    expect(out).not.toContain("trookish");
    expect(out).toContain("<redacted-path>");
  });
  it("keeps paths inside a registered root", () => {
    const out = redactText("root=C:\\Users\\trookish\\Dev\\MyGame\\src\\a.ts", opts);
    expect(out).toContain("Dev\\MyGame\\src\\a.ts");
  });
  it("masks provider keys, PATs and bridge secrets", () => {
    const out = redactText("key=«redacted:sk-…» pat=«redacted:ghp_…» bridge=msf_bridge_0123456789abcdef", opts);
    expect(out).not.toMatch(/sk-abcdef/);
    expect(out).not.toMatch(/ghp_0123/);
    expect(out).not.toMatch(/msf_bridge_/);
  });
  it("masks opaque long strings (launch tokens) but leaves URLs alone", () => {
    const token = "b".repeat(64);
    const out = redactText(`token=${token} url=https://github.com/trookish/MasarFlow/releases`, opts);
    expect(out).not.toContain(token);
    expect(out).toContain("https://github.com/trookish/MasarFlow/releases");
  });
});

describe("buildDiagnosticsReport", () => {
  it("states the redaction rule at the top", () => {
    const md = buildDiagnosticsReport([{ title: "App", lines: ["version 0.2.0.0"] }]);
    expect(md).toContain("# MasarFlow diagnostics");
    expect(md).toContain(REDACTION_RULES[0]);
    expect(md).toContain("## App");
    expect(md).toContain("version 0.2.0.0");
  });
});
