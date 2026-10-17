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

  it("stops stripping once the echo diverges, and keeps the reply whole", () => {
    const s = createEchoStripper("What can you see?");
    expect(s.strip("What can you fix?")).toBe("What can you fix?");
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

  // A partial match that diverges was never an echo: the held-back text is
  // real content and comes back verbatim. Dropping it mangled answers such as
  // "STUB-REPLY …" to "status of …" (the "ST" matched, then "U" diverged).
  it("keeps the matched letters when the reply only shares a prefix", () => {
    const s = createEchoStripper("status of the narrow panel");
    expect(s.strip("STUB-REPLY status o")).toBe("STUB-REPLY status o");
    expect(s.strip("f the narrow panel")).toBe("f the narrow panel");
  });

  it("never touches later deltas once the echo diverges", () => {
    const s = createEchoStripper("What can you see?");
    expect(s.strip("What can you fix?")).toBe("What can you fix?");
    expect(s.strip("seen any bugs?")).toBe("seen any bugs?");
  });

  it("releases text held across deltas when a partial echo diverges", () => {
    const s = createEchoStripper("What can you see?");
    expect(s.strip("What can yo")).toBe("");
    expect(s.strip("u help")).toBe("What can you help");
    expect(s.strip(" me please")).toBe(" me please"); // disarmed — untouched
  });

  it("flush() returns a reply that ended mid-echo", () => {
    const s = createEchoStripper("yes, go ahead");
    expect(s.strip("Yes")).toBe("");
    expect(s.flush()).toBe("Yes");
    expect(s.flush()).toBe("");
    expect(s.strip(" go ahead")).toBe(" go ahead"); // disarmed after flush
  });

  it("flush() is empty after a complete echo", () => {
    const s = createEchoStripper("What can you see?");
    expect(s.strip("What can you see? ")).toBe("");
    expect(s.flush()).toBe("");
    expect(s.strip("The board.")).toBe("The board.");
  });
});
