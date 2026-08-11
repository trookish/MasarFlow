/**
 * executeWorkspaceTool coverage — every function family, exercised against
 * fake-indexeddb exactly like the repo tests. Focuses on the correctness
 * guarantees the AI layer depends on: real create/read/update semantics,
 * empty-string fields actually clearing, project scoping on id-based reads,
 * reference validation, and required-argument failures.
 */

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  notesRepo,
  foldersRepo,
  specsRepo,
  tasksRepo,
  sprintsRepo,
  docsRepo,
  standardsRepo,
  systemsRepo,
  canvasRepo,
  devLogsRepo,
  memoriesRepo,
  commitsRepo,
  linksRepo,
} from "@/lib/db/repos";
import { executeWorkspaceTool } from "@/lib/ai/tools";
import type { ToolCallRequest } from "@/lib/ai/tools";

const PROJECT = "tools-test-project";
const OTHER = "tools-other-project";

function call(name: string, args: Record<string, unknown>): ToolCallRequest {
  return { id: `call-${name}`, name, arguments: args };
}

async function run(name: string, args: Record<string, unknown>) {
  return JSON.parse(await executeWorkspaceTool(PROJECT, call(name, args)));
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("search_workspace", () => {
  it("returns fuzzy matches from the local index (fallback when the AI service is down)", async () => {
    await notesRepo.create({
      projectId: PROJECT,
      title: "Auth design",
      body: "JWT tokens for logins",
    });
    const res = await run("search_workspace", { query: "jwt" });
    expect(res.ok).toBe(true);
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results[0].title).toBe("Auth design");
  });

  it("fails without a query", async () => {
    const res = await run("search_workspace", {});
    expect(res.ok).toBe(false);
  });
});

describe("notes", () => {
  it("creates and reads a note by id and by title", async () => {
    const created = await run("create_note", {
      title: "My Note",
      body: "hello",
      tags: ["ai"],
    });
    expect(created.ok).toBe(true);

    const byId = await run("read_note", { id: created.id });
    expect(byId.ok).toBe(true);
    expect(byId.note.body).toBe("hello");
    expect(byId.note.tags).toEqual(["ai"]);

    const byTitle = await run("read_note", { title: "my note" });
    expect(byTitle.ok).toBe(true);
    expect(byTitle.note.id).toBe(created.id);
  });

  it("rejects reads of another project's note by id", async () => {
    const foreign = await notesRepo.create({
      projectId: OTHER,
      title: "Foreign",
      body: "x",
    });
    const res = await run("read_note", { id: foreign.id });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not found/i);
  });

  it("requires a title", async () => {
    const res = await run("create_note", { body: "no title" });
    expect(res.ok).toBe(false);
  });

  it("validates the folder on create", async () => {
    const res = await run("create_note", {
      title: "Bad folder",
      body: "x",
      folderId: "folder-nope",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/folder not found/i);

    const folder = await foldersRepo.create({
      projectId: PROJECT,
      name: "Root",
      parentId: null,
    });
    const good = await run("create_note", {
      title: "Good folder",
      body: "x",
      folderId: folder.id,
    });
    expect(good.ok).toBe(true);
  });

  it("updates title, body, tags and moves folders", async () => {
    const created = await run("create_note", { title: "Before", body: "old" });
    const res = await run("update_note", {
      id: created.id,
      title: "After",
      body: "new body",
      tags: ["a", "b"],
    });
    expect(res.ok).toBe(true);
    const note = await notesRepo.get(created.id);
    expect(note?.title).toBe("After");
    expect(note?.body).toBe("new body");
    expect(note?.tags).toEqual(["a", "b"]);
  });

  it("clears the body when an empty string is passed (never silently ignored)", async () => {
    const created = await run("create_note", { title: "N", body: "content" });
    const res = await run("update_note", { id: created.id, body: "" });
    expect(res.ok).toBe(true);
    expect((await notesRepo.get(created.id))?.body).toBe("");
  });

  it("appends to the body with appendBody", async () => {
    const created = await run("create_note", { title: "N", body: "first" });
    await run("update_note", { id: created.id, appendBody: "second" });
    expect((await notesRepo.get(created.id))?.body).toBe("first\n\nsecond");
  });

  it("clears the folder when an empty folderId is passed", async () => {
    const folder = await foldersRepo.create({
      projectId: PROJECT,
      name: "F",
      parentId: null,
    });
    const created = await run("create_note", {
      title: "N",
      body: "x",
      folderId: folder.id,
    });
    await run("update_note", { id: created.id, folderId: "" });
    expect((await notesRepo.get(created.id))?.folderId).toBeNull();
  });

  it("fails updates for another project's note", async () => {
    const foreign = await notesRepo.create({
      projectId: OTHER,
      title: "F",
      body: "x",
    });
    const res = await run("update_note", { id: foreign.id, body: "y" });
    expect(res.ok).toBe(false);
  });
});

describe("specs", () => {
  it("assigns sequential RFC numbers and reads by number", async () => {
    const a = await run("create_spec", { title: "One", purpose: "p" });
    const b = await run("create_spec", { title: "Two", purpose: "p" });
    expect(a.number).toBe("RFC-001");
    expect(b.number).toBe("RFC-002");

    const res = await run("read_spec", { number: "rfc-002" });
    expect(res.ok).toBe(true);
    expect(res.spec.title).toBe("Two");
  });

  it("requires title and purpose", async () => {
    expect((await run("create_spec", { title: "T" })).ok).toBe(false);
    expect((await run("create_spec", { purpose: "p" })).ok).toBe(false);
  });

  it("clears purpose and technical notes with empty strings", async () => {
    const created = await run("create_spec", {
      title: "S",
      purpose: "why",
      technicalNotes: "notes",
    });
    const res = await run("update_spec", {
      id: created.id,
      purpose: "",
      technicalNotes: "",
    });
    expect(res.ok).toBe(true);
    const spec = await specsRepo.get(created.id);
    expect(spec?.purpose).toBe("");
    expect(spec?.technicalNotes).toBe("");
  });

  it("scopes id-based reads to the project", async () => {
    const foreign = await specsRepo.create({
      projectId: OTHER,
      number: "RFC-001",
      title: "Foreign spec",
      purpose: "p",
    });
    const res = await run("read_spec", { id: foreign.id });
    expect(res.ok).toBe(false);
  });
});

describe("tasks", () => {
  it("creates a task linked to a spec by number and recomputes spec progress", async () => {
    const spec = await run("create_spec", { title: "Spec", purpose: "p" });
    const task = await run("create_task", {
      title: "Implement",
      specNumber: "RFC-001",
      status: "done",
    });
    expect(task.ok).toBe(true);
    const reloaded = await specsRepo.get(spec.id);
    expect(reloaded?.implementationProgress).toBe(100);
  });

  it("rejects an unknown spec number instead of silently unlinking", async () => {
    const res = await run("create_task", { title: "T", specNumber: "RFC-999" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/spec not found/i);
  });

  it("validates the sprint on create", async () => {
    const res = await run("create_task", {
      title: "T",
      sprintId: "sprint-nope",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/sprint not found/i);
  });

  it("clears description with an empty string and moves/clears sprints", async () => {
    const sprint = await sprintsRepo.create({
      projectId: PROJECT,
      name: "S1",
      goal: "",
      status: "planned",
      startDate: null,
      endDate: null,
    });
    const task = await run("create_task", {
      title: "T",
      description: "desc",
      sprintId: sprint.id,
    });
    expect((await tasksRepo.get(task.id))?.sprintId).toBe(sprint.id);

    await run("update_task", { id: task.id, description: "" });
    expect((await tasksRepo.get(task.id))?.description).toBe("");

    await run("update_task", { id: task.id, sprintId: null });
    expect((await tasksRepo.get(task.id))?.sprintId).toBeNull();
  });

  it("sets progress to 100 when marked done", async () => {
    const task = await run("create_task", { title: "T" });
    await run("update_task", { id: task.id, status: "done" });
    expect((await tasksRepo.get(task.id))?.progress).toBe(100);
  });
});

describe("sprints, systems, standards, canvases, folders", () => {
  it("clears a sprint goal with an empty string", async () => {
    const sprint = await sprintsRepo.create({
      projectId: PROJECT,
      name: "S",
      goal: "g",
      status: "planned",
      startDate: null,
      endDate: null,
    });
    const res = await run("update_sprint", { id: sprint.id, goal: "" });
    expect(res.ok).toBe(true);
    expect((await sprintsRepo.get(sprint.id))?.goal).toBe("");
  });

  it("clears a system description/category with empty strings", async () => {
    const system = await systemsRepo.create({
      projectId: PROJECT,
      name: "Svc",
      description: "d",
      category: "service",
      status: "active",
      health: 90,
      dependencies: [],
    });
    await run("update_system", {
      id: system.id,
      description: "",
      category: "",
    });
    const reloaded = await systemsRepo.get(system.id);
    expect(reloaded?.description).toBe("");
    expect(reloaded?.category).toBe("");
  });

  it("clears a standard rule/pattern with empty strings", async () => {
    const standard = await standardsRepo.create({
      projectId: PROJECT,
      title: "No globals",
      rule: "no globals",
      category: "patterns",
      examples: [],
      enforced: true,
      pattern: "window\\.",
    });
    await run("update_standard", { id: standard.id, rule: "", pattern: "" });
    const reloaded = await standardsRepo.get(standard.id);
    expect(reloaded?.rule).toBe("");
    expect(reloaded?.pattern).toBe("");
  });

  it("clears a canvas description with an empty string", async () => {
    const canvas = await canvasRepo.create({
      projectId: PROJECT,
      name: "C",
      description: "d",
    });
    await run("update_canvas", { id: canvas.id, description: "" });
    expect((await canvasRepo.get(canvas.id))?.description).toBe("");
  });

  it("creates and renames folders", async () => {
    const folder = await run("create_folder", { name: "Brain" });
    expect(folder.ok).toBe(true);
    const res = await run("update_folder", { id: folder.id, name: "Notes" });
    expect(res.ok).toBe(true);
    expect((await foldersRepo.listByProject(PROJECT))[0].name).toBe("Notes");
  });
});

describe("docs, dev logs, memories", () => {
  it("creates docs and clears body/category with empty strings", async () => {
    const doc = await run("create_doc", {
      title: "Guide",
      body: "content",
      category: "guides",
    });
    expect(doc.ok).toBe(true);
    await run("update_doc", { id: doc.id, body: "", category: "" });
    const reloaded = await docsRepo.get(doc.id);
    expect(reloaded?.body).toBe("");
    expect(reloaded?.category).toBe("");
  });

  it("creates and updates dev logs (empty body clears)", async () => {
    const log = await run("create_devlog", {
      title: "Milestone",
      body: "details",
    });
    expect(log.ok).toBe(true);
    await run("update_devlog", { id: log.id, body: "" });
    expect((await devLogsRepo.get(log.id))?.body).toBe("");
  });

  it("creates and updates memories (empty content clears)", async () => {
    const memory = await run("create_memory", {
      content: "fact one",
      type: "fact",
    });
    expect(memory.ok).toBe(true);
    await run("update_memory", {
      id: memory.id,
      content: "",
      type: "lesson",
      weight: 0.9,
    });
    const reloaded = await memoriesRepo.get(memory.id);
    expect(reloaded?.content).toBe("");
    expect(reloaded?.type).toBe("lesson");
    expect(reloaded?.weight).toBe(0.9);
  });

  it("scopes memory/devlog reads to the project", async () => {
    const foreignMemory = await memoriesRepo.create({
      projectId: OTHER,
      content: "x",
      type: "fact",
      tags: [],
      weight: 0.5,
    });
    expect((await run("read_memory", { id: foreignMemory.id })).ok).toBe(false);
    const foreignLog = await devLogsRepo.create({
      projectId: OTHER,
      type: "agent",
      title: "t",
      body: "",
    });
    expect((await run("read_devlog", { id: foreignLog.id })).ok).toBe(false);
  });
});

describe("commits", () => {
  it("annotates a commit and clears the AI summary with an empty string", async () => {
    const commit = await commitsRepo.create({
      projectId: PROJECT,
      sha: "abc123",
      message: "feat: x",
      date: 1,
    });
    await run("update_commit", { id: commit.id, aiSummary: "did things" });
    expect((await commitsRepo.get(commit.id))?.aiSummary).toBe("did things");

    await run("update_commit", { id: commit.id, aiSummary: "" });
    expect((await commitsRepo.get(commit.id))?.aiSummary).toBe("");
  });

  it("rejects reads of another project's commit", async () => {
    const foreign = await commitsRepo.create({
      projectId: OTHER,
      sha: "def",
      message: "m",
      date: 1,
    });
    expect((await run("read_commit", { id: foreign.id })).ok).toBe(false);
  });
});

describe("links", () => {
  it("creates and removes knowledge-graph links", async () => {
    const note = await notesRepo.create({
      projectId: PROJECT,
      title: "N",
      body: "x",
    });
    const spec = await specsRepo.create({
      projectId: PROJECT,
      number: "RFC-001",
      title: "S",
      purpose: "p",
    });

    const link = await run("create_link", {
      sourceType: "note",
      sourceId: note.id,
      targetType: "spec",
      targetId: spec.id,
      linkType: "implements",
    });
    expect(link.ok).toBe(true);

    const listed = await run("list_links", {});
    expect(listed.ok).toBe(true);
    expect(listed.links).toHaveLength(1);

    const removed = await run("remove_link", { id: link.id });
    expect(removed.ok).toBe(true);
    expect(await linksRepo.listByProject(PROJECT)).toHaveLength(0);
  });

  it("fails to remove an unknown or foreign link", async () => {
    expect((await run("remove_link", { id: "nope" })).ok).toBe(false);
    const foreign = await linksRepo.create({
      projectId: OTHER,
      sourceType: "note",
      sourceId: "a",
      targetType: "note",
      targetId: "b",
      linkType: "reference",
    });
    expect((await run("remove_link", { id: foreign.id })).ok).toBe(false);
  });
});

describe("argument validation", () => {
  it("fails unknown tools", async () => {
    const res = await run("definitely_not_a_tool", {});
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/unknown tool/i);
  });

  it("fails missing required arguments", async () => {
    expect((await run("create_note", {})).ok).toBe(false);
    expect((await run("update_note", { body: "x" })).ok).toBe(false);
    expect((await run("read_spec", {})).ok).toBe(false);
  });

  it("fails non-string arguments where strings are required", async () => {
    const res = await run("create_note", { title: 42, body: "x" });
    expect(res.ok).toBe(false);
  });
});
