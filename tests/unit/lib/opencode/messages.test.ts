import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildPromptBody, buildPromptParts } from "@/lib/opencode/messages";

let tmpDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "masarflow-oc-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tmpDirs.map((d) => rm(d, { recursive: true, force: true })));
  tmpDirs = [];
});

describe("buildPromptParts", () => {
  it("produces a single text part without attachments", async () => {
    const dir = await makeTmpDir();
    const parts = await buildPromptParts({ text: "hello", sessionDir: dir });
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ type: "text", text: "hello" });
  });

  it("materializes image attachments into the session dir as file parts", async () => {
    const dir = await makeTmpDir();
    const bytes = Buffer.from("fake png bytes");
    const dataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
    const parts = await buildPromptParts({
      text: "what is this?",
      attachments: [{ name: "shot.png", mimeType: "image/png", kind: "image", dataUrl }],
      sessionDir: dir,
    });
    expect(parts).toHaveLength(2);
    const filePart = parts.find((p) => p.type === "file");
    expect(filePart).toBeDefined();
    if (filePart?.type === "file") {
      expect(filePart.mime).toBe("image/png");
      expect(filePart.url).toContain(dir);
      expect(filePart.url).toContain(".masarflow");
      expect(filePart.url).toContain("shot.png");
      const written = await readFile(filePart.url);
      expect(written.equals(bytes)).toBe(true);
    }
    expect(parts[0]).toEqual({ type: "text", text: "what is this?" });
  });

  it("inlines text attachments when no data URL is present", async () => {
    const dir = await makeTmpDir();
    const parts = await buildPromptParts({
      text: "summarize",
      attachments: [{ name: "notes.md", mimeType: "text/markdown", kind: "file", textContent: "line1\nline2" }],
      sessionDir: dir,
    });
    expect(parts).toHaveLength(1);
    expect((parts[0] as { text: string }).text).toContain("notes.md");
    expect((parts[0] as { text: string }).text).toContain("line1\nline2");
    expect((parts[0] as { text: string }).text).toContain("summarize");
  });

  it("sanitizes attachment filenames", async () => {
    const dir = await makeTmpDir();
    const parts = await buildPromptParts({
      text: "x",
      attachments: [{ name: "../../evil/name!.png", mimeType: "image/png", kind: "image", dataUrl: "data:image/png;base64,aGk=" }],
      sessionDir: dir,
    });
    const filePart = parts.find((p) => p.type === "file") as { url: string } | undefined;
    expect(filePart).toBeDefined();
    expect(filePart!.url).not.toContain("..");
  });
});

describe("buildPromptBody", () => {
  it("sets model, system, agent and tools", () => {
    const body = buildPromptBody(
      { text: "hi", system: "be terse", model: { providerID: "fake", modelID: "m1" }, agent: "general", tools: { read: false }, sessionDir: "d" },
      [{ type: "text", text: "hi" }],
    );
    expect(body.model).toEqual({ providerID: "fake", modelID: "m1" });
    expect(body.system).toBe("be terse");
    expect(body.agent).toBe("general");
    expect(body.tools).toEqual({ read: false });
  });

  it("omits empty optional fields", () => {
    const body = buildPromptBody({ text: "hi", sessionDir: "d" });
    expect(body.system).toBeUndefined();
    expect(body.model).toBeUndefined();
    expect(body.agent).toBeUndefined();
    expect(body.tools).toBeUndefined();
  });
});
