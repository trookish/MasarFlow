import { describe, it, expect } from "vitest";
import { createEchoStripper } from "@/lib/chat/echo-strip";

function stripAll(userText: string, text: string): string {
  const s = createEchoStripper(userText);
  return text
    .split(/(?<=["\n])/)
    .map((d) => s.strip(d))
    .join("");
}

describe("createEchoStripper", () => {
  it("strips an exact leading echo of the user message", () => {
    const s = createEchoStripper("What can you see?");
    expect(s.strip("What can you see?")).toBe("");
    expect(s.strip(" I can see the workspace.")).toBe(
      "I can see the workspace.",
    );
  });

  it("strips the echo and keeps the rest in one delta", () => {
    const s = createEchoStripper("What can you see?");
    expect(s.strip("What can you see? Here is what I see:")).toBe(
      "Here is what I see:",
    );
  });

  it("leaves non-echo text untouched", () => {
    const s = createEchoStripper("What can you see?");
    expect(s.strip("Here is a direct answer.")).toBe("Here is a direct answer.");
  });

  it("tolerates case differences", () => {
    const s = createEchoStripper("what can you see?");
    expect(s.strip("WHAT CAN YOU SEE? The answer:")).toBe("The answer:");
  });

  it("tolerates punctuation differences", () => {
    const s = createEchoStripper("What can you see?");
    expect(s.strip("What can you see. Let me explain.")).toBe(
      "Let me explain.",
    );
  });

  it("handles chunk boundaries mid-echo", () => {
    const s = createEchoStripper("What can you see?");
    expect(s.strip("What can ")).toBe("");
    expect(s.strip("you see? The ans")).toBe("The ans");
    expect(s.strip("wer:")).toBe("wer:");
  });

  it("keeps stripping across deltas until the echo completes", () => {
    expect(stripAll("What can you see?", "What can you see?\nI see notes.")).toBe(
      "I see notes.",
    );
  });

  it("reset() re-arms the stripper for a fresh stream", () => {
    const s = createEchoStripper("hi");
    expect(s.strip("hi there")).toBe("there");
    s.reset();
    expect(s.strip("hi again")).toBe("again");
  });

  it("does nothing for an empty user message", () => {
    const s = createEchoStripper("");
    expect(s.strip("anything")).toBe("anything");
  });

  it("stops stripping once the echo diverges", () => {
    const s = createEchoStripper("What can you see?");
    expect(s.strip("What can you fix?")).toBe("fix?");
  });

  it("strips an echo in a non-Latin script (Arabic)", () => {
    const s = createEchoStripper("ماذا ترى الآن؟");
    expect(s.strip("ماذا ترى الآن؟ أرى مساحة العمل.")).toBe("أرى مساحة العمل.");
  });

  it("strips an Arabic echo across chunk boundaries", () => {
    const s = createEchoStripper("ماذا ترى الآن؟");
    expect(s.strip("ماذا ترى")).toBe("");
    expect(s.strip(" الآن؟ الجواب:")).toBe("الجواب:");
    expect(s.strip("والتفاصيل")).toBe("والتفاصيل");
  });

  it("never touches later deltas once the echo diverges", () => {
    const s = createEchoStripper("What can you see?");
    expect(s.strip("What can you fix?")).toBe("fix?");
    expect(s.strip("seen any bugs?")).toBe("seen any bugs?");
  });

  it("disarms permanently when a partial echo diverges", () => {
    const s = createEchoStripper("What can you see?");
    expect(s.strip("What can yo")).toBe("");
    expect(s.strip("u help")).toBe("help"); // "u " still matched as echo, then divergence
    expect(s.strip(" me please")).toBe(" me please"); // disarmed — untouched
  });
});
