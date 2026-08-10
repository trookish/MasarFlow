import { describe, it, expect } from "vitest";
import {
  attachmentsToWire,
  buildLegacyMessages,
  dataUrlToWireImage,
  providerForConnection,
} from "@/lib/ai/chat-backends";
import { FALLBACK_CATALOG } from "@/lib/ai/catalog";
import type { ChatAttachment, ChatMessage } from "@/lib/db/schema";

function msg(
  overrides: Partial<ChatMessage> &
    Pick<ChatMessage, "id" | "role" | "content" | "createdAt">,
): ChatMessage {
  return {
    threadId: "t1",
    status: "done",
    reasoning: "",
    error: null,
    toolActivity: [],
    attachments: [],
    notices: [],
    files: [],
    opencodeMessageId: "",
    ...overrides,
  };
}

describe("dataUrlToWireImage", () => {
  it("parses a base64 data URL into mime + payload", () => {
    expect(
      dataUrlToWireImage("data:image/png;base64,AAEC", "image/png"),
    ).toEqual({
      mimeType: "image/png",
      data: "AAEC",
    });
  });
  it("falls back to the provided mime type when the header is missing", () => {
    expect(dataUrlToWireImage("data:;base64,AAEC", "image/jpeg")).toEqual({
      mimeType: "image/jpeg",
      data: "AAEC",
    });
  });
  it("returns null for non-data URLs", () => {
    expect(
      dataUrlToWireImage("https://example.com/x.png", "image/png"),
    ).toBeNull();
  });
});

describe("attachmentsToWire", () => {
  it("splits images from inline text files", () => {
    const attachments: ChatAttachment[] = [
      {
        name: "shot.png",
        mimeType: "image/png",
        kind: "image",
        dataUrl: "data:image/png;base64,QUJD",
        textContent: "",
      },
      {
        name: "notes.txt",
        mimeType: "text/plain",
        kind: "file",
        dataUrl: "",
        textContent: "hello world",
      },
    ];
    const { text, images } = attachmentsToWire(attachments);
    expect(images).toEqual([{ mimeType: "image/png", data: "QUJD" }]);
    expect(text).toContain("notes.txt");
    expect(text).toContain("hello world");
  });

  it("ignores files without text content", () => {
    const { text, images } = attachmentsToWire([
      {
        name: "empty.txt",
        mimeType: "text/plain",
        kind: "file",
        dataUrl: "",
        textContent: "  ",
      },
    ]);
    expect(text).toBe("");
    expect(images).toEqual([]);
  });
});

describe("buildLegacyMessages", () => {
  it("replays user and assistant turns in order", () => {
    const out = buildLegacyMessages([
      msg({
        id: "m1",
        role: "user",
        content: "first",
        createdAt: 1,
        attachments: [
          {
            name: "a.txt",
            mimeType: "text/plain",
            kind: "file",
            dataUrl: "",
            textContent: "attached",
          },
        ],
      }),
      msg({ id: "m2", role: "assistant", content: "reply one", createdAt: 2 }),
      msg({ id: "m3", role: "user", content: "second", createdAt: 3 }),
    ]);
    expect(out).toEqual([
      {
        role: "user",
        content: "first\n\n--- a.txt ---\nattached",
        images: undefined,
      },
      { role: "assistant", content: "reply one" },
      { role: "user", content: "second", images: undefined },
    ]);
  });

  it("wraps reasoning into a thinking block before the answer", () => {
    const out = buildLegacyMessages([
      msg({
        id: "m1",
        role: "assistant",
        content: "answer",
        reasoning: "let me think",
        createdAt: 1,
      }),
    ]);
    expect(out).toEqual([
      {
        role: "assistant",
        content: "[thinking]\nlet me think\n[/thinking]\n\nanswer",
      },
    ]);
  });

  it("skips empty assistant bubbles and blank user messages", () => {
    const out = buildLegacyMessages([
      msg({ id: "m1", role: "assistant", content: "", createdAt: 1 }),
      msg({ id: "m2", role: "user", content: "  ", createdAt: 2 }),
      msg({ id: "m3", role: "assistant", content: "ok", createdAt: 3 }),
    ]);
    expect(out).toEqual([{ role: "assistant", content: "ok" }]);
  });

  it("carries images from stored user turns", () => {
    const out = buildLegacyMessages([
      msg({
        id: "m1",
        role: "user",
        content: "see this",
        createdAt: 1,
        attachments: [
          {
            name: "x.png",
            mimeType: "image/png",
            kind: "image",
            dataUrl: "data:image/png;base64,YWJj",
            textContent: "",
          },
        ],
      }),
    ]);
    expect(out[0]).toEqual({
      role: "user",
      content: "see this",
      images: [{ mimeType: "image/png", data: "YWJj" }],
    });
  });
});

describe("providerForConnection", () => {
  it("resolves a connection's provider from the catalog", () => {
    expect(
      providerForConnection(FALLBACK_CATALOG, { providerId: "anthropic" })?.id,
    ).toBe("anthropic");
  });
  it("returns null for unknown providers or missing connections", () => {
    expect(
      providerForConnection(FALLBACK_CATALOG, { providerId: "nope" }),
    ).toBeNull();
    expect(providerForConnection(FALLBACK_CATALOG, null)).toBeNull();
    expect(providerForConnection(FALLBACK_CATALOG, undefined)).toBeNull();
  });
});
