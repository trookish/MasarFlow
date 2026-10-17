import { describe, it, expect } from "vitest";
import {
  formatWorkspaceContext,
  type WorkspaceSnapshot,
} from "@/lib/ai/context";
import {
  projectSchema,
  taskSchema,
  noteSchema,
  linkSchema,
  canvasSchema,
  activitySchema,
} from "@/lib/db/schema";

function snapshot(over: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot {
  return {
    project: projectSchema.parse({ id: "p1", name: "Test Project", slug: "t", createdAt: 0, updatedAt: 0 }),
    notes: [], specs: [], tasks: [], sprints: [], standards: [], systems: [],
    memories: [], devLogs: [], docs: [], commits: [],
    ...over,
  };
}

const task = taskSchema.parse({ id: "t1", projectId: "p1", title: "Fix login", createdAt: 0, updatedAt: 0 });
const note = noteSchema.parse({ id: "n1", projectId: "p1", title: "Auth design", body: "", createdAt: 0, updatedAt: 0 });

describe("formatWorkspaceContext — v2", () => {
  it("puts 'Currently open' before every data section", () => {
    const text = formatWorkspaceContext(snapshot({ tasks: [task] }), {
      activeText: "## Currently open\nFocused: Task Boards\n",
    });
    expect(text).toContain("Focused: Task Boards");
    expect(text.indexOf("## Currently open")).toBeLessThan(text.indexOf("## Tasks"));
  });

  it("keeps 'Currently open' when the budget is tight", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      taskSchema.parse({
        id: `t${i}`, projectId: "p1", title: `Task number ${i}`,
        description: "x".repeat(150), createdAt: 0, updatedAt: 0,
      }),
    );
    const text = formatWorkspaceContext(snapshot({ tasks: many }), {
      activeText: "## Currently open\nFocused: Task Boards\n",
      budget: 700,
    });
    expect(text).toContain("Focused: Task Boards");
  });

  it("still inlines note bodies (Fuse fallback) when RAG returns only other kinds", () => {
    const n = noteSchema.parse({
      id: "n1", projectId: "p1", title: "Auth design",
      body: "We use JWT tokens for authentication.", createdAt: 0, updatedAt: 1,
    });
    const text = formatWorkspaceContext(snapshot({ notes: [n] }), {
      query: "authentication",
      ragChunks: [{ entityId: "t1", kind: "task", title: "Fix login", text: "x", score: 0.5 }],
    });
    expect(text).toContain("JWT tokens");
  });

  it("lists knowledge-graph links with entity titles", () => {
    const link = linkSchema.parse({
      id: "l1", projectId: "p1", sourceType: "task", sourceId: "t1",
      targetType: "note", targetId: "n1", linkType: "implements", createdAt: 0,
    });
    const text = formatWorkspaceContext(snapshot({ tasks: [task], notes: [note], links: [link] }));
    expect(text).toContain("## Links");
    expect(text).toContain('task "Fix login" —implements→ note "Auth design"');
  });

  it("lists canvases and recent activity", () => {
    const canvas = canvasSchema.parse({ id: "c1", projectId: "p1", name: "Flow", createdAt: 0, updatedAt: 0 });
    const act = activitySchema.parse({
      id: "a1", projectId: "p1", entityKind: "task", entityId: "t1",
      op: "created", summary: 'Created task "Fix login"', createdAt: 5,
    });
    const text = formatWorkspaceContext(snapshot({ canvases: [canvas], activity: [act] }));
    expect(text).toContain("## Canvases");
    expect(text).toContain("- Flow");
    expect(text).toContain("## Recent activity");
    expect(text).toContain('Created task "Fix login"');
  });

  it("inlines RAG passages of kinds other than note/doc", () => {
    const text = formatWorkspaceContext(snapshot(), {
      ragChunks: [{ entityId: "t1", kind: "task", title: "Fix login", text: "Redirect loops when the token expires.", score: 0.9 }],
    });
    expect(text).toContain("## Relevant passages");
    expect(text).toContain('[task] "Fix login": Redirect loops when the token expires.');
  });
});
