import { describe, it, expect } from "vitest";
import {
  formatWorkspaceContext,
  buildAssistantSystemPrompt,
  type RagChunk,
  type WorkspaceSnapshot,
} from "@/lib/ai/context";
import { noteSchema, docSchema, projectSchema } from "@/lib/db/schema";

function snapshot(over: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot {
  return {
    project: projectSchema.parse({
      id: "p1",
      name: "Test Project",
      slug: "test-project",
      createdAt: 0,
      updatedAt: 0,
    }),
    notes: [],
    specs: [],
    tasks: [],
    sprints: [],
    standards: [],
    systems: [],
    memories: [],
    devLogs: [],
    docs: [],
    commits: [],
    ...over,
  };
}

describe("formatWorkspaceContext — RAG chunks", () => {
  it("falls back to Fuse-based pickFullBodies when no ragChunks are given", () => {
    const notes = [
      noteSchema.parse({
        id: "n1",
        projectId: "p1",
        title: "Auth design",
        body: "We use JWT tokens for authentication.",
        createdAt: 0,
        updatedAt: 2,
      }),
      noteSchema.parse({
        id: "n2",
        projectId: "p1",
        title: "Unrelated",
        body: "A note about something else entirely.",
        createdAt: 0,
        updatedAt: 1,
      }),
    ];
    const text = formatWorkspaceContext(snapshot({ notes }), {
      query: "authentication",
    });
    expect(text).toContain("## Brain notes");
    // Both notes are inlined (fullBodies default is 6, more than 2 notes).
    expect(text).toContain("JWT tokens");
  });

  it("uses ragChunks to build the full-body note section instead of the raw clipped body", () => {
    const notes = [
      noteSchema.parse({
        id: "n1",
        projectId: "p1",
        title: "Auth design",
        body: "Full raw body text that would normally be clipped and inlined verbatim.",
        createdAt: 0,
        updatedAt: 1,
      }),
    ];
    const ragChunks: RagChunk[] = [
      {
        entityId: "n1",
        kind: "note",
        title: "Auth design",
        text: "A real retrieved passage about JWT rotation.",
        score: 0.9,
      },
    ];
    const text = formatWorkspaceContext(snapshot({ notes }), {
      query: "jwt rotation",
      ragChunks,
    });
    expect(text).toContain("A real retrieved passage about JWT rotation.");
    expect(text).not.toContain(
      "Full raw body text that would normally be clipped",
    );
  });

  it("groups multiple chunks from the same entity together, joined with a separator", () => {
    const docs = [
      docSchema.parse({
        id: "d1",
        projectId: "p1",
        title: "Deployment guide",
        slug: "deployment-guide",
        category: "guide",
        body: "raw",
        createdAt: 0,
        updatedAt: 1,
      }),
    ];
    const ragChunks: RagChunk[] = [
      {
        entityId: "d1",
        kind: "doc",
        title: "Deployment guide",
        text: "Step one.",
        score: 0.8,
      },
      {
        entityId: "d1",
        kind: "doc",
        title: "Deployment guide",
        text: "Step two.",
        score: 0.7,
      },
    ];
    const text = formatWorkspaceContext(snapshot({ docs }), {
      query: "how to deploy",
      ragChunks,
    });
    expect(text).toContain("Step one.");
    expect(text).toContain("Step two.");
  });

  it("only affects notes/docs — other sections are unchanged by ragChunks", () => {
    const withoutRag = formatWorkspaceContext(snapshot(), { query: "x" });
    const withRag = formatWorkspaceContext(snapshot(), {
      query: "x",
      ragChunks: [],
    });
    expect(withRag).toBe(withoutRag);
  });
});

describe("buildAssistantSystemPrompt — hybrid toolbelt (OpenCode + workspace functions)", () => {
  it("lists the real workspace functions alongside the fs tools", () => {
    const text = buildAssistantSystemPrompt("briefing text", {
      withTools: true,
      toolbelt: "hybrid",
      workspaceTools: [
        { name: "create_note", description: "Create a brain note." },
        { name: "read_spec", description: "Read a specification." },
      ],
      filesystemTools: [
        { id: "read", description: "Read a file from disk." },
        { id: "bash", description: "Run a shell command." },
        { id: "question", description: "Ask the user something." },
      ],
    });
    expect(text).toContain("WORKSPACE FUNCTIONS");
    expect(text).toContain("create_note");
    expect(text).toContain("read_spec");
    expect(text).toContain("mutates your MasarFlow project");
    expect(text).toContain("FILESYSTEM/SHELL TOOLS");
    expect(text).toContain("read");
    expect(text).toContain("REQUIRES user approval");
    expect(text).toContain("question");
    // The hybrid belt must NOT claim the workspace is read-only.
    expect(text).not.toContain("NO tools to mutate");
    expect(text).not.toContain("read-only context");
  });

  it("handles a hybrid belt with no registered workspace functions gracefully", () => {
    const text = buildAssistantSystemPrompt("briefing", {
      withTools: true,
      toolbelt: "hybrid",
      filesystemTools: [{ id: "bash", description: "Shell" }],
    });
    expect(text).toContain("(none registered on this server");
  });

  it("keeps the filesystem belt read-only when used alone", () => {
    const text = buildAssistantSystemPrompt("briefing", {
      withTools: true,
      toolbelt: "filesystem",
      filesystemTools: [{ id: "read", description: "Read." }],
    });
    expect(text).toContain("NO tools to mutate");
  });
});
