import { describe, expect, it } from "vitest";
import { exitNote, sessionLabel, terminalWarning } from "@/lib/tools/terminal";

describe("sessionLabel", () => {
  it("names the shell and the folder", () => {
    expect(sessionLabel("Command Prompt", "C:\\Projects\\Game")).toBe(
      "Command Prompt — Game",
    );
    expect(sessionLabel("zsh", "/home/me/app")).toBe("zsh — app");
  });

  it("never shows an empty folder name", () => {
    expect(sessionLabel("zsh", "/")).toBe("zsh — /");
    expect(sessionLabel("zsh", "")).toBe("zsh — unknown folder");
  });
});

describe("exitNote", () => {
  it("says what happened in plain words", () => {
    expect(exitNote(0)).toBe("Process exited with code 0.");
    expect(exitNote(130)).toBe("Process exited with code 130.");
    expect(exitNote(null)).toBe("Process exited.");
  });
});

describe("terminalWarning", () => {
  it("names the folder and states the consequence before anything runs", () => {
    const warning = terminalWarning("C:\\Projects\\Game");
    expect(warning).toContain("C:\\Projects\\Game");
    expect(warning).toContain("real");
    expect(warning).toContain("cannot be undone");
  });
});
