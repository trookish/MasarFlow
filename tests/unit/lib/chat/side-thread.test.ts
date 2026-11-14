import { describe, it, expect } from "vitest";
import type { ChatMessage } from "@/lib/db/schema";
import {
  inheritedMessages,
  isSideThread,
  sideLinkFor,
  sideThreadTitle,
  turnContextMessages,
} from "@/lib/chat/side-thread";

const msg = (id: string, createdAt: number, content = id): ChatMessage =>
  ({
    id,
    threadId: "main",
    role: "user",
    content,
    toolActivity: [],
    attachments: [],
    notices: [],
    files: [],
    createdAt,
  }) as unknown as ChatMessage;

const main = [msg("m1", 1), msg("m2", 2), msg("m3", 3), msg("m4", 4)];

describe("sideLinkFor", () => {
  it("links to the main thread and the branch message", () => {
    expect(sideLinkFor({ id: "main" }, main[1])).toEqual({
      threadId: "main",
      messageId: "m2",
      messageCreatedAt: 2,
    });
  });

  it("refuses to branch from a side chat", () => {
    const link = { threadId: "main", messageId: "m1", messageCreatedAt: 1 };
    expect(sideLinkFor({ id: "side", sideOf: link }, main[0])).toBeNull();
  });
});

describe("isSideThread", () => {
  it("is true only for threads with a link", () => {
    expect(isSideThread({ sideOf: undefined })).toBe(false);
    expect(isSideThread(null)).toBe(false);
    expect(
      isSideThread({
        sideOf: { threadId: "a", messageId: "b", messageCreatedAt: 1 },
      }),
    ).toBe(true);
  });
});

describe("inheritedMessages", () => {
  const link = { threadId: "main", messageId: "m2", messageCreatedAt: 2 };

  it("shares context up to and including the branch message", () => {
    expect(inheritedMessages(main, link).map((m) => m.id)).toEqual([
      "m1",
      "m2",
    ]);
  });

  it("falls back to the creation time when the branch message is gone", () => {
    const without = main.filter((m) => m.id !== "m2");
    expect(inheritedMessages(without, link).map((m) => m.id)).toEqual(["m1"]);
  });
});

describe("turnContextMessages", () => {
  it("returns only the thread's own messages for a main thread", () => {
    const own = [msg("m1", 1)];
    expect(turnContextMessages({ sideOf: undefined }, own, main)).toEqual(own);
  });

  it("prefixes a side chat with the inherited context and never mutates the main list", () => {
    const before = main.map((m) => m.id);
    const side = [msg("s1", 10), msg("s2", 11)];
    const out = turnContextMessages(
      { sideOf: { threadId: "main", messageId: "m3", messageCreatedAt: 3 } },
      side,
      main,
    );
    expect(out.map((m) => m.id)).toEqual(["m1", "m2", "m3", "s1", "s2"]);
    expect(main.map((m) => m.id)).toEqual(before);
  });
});

describe("sideThreadTitle", () => {
  it("names the side chat after the branch message", () => {
    expect(sideThreadTitle({ content: "  Why   the\nbackpressure? " })).toBe(
      "Side chat: Why the backpressure?",
    );
  });

  it("truncates long messages and handles an empty one", () => {
    expect(sideThreadTitle({ content: "x".repeat(60) })).toBe(
      `Side chat: ${"x".repeat(40)}…`,
    );
    expect(sideThreadTitle({ content: "  " })).toBe("Side chat");
  });
});
