import { describe, expect, it } from "vitest";
import { resolveShell, validateTerminalStart } from "@desktop-shared/terminal";

describe("resolveShell", () => {
  it("uses ComSpec on Windows and never returns an empty command", () => {
    const shell = resolveShell("win32", { ComSpec: "C:\\Windows\\System32\\cmd.exe" });
    expect(shell.file).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(shell.args).toEqual([]);
    expect(shell.label).toBe("Command Prompt");
    expect(resolveShell("win32", {}).file).toMatch(/powershell|cmd/i);
  });

  it("uses $SHELL on POSIX and falls back to a real binary", () => {
    expect(resolveShell("darwin", { SHELL: "/bin/zsh" })).toEqual({
      file: "/bin/zsh",
      args: ["-l"],
      label: "zsh",
    });
    expect(resolveShell("linux", {}).file).toBe("/bin/bash");
  });
});

describe("validateTerminalStart", () => {
  const ROOTS = ["C:\\Projects\\Game", "/home/me/projects/app"];

  it("accepts a cwd inside a registered root and clamps the viewport", () => {
    const res = validateTerminalStart(
      { cwd: "C:\\Projects\\Game\\src", cols: 9000, rows: 0 },
      ROOTS,
      "win32",
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.cwd).toBe("C:\\Projects\\Game\\src");
      expect(res.cols).toBe(400);
      expect(res.rows).toBe(5);
    }
  });

  it("rejects anything the renderer could send by mistake or on purpose", () => {
    const cases: unknown[] = [
      null,
      "C:\\Projects\\Game",
      42,
      {},
      { cwd: "" },
      { cwd: "relative/path" },
      { cwd: "C:\\Windows\\System32" },
      { cwd: "\\\\server\\share" },
      { cwd: "C:\\Projects\\Game\\..\\..\\Windows" },
    ];
    for (const value of cases) {
      expect(validateTerminalStart(value, ROOTS, "win32").ok, JSON.stringify(value)).toBe(false);
    }
  });

  it("refuses when no root is registered at all", () => {
    expect(validateTerminalStart({ cwd: "C:\\Projects\\Game" }, [], "win32").ok).toBe(false);
  });

  it("explains the refusal in the user's words", () => {
    const res = validateTerminalStart({ cwd: "C:\\Windows" }, ROOTS, "win32");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("registered folder");
  });
});
