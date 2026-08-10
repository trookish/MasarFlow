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
  it("seeds three demo projects — web app, game, desktop — with interlinked content", async () => {
    const id = await seedDemoProject();

    // The primary project is the web app demo (Pulse).
    expect(id).toBeTruthy();
    const project = await db.projects.get(id);
    expect(project?.slug).toBe("pulse-realtime-team-dashboard");
    expect(await db.projects.count()).toBe(3);
    const slugs = (await db.projects.toArray()).map((p) => p.slug).sort();
    expect(slugs).toEqual([
      "draftdeck-markdown-desktop-editor",
      "lumen-echoes-of-the-last-forge",
      "pulse-realtime-team-dashboard",
    ]);

    // Counts across every module for the primary (web) project.
    expect(await count(notesRepo.listByProject(id))).toBe(4);
    expect(await count(specsRepo.listByProject(id))).toBe(2);
    expect(await count(tasksRepo.listByProject(id))).toBe(6);
    expect(await count(sprintsRepo.listByProject(id))).toBe(1);
    expect(await count(systemsRepo.listByProject(id))).toBe(4);
    expect(await count(standardsRepo.listByProject(id))).toBe(2);
    expect(await count(docsRepo.listByProject(id))).toBe(2);
    expect(await count(devLogsRepo.listByProject(id))).toBe(3);
    expect(await count(memoriesRepo.listByProject(id))).toBe(2);
    expect(await count(commitsRepo.listByProject(id))).toBe(2);
    expect(await count(watchEventsRepo.listByProject(id))).toBe(3);
    expect(await count(syncRepo.listByProject(id))).toBe(4);
    expect(await count(canvasRepo.listByProject(id))).toBe(1);
    expect(await count(chatThreadsRepo.listByProject(id))).toBe(1);
    expect(await count(workflowRepo.listRuns(id))).toBe(1);
    expect(await db.workflowSteps.count()).toBe(48); // 16-step pipeline × 3 projects

    // Game (Lumen) and desktop (DraftDeck) demos are populated too.
    const game = await db.projects.where("slug").equals("lumen-echoes-of-the-last-forge").first();
    const desktop = await db.projects.where("slug").equals("draftdeck-markdown-desktop-editor").first();
    expect(game).toBeTruthy();
    expect(desktop).toBeTruthy();
    expect(await count(systemsRepo.listByProject(game!.id))).toBe(10);
    expect(await count(systemsRepo.listByProject(desktop!.id))).toBe(3);
    expect(await count(notesRepo.listByProject(game!.id))).toBe(8);
    expect(await count(notesRepo.listByProject(desktop!.id))).toBe(3);
    expect(await count(specsRepo.listByProject(game!.id))).toBe(5);
    expect(await count(specsRepo.listByProject(desktop!.id))).toBe(2);
    expect(await count(chatThreadsRepo.listByProject(desktop!.id))).toBe(1);

    // One shared demo AI connection across all projects.
    expect(await aiConnectionsRepo.list()).toHaveLength(1);

    // Architecture positions were saved for the systems.
    const positions = await archRepo.positions(id);
    expect(Object.keys(positions).length).toBe(4);

    // Wikilinks resolved into real edges in the knowledge graph.
    expect((await linksRepo.listByProject(id)).length).toBeGreaterThan(0);

    // Notes carry excerpts (markdown was processed).
    const notes = await notesRepo.listByProject(id);
    expect(notes.some((n) => n.excerpt.length > 0)).toBe(true);

    // Spec progress was recomputed from linked tasks.
    const specs = await specsRepo.listByProject(id);
    const realtime = specs.find((s) => s.number === "SPEC-001");
    expect(realtime?.implementationProgress).toBeGreaterThan(0);
  });

  it("is idempotent — a second run returns the same projects without duplicating", async () => {
    const first = await seedDemoProject();
    const second = await seedDemoProject();
    expect(second).toBe(first);
    expect(await db.projects.count()).toBe(3);
    expect(await db.notes.count()).toBe(15); // 4 web + 8 game + 3 desktop
    expect(await db.specs.count()).toBe(9); // 2 web + 5 game + 2 desktop
    expect(await aiConnectionsRepo.list()).toHaveLength(1);
  });

  it("deletes cleanly via projectsRepo.remove (cascade)", async () => {
    await seedDemoProject();
    const projects = await db.projects.toArray();
    for (const p of projects) {
      await projectsRepo.remove(p.id);
    }
    expect(await db.projects.count()).toBe(0);
    expect(await db.notes.count()).toBe(0);
    expect(await db.specs.count()).toBe(0);
    expect(await db.tasks.count()).toBe(0);
    // The shared demo connection survives (it is not project-scoped).
    expect(await aiConnectionsRepo.list()).toHaveLength(1);
  });
});
