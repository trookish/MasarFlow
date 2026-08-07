import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { seedDemoProject } from "@/lib/db/demo-seed";
import {
  notesRepo,
  specsRepo,
  tasksRepo,
  sprintsRepo,
  systemsRepo,
  standardsRepo,
  docsRepo,
  devLogsRepo,
  memoriesRepo,
  commitsRepo,
  linksRepo,
  canvasRepo,
  syncRepo,
  watchEventsRepo,
  aiConnectionsRepo,
  chatThreadsRepo,
  workflowRepo,
  archRepo,
  projectsRepo,
} from "@/lib/db/repos";

async function count<T>(p: Promise<T[]>): Promise<number> {
  return (await p).length;
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("seedDemoProject", () => {
  it("seeds every surface with interlinked content", async () => {
    const id = await seedDemoProject();

    // Project itself.
    expect(id).toBeTruthy();
    const project = await db.projects.get(id);
    expect(project?.slug).toBe("lumen-echoes-of-the-last-forge");
    expect(await db.projects.count()).toBe(1);

    // Counts across every module.
    expect(await count(notesRepo.listByProject(id))).toBe(8);
    expect(await count(specsRepo.listByProject(id))).toBe(5);
    expect(await count(tasksRepo.listByProject(id))).toBeGreaterThanOrEqual(12);
    expect(await count(sprintsRepo.listByProject(id))).toBe(3);
    expect(await count(systemsRepo.listByProject(id))).toBe(10);
    expect(await count(standardsRepo.listByProject(id))).toBe(4);
    expect(await count(docsRepo.listByProject(id))).toBe(3);
    expect(await count(devLogsRepo.listByProject(id))).toBe(6);
    expect(await count(memoriesRepo.listByProject(id))).toBe(5);
    expect(await count(commitsRepo.listByProject(id))).toBe(3);
    expect(await count(watchEventsRepo.listByProject(id))).toBe(6);
    expect(await count(syncRepo.listByProject(id))).toBe(8);
    expect(await count(canvasRepo.listByProject(id))).toBe(1);
    expect(await db.canvasNodes.count()).toBeGreaterThanOrEqual(4);
    expect(await db.canvasEdges.count()).toBeGreaterThanOrEqual(3);

    // AI surfaces.
    expect(await aiConnectionsRepo.list()).toHaveLength(1);
    expect(await count(chatThreadsRepo.listByProject(id))).toBe(1);
    expect(await db.chatMessages.count()).toBe(2);
    expect(await count(workflowRepo.listRuns(id))).toBe(1);
    expect(await db.workflowSteps.count()).toBe(16); // the 16-step pipeline

    // Architecture positions were saved for the systems.
    const positions = await archRepo.positions(id);
    expect(Object.keys(positions).length).toBe(9);

    // Wikilinks resolved into real edges in the knowledge graph.
    expect((await linksRepo.listByProject(id)).length).toBeGreaterThan(0);

    // Notes carry excerpts (markdown was processed).
    const notes = await notesRepo.listByProject(id);
    expect(notes.some((n) => n.excerpt.length > 0)).toBe(true);

    // Spec progress was recomputed from linked tasks.
    const specs = await specsRepo.listByProject(id);
    const movement = specs.find((s) => s.number === "SPEC-001");
    expect(movement?.implementationProgress).toBe(100);
  });

  it("is idempotent — a second run returns the same project without duplicating", async () => {
    const first = await seedDemoProject();
    const second = await seedDemoProject();
    expect(second).toBe(first);
    expect(await db.projects.count()).toBe(1);
    expect(await db.notes.count()).toBe(8);
    expect(await db.specs.count()).toBe(5);
  });

  it("deletes cleanly via projectsRepo.remove (cascade)", async () => {
    const id = await seedDemoProject();
    await projectsRepo.remove(id);
    expect(await db.projects.count()).toBe(0);
    expect(await db.notes.count()).toBe(0);
    expect(await db.specs.count()).toBe(0);
    expect(await db.tasks.count()).toBe(0);
  });
});
