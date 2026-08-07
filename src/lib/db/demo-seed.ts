/**
 * Demo project seeder.
 *
 * Builds a single, cohesive sample project — "Lumen: Echoes of the Last
 * Forge", a 2D action-platformer — populated across every MasarFlow surface
 * (notes, specs, standards, tasks, sprints, systems, docs, dev logs,
 * memories, commits, canvas, watcher feed, sync index, chat, and the 16-step
 * workflow). The point is to make every page in the app light up with real,
 * interlinked content so the platform's capabilities are visible at a glance.
 *
 * Idempotent: a project with the demo slug is returned as-is if it already
 * exists, so "Load demo project" never creates duplicates.
 */

import { db } from "@/lib/db";
import {
  projectsRepo,
  foldersRepo,
  notesRepo,
  noteTemplatesRepo,
  specsRepo,
  standardsRepo,
  tasksRepo,
  sprintsRepo,
  systemsRepo,
  archRepo,
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
  chatMessagesRepo,
  workflowRepo,
} from "@/lib/db/repos";
import type { Assignee, EntityKind, TaskPriority, TaskStatus } from "@/lib/db/schema";

const DEMO_SLUG = "lumen-echoes-of-the-last-forge";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;

/** Epoch ms for `n` minutes ago. */
function ago(ms: number): number {
  return Date.now() - ms;
}

/** Seed the demo project and return its id. */
export async function seedDemoProject(): Promise<string> {
  // Idempotent: reuse an existing demo project instead of duplicating.
  const existing = await db.projects
    .where("slug")
    .equals(DEMO_SLUG)
    .first();
  if (existing) return existing.id;

  // One atomic transaction so the demo either lands complete or not at all.
  return db.transaction("rw", db.tables, async () => {
    const projectId = await seedCoreProject();
    await seedArchitecture(projectId);
    await seedFoldersAndNotes(projectId);
    await seedNoteTemplates(projectId);
    await seedStandards(projectId);
    const ctx = await seedSpecsSprintsTasks(projectId);
    await wireSpecLinks(projectId, ctx);
    await seedDocs(projectId);
    await seedDevLogs(projectId, ctx);
    await seedMemories(projectId, ctx);
    await seedCommits(projectId, ctx);
    await seedCanvas(projectId, ctx);
    await seedWatchEvents(projectId);
    await seedSyncFiles(projectId);
    const connectionId = await seedAiConnection();
    await seedChat(projectId, connectionId);
    await seedWorkflow(projectId, connectionId);
    return projectId;
  });
}

/* ── Project ──────────────────────────────────────────────────────────────── */

async function seedCoreProject(): Promise<string> {
  const project = await projectsRepo.create({
    name: "Lumen: Echoes of the Last Forge",
    slug: DEMO_SLUG,
    description:
      "A 2D action-platformer about a fading sun and the last spark that can reignite it. Combat, abilities, and a hand-drawn world.",
    health: 78,
    archScore: 84,
    techDebt: 22,
    accent: "amber",
    createdAt: ago(40 * DAY),
    updatedAt: ago(2 * HOUR),
  });
  return project.id;
}

/* ── Architecture: systems + saved diagram positions ──────────────────────── */

async function seedArchitecture(projectId: string): Promise<void> {
  // Order matters: dependencies reference ids of systems created earlier.
  const core = await systemsRepo.create({
    projectId,
    name: "Core Engine",
    description:
      "Game loop, fixed-tick simulation, scene graph, and the entity-component runtime. Everything else is a guest here.",
    category: "engine",
    status: "active",
    health: 95,
    dependencies: [],
    createdAt: ago(40 * DAY),
    updatedAt: ago(6 * HOUR),
  });
  const controller = await systemsRepo.create({
    projectId,
    name: "Platformer Controller",
    description:
      "Kinematic character body: run, jump, coyote time, jump buffering, slope handling. Tuned for game-feel.",
    category: "gameplay",
    status: "active",
    health: 90,
    dependencies: [core.id],
    createdAt: ago(36 * DAY),
    updatedAt: ago(1 * DAY),
  });
  const combat = await systemsRepo.create({
    projectId,
    name: "Combat System",
    description:
      "Hitboxes/hurtboxes, combo graph, i-frames, hitstop, and damage numbers. Drives melee and abilities alike.",
    category: "gameplay",
    status: "active",
    health: 76,
    dependencies: [core.id, controller.id],
    createdAt: ago(28 * DAY),
    updatedAt: ago(3 * HOUR),
  });
  const enemyAi = await systemsRepo.create({
    projectId,
    name: "Enemy AI",
    description:
      "Behavior-tree driven foes with perception, memory, and reusable state machines. Shares the combat hurt pipeline.",
    category: "ai",
    status: "active",
    health: 68,
    dependencies: [combat.id],
    createdAt: ago(20 * DAY),
    updatedAt: ago(5 * HOUR),
  });
  const abilities = await systemsRepo.create({
    projectId,
    name: "Ability System",
    description:
      "Data-driven ability slots, cooldowns, and the Echo Forge ability that lets Lumen relive a defeated foe's signature move.",
    category: "gameplay",
    status: "active",
    health: 80,
    dependencies: [combat.id],
    createdAt: ago(14 * DAY),
    updatedAt: ago(8 * HOUR),
  });
  const save = await systemsRepo.create({
    projectId,
    name: "Save & Progression",
    description:
      "Checkpoint saves, progression flags, and the relic inventory. Versioned blobs, forward-compatible.",
    category: "systems",
    status: "active",
    health: 88,
    dependencies: [core.id],
    createdAt: ago(18 * DAY),
    updatedAt: ago(2 * DAY),
  });
  const audio = await systemsRepo.create({
    projectId,
    name: "Audio Engine",
    description:
      "Layered adaptive music stems and emitter-based SFX with 3D falloff. Hooks combat hitstop for crunch.",
    category: "engine",
    status: "active",
    health: 92,
    dependencies: [core.id],
    createdAt: ago(22 * DAY),
    updatedAt: ago(4 * HOUR),
  });
  const vfx = await systemsRepo.create({
    projectId,
    name: "VFX & Particles",
    description:
      "GPU particle system, screen shake, and post-processing. The 'spark' trails everything combat touches.",
    category: "render",
    status: "active",
    health: 84,
    dependencies: [core.id],
    createdAt: ago(16 * DAY),
    updatedAt: ago(1 * DAY),
  });
  const dialogue = await systemsRepo.create({
    projectId,
    name: "Dialogue",
    description:
      "Ink-driven dialogue with branching choices and memory of past beats. Needs save flags to gate content.",
    category: "narrative",
    status: "active",
    health: 58,
    dependencies: [core.id, save.id],
    createdAt: ago(10 * DAY),
    updatedAt: ago(3 * DAY),
  });
  // Deprecated but standalone (nothing depends on it) — no arch penalty.
  await systemsRepo.create({
    projectId,
    name: "Legacy Input (Rewired)",
    description:
      "The old input layer before the native rewire. Kept for reference; superseded by Core Engine input.",
    category: "engine",
    status: "deprecated",
    health: 35,
    dependencies: [],
    createdAt: ago(40 * DAY),
    updatedAt: ago(12 * DAY),
  });

  // Hand-placed diagram positions so the Architecture view opens tidy.
  const positions: Array<{ id: string; label: string; x: number; y: number }> =
    [
      { id: core.id, label: "Core Engine", x: 80, y: 240 },
      { id: controller.id, label: "Platformer Controller", x: 320, y: 120 },
      { id: combat.id, label: "Combat System", x: 320, y: 360 },
      { id: enemyAi.id, label: "Enemy AI", x: 580, y: 240 },
      { id: abilities.id, label: "Ability System", x: 580, y: 460 },
      { id: save.id, label: "Save & Progression", x: 320, y: 580 },
      { id: audio.id, label: "Audio Engine", x: 80, y: 60 },
      { id: vfx.id, label: "VFX & Particles", x: 80, y: 420 },
      { id: dialogue.id, label: "Dialogue", x: 580, y: 600 },
    ];
  for (const p of positions) {
    await archRepo.savePosition(projectId, p.id, p.label, p.x, p.y);
  }
}

/* ── Brain: folders, notes (two-phase to keep wikilinks clean) ────────────── */

async function seedFoldersAndNotes(projectId: string): Promise<void> {
  const design = await foldersRepo.create({ projectId, name: "Design" });
  const narrative = await foldersRepo.create({ projectId, name: "Narrative" });
  const tech = await foldersRepo.create({ projectId, name: "Tech Notes" });

  // Phase 1: stub every note with an empty body. Wikilink resolution in
  // phase 2 then never spawns placeholder duplicates — every [[link]] resolves
  // to a real, fleshed-out note. (notesRepo.create does not accept timestamps,
  // so they are stamped explicitly in phase 3.)
  const stub = (
    title: string,
    type: Parameters<typeof notesRepo.create>[0]["type"],
    folderId: string,
    tags: string[],
  ) => notesRepo.create({ projectId, title, type, folderId, tags });
  const [northStar, combatDesign, echoForge, enemyRoster, lumen, theForge, hitstop, frameBudget] =
    await Promise.all([
      stub("North Star: A Fading Sun", "decision", design.id, ["vision", "pillars"]),
      stub("Combat Design", "mechanic", design.id, ["combat", "game-feel"]),
      stub("Echo Forge Ability", "mechanic", design.id, ["abilities", "combat"]),
      stub("Enemy Roster: The Hollowed", "system", design.id, ["enemies", "ai"]),
      stub("Lumen, the Last Spark", "lore", narrative.id, ["character", "story"]),
      stub("The Last Forge", "lore", narrative.id, ["world", "story"]),
      stub("Game-feel Research: Hitstop", "research", tech.id, ["game-feel", "research"]),
      stub("Frame Budget Audit", "experiment", tech.id, ["performance", "profiling"]),
    ]);

  // Phase 2 + 3: set the body (which also builds the excerpt and syncs
  // wikilinks), then overwrite the timestamps so "Recent notes" ordering is
  // realistic. The raw update skips the repo's createdAt guard deliberately.
  const write = async (
    id: string,
    body: string,
    createdAt: number,
    updatedAt: number,
  ) => {
    await notesRepo.update(id, { body });
    await db.notes.update(id, { createdAt, updatedAt });
  };

  await write(
    northStar.id,
    `# North Star

Lumen is a **2D action-platformer** about reigniting a dying sun. Three pillars:

1. **Crunchy combat** — every hit lands with weight (see [[Combat Design]]).
2. **Echo Forge** — steal a fallen foe's signature move (see [[Echo Forge Ability]]).
3. **A hand-drawn, mournful world** — beauty in decline (see [[The Last Forge]]).

We measure "does this serve the pillars?" before greenlighting any feature. If it doesn't, it goes to the backlog cellar.

> Decision: scope to 4–5 hours of core content for the first shippable arc.`,
    ago(39 * DAY),
    ago(20 * HOUR),
  );

  await write(
    combatDesign.id,
    `# Combat Design

Melee-first, ability-augmented. Built on the [[North Star: A Fading Sun]] pillars.

## Feel targets
- Input → impact under **3 frames**.
- Hitstop 40–80ms scaled by strike weight (research in [[Game-feel Research: Hitstop]]).
- I-frames on dash and on the wind-down of heavy attacks.

## Combo graph
Light → Light → Heavy (launcher) → Air series. Enemies fling into the [[Enemy Roster: The Hollowed]] hurt pipeline, not a parallel one.

TODO: nail down the perfect-block window — currently drifting between 80 and 120ms.`,
    ago(30 * DAY),
    ago(4 * HOUR),
  );

  await write(
    echoForge.id,
    `# Echo Forge

The signature mechanic. Defeat a **Hollowed** boss and Lumen can, for a limited time, forge their signature move into her kit.

- Slot limit: **1** forged echo at a time (design tension vs. [[Combat Design]] combo depth).
- Charge economy: spends "ember", the same resource as heavy attacks.
- Thematically tied to [[Lumen, the Last Spark]] — she relives a memory, not steals a power.`,
    ago(14 * DAY),
    ago(9 * HOUR),
  );

  await write(
    enemyRoster.id,
    `# The Hollowed

Creatures the sun forgot. Each boss gates an [[Echo Forge Ability]].

| Foe | Role | Forged Move |
| --- | --- | --- |
| Ash Warden | Bruiser | Flame Cleave |
| Glass Choir | Ranged swarm | Shard Volley |
| The Mire | Grappler | Sinking Pull |

Behavior shared with the Combat System's hurt pipeline; AI drives perception + memory only.`,
    ago(21 * DAY),
    ago(6 * HOUR),
  );

  await write(
    lumen.id,
    `# Lumen, the Last Spark

The last ember-tender of [[The Last Forge]]. She carries a fragment of the sun inside her, and it is going out.

- **Want**: to relight the Forge before the long dark.
- **Need**: to accept that some echoes must be let go, not kept.
- **Voice**: steady, tired, dry-warm. Never grimdark monologue.`,
    ago(38 * DAY),
    ago(2 * DAY),
  );

  await write(
    theForge.id,
    `# The Last Forge

The world's heart — a great forge the sun once fed. Now cold, tended by [[Lumen, the Last Spark]].

Act structure:
1. The Fading — Lumen leaves the Forge to find why the light dies.
2. The Hollowing — she meets the [[Enemy Roster: The Hollowed|Hollowed]] and learns Echo Forge.
3. The Rekindling — a choice: reignite the sun, or carry the last light onward.`,
    ago(37 * DAY),
    ago(2 * DAY),
  );

  await write(
    hitstop.id,
    `# Hitstop Research

On impact, freeze simulation for N ms on both attacker and target. Conveys weight without slow-mo.

Findings:
- 40ms for light hits, 80ms for heavies feels right (matches [[Combat Design]] targets).
- Freeze the *simulation*, not input — buffered inputs must still queue.
- VFX and camera shake run during freeze; audio one-shots fire on the frozen frame for crunch.

Source: aggregated from several GDC talks; validated in the [[Frame Budget Audit]] prototype.`,
    ago(12 * DAY),
    ago(1 * DAY),
  );

  await write(
    frameBudget.id,
    `# Frame Budget Audit

16.6ms per frame @ 60Hz. Current spend (profiler, peak scene):

| System | ms |
| --- | --- |
| Sim | 4.1 |
| Combat hitboxes | 1.8 |
| VFX particles | 3.2 |
| Audio | 0.9 |
| Render | 5.4 |
| **Total** | **15.4** |

0.8ms under budget — but the particle pass spikes to 5.1ms during the Echo Forge burst. Tracked as a task.`,
    ago(5 * DAY),
    ago(30 * MIN),
  );
}

/* ── Note templates ───────────────────────────────────────────────────────── */

async function seedNoteTemplates(projectId: string): Promise<void> {
  await noteTemplatesRepo.create({
    projectId,
    name: "Decision Note",
    description: "Record a decision and the thinking behind it.",
    type: "decision",
    tags: ["decision"],
    body: `# Decision: <title>

## Context
<why this is being decided now>

## Options
1. **<option A>** — <pros / cons>
2. **<option B>** — <pros / cons>

## Choice
<what we picked>

## Consequences
<what this enables and what it forecloses>`,
  });
  await noteTemplatesRepo.create({
    projectId,
    name: "Mechanic Design",
    description: "Frame a gameplay mechanic with feel targets.",
    type: "mechanic",
    tags: ["mechanic", "design"],
    body: `# <Mechanic Name>

## Intent
<what the player should feel>

## Inputs & Outputs
- **Input:** <control/state>
- **Output:** <gameplay effect>

## Feel Targets
- <timing / weight / feedback>

## Edge Cases
- <state interactions, failure modes>`,
  });
  await noteTemplatesRepo.create({
    projectId,
    name: "Research Note",
    description: "Capture findings with sources and next steps.",
    type: "research",
    tags: ["research"],
    body: `# <Topic>

## Question
<what we want to know>

## Findings
- <finding>

## Sources
- <link / talk / paper>

## Next Steps
- <actionable follow-up>`,
  });
}

/* ── Standards ────────────────────────────────────────────────────────────── */

async function seedStandards(projectId: string): Promise<void> {
  await standardsRepo.create({
    projectId,
    category: "naming",
    title: "No hungarian prefixes on types",
    rule: "Types must not carry hungarian prefixes (e.g. `FPlayer`, `UCamera`). Use clear domain nouns instead.",
    examples: ["`PlayerController` not `FPlayerController`"],
    enforced: true,
    pattern: "\\b[FU][A-Z][a-z]+\\w*",
    createdAt: ago(34 * DAY),
    updatedAt: ago(34 * DAY),
  });
  await standardsRepo.create({
    projectId,
    category: "structure",
    title: "Single authority per system",
    rule: "Each system owns one responsibility and one data store. Cross-system reads go through an event or a query API, never a direct reference.",
    examples: ["Combat reads health via `Health.Query`, not `player.hp`"],
    enforced: false,
    pattern: "",
    createdAt: ago(33 * DAY),
    updatedAt: ago(33 * DAY),
  });
  await standardsRepo.create({
    projectId,
    category: "comments",
    title: "No leftover TODO markers in shipped docs",
    rule: "Design notes promoted to specs must not carry unresolved TODO/FIXME/XXX markers.",
    examples: ["Replace `TODO: decide window` with the decided value before promoting."],
    enforced: true,
    pattern: "(TODO|FIXME|XXX)",
    createdAt: ago(8 * DAY),
    updatedAt: ago(8 * DAY),
  });
  await standardsRepo.create({
    projectId,
    category: "performance",
    title: "No per-frame allocations in hot loops",
    rule: "Sim and combat hot paths must not allocate (no `new` per tick, no LINQ in update). Pool everything that moves.",
    examples: ["Pool particle emitters; reuse `NativeArray` buffers."],
    enforced: false,
    pattern: "",
    createdAt: ago(6 * DAY),
    updatedAt: ago(6 * DAY),
  });
}

/* ── Specs, sprints, tasks (wired together) ───────────────────────────────── */

interface SeedContext {
  specMovement: string;
  specCombat: string;
  specEnemyAi: string;
  specSave: string;
  specEchoForge: string;
  sprintFoundation: string;
  sprintCombat: string;
  sprintContent: string;
  noteNorthStar: string;
  noteCombat: string;
  noteEchoForge: string;
  noteEnemyRoster: string;
  taskHitstopTuning: string;
  taskParticleSpike: string;
}

async function seedSpecsSprintsTasks(
  projectId: string,
): Promise<SeedContext> {
  // Sprints
  const sprintFoundation = await sprintsRepo.create({
    projectId,
    name: "Sprint 1 — Foundation",
    goal: "A playable graybox with movement and a single enemy.",
    status: "completed",
    startDate: ago(35 * DAY),
    endDate: ago(21 * DAY),
    createdAt: ago(35 * DAY),
    updatedAt: ago(21 * DAY),
  });
  const sprintCombat = await sprintsRepo.create({
    projectId,
    name: "Sprint 2 — Combat & Enemies",
    goal: "Melee combo, hitstop, two enemy archetypes, and the Echo Forge prototype.",
    status: "active",
    startDate: ago(20 * DAY),
    endDate: ago(6 * DAY),
    createdAt: ago(20 * DAY),
    updatedAt: ago(3 * HOUR),
  });
  const sprintContent = await sprintsRepo.create({
    projectId,
    name: "Sprint 3 — Content & Polish",
    goal: "Boss arena, dialogue gating, and the frame-budget pass.",
    status: "planned",
    startDate: ago(-5 * DAY),
    endDate: ago(-19 * DAY),
    createdAt: ago(1 * DAY),
    updatedAt: ago(1 * HOUR),
  });

  // Specs
  const specMovement = await specsRepo.create({
    projectId,
    number: "SPEC-001",
    title: "Platformer Movement",
    status: "shipped",
    purpose:
      "Establish the locomotion feel that all combat and traversal builds on.",
    goals: [
      "Run, jump, dash with predictable tuning.",
      "Coyote time and jump buffering for forgiveness.",
      "Slope movement without stutter.",
    ],
    features: [
      "Kinematic body with acceleration curves.",
      "Coyote time 100ms, buffer 120ms.",
      "One-way platforms and drop-through.",
    ],
    constraints: ["No physics material drift; deterministic feel."],
    acceptance: ["Player crosses the graybox course in < 40s without exploits."],
    risks: [],
    technicalNotes: "Implemented atop the Core Engine fixed-tick sim.",
    implementationProgress: 100,
    createdAt: ago(34 * DAY),
    updatedAt: ago(20 * DAY),
  });
  const specCombat = await specsRepo.create({
    projectId,
    number: "SPEC-002",
    title: "Melee Combat",
    status: "implementing",
    purpose: "Deliver the crunchy, weighted combat of the north-star pillars.",
    goals: [
      "Light→Light→Heavy launcher into an air series.",
      "Hitstop and hit-flash on every strike.",
      "Shared hurt pipeline with enemies.",
    ],
    features: [
      "Combo graph with exit- and branch-windows.",
      "I-frames on dash and heavy wind-down.",
      "Damage numbers and hit pause scaling.",
    ],
    constraints: ["Input→impact under 3 frames.", "Perfect-block window TBD."],
    acceptance: [
      "Combat dummy hitbox tests green.",
      "Feel review sign-off on hitstop curve.",
    ],
    risks: ["Perfect-block window still drifting (see Combat Design note)."],
    technicalNotes: "Hitboxes authored as data; resolved in the Combat System.",
    implementationProgress: 65,
    createdAt: ago(27 * DAY),
    updatedAt: ago(4 * HOUR),
  });
  const specEnemyAi = await specsRepo.create({
    projectId,
    number: "SPEC-003",
    title: "Enemy AI Behaviors",
    status: "review",
    purpose: "Give the Hollowed readable, learnable behavior.",
    goals: [
      "Behavior-tree perception + memory.",
      "Two archetypes: Ash Warden (bruiser), Glass Choir (ranged).",
    ],
    features: [
      "Sight + hearing perception model.",
      "Stagger/stun state shared with the combat hurt pipeline.",
    ],
    constraints: ["No per-tick allocations in the AI loop."],
    acceptance: ["No enemy clumps on 8-actor stress scene."],
    risks: ["Perception LOD still unimplemented for far actors."],
    technicalNotes: "Trees authored as data; shared nodes across archetypes.",
    implementationProgress: 40,
    createdAt: ago(19 * DAY),
    updatedAt: ago(6 * HOUR),
  });
  const specSave = await specsRepo.create({
    projectId,
    number: "SPEC-004",
    title: "Save & Progression",
    status: "approved",
    purpose: "Persist checkpoints, flags, and the relic inventory.",
    goals: ["Forward-compatible versioned blobs.", "Checkpoint + death reload."],
    features: ["Schema migration pass.", "Flag graph for dialogue gating."],
    constraints: ["No synchronous disk on the sim thread."],
    acceptance: ["Round-trip save/load across a schema bump."],
    risks: [],
    technicalNotes: "Blobs versioned; migrators registered by version delta.",
    implementationProgress: 10,
    createdAt: ago(17 * DAY),
    updatedAt: ago(2 * DAY),
  });
  const specEchoForge = await specsRepo.create({
    projectId,
    number: "SPEC-005",
    title: "Echo Forge Ability",
    status: "draft",
    purpose: "The signature mechanic: forge a defeated boss's move into Lumen's kit.",
    goals: ["One forged echo at a time.", "Ember charge economy shared with heavy attacks."],
    features: ["Forge slot UI.", "Boss-kill unlock trigger.", "Echo swap SFX + VFX."],
    constraints: ["Must not bloat the combo graph complexity."],
    acceptance: ["Forge/swap under 200ms with no sim stall."],
    risks: ["Slot-limit tension with combo depth (see Echo Forge note)."],
    technicalNotes: "Abilities are data-driven slots; forge = swap the active slot.",
    implementationProgress: 0,
    createdAt: ago(13 * DAY),
    updatedAt: ago(9 * HOUR),
  });

  // Resolve note ids for linking.
  const noteNorthStar = (await notesRepo.getByTitle(projectId, "North Star: A Fading Sun"))!.id;
  const noteCombat = (await notesRepo.getByTitle(projectId, "Combat Design"))!.id;
  const noteEchoForge = (await notesRepo.getByTitle(projectId, "Echo Forge Ability"))!.id;
  const noteEnemyRoster = (await notesRepo.getByTitle(projectId, "Enemy Roster: The Hollowed"))!.id;

  // Tasks — a spread of statuses, priorities, and assignees.
  interface TaskOver {
    status?: TaskStatus;
    priority?: TaskPriority;
    assignee?: Assignee;
    specId?: string | null;
    sprintId?: string | null;
    description?: string;
    tags?: string[];
    progress?: number;
    createdAt?: number;
    updatedAt?: number;
  }
  const t = (title: string, over: TaskOver) =>
    tasksRepo.create({ projectId, title, ...over });

  await t("Kinematic body + acceleration curves", {
    status: "done",
    priority: "high",
    assignee: "programmer",
    specId: specMovement.id,
    sprintId: sprintFoundation.id,
    description: "Core movement body with tuned accel/decel.",
    tags: ["movement"],
    progress: 100,
    createdAt: ago(34 * DAY),
    updatedAt: ago(22 * DAY),
  });
  await t("Coyote time + jump buffering", {
    status: "done",
    priority: "medium",
    assignee: "programmer",
    specId: specMovement.id,
    sprintId: sprintFoundation.id,
    description: "Forgiveness windows per the spec.",
    tags: ["movement", "game-feel"],
    progress: 100,
    createdAt: ago(33 * DAY),
    updatedAt: ago(21 * DAY),
  });
  await t("Combo graph + light/heavy chain", {
    status: "done",
    priority: "high",
    assignee: "programmer",
    specId: specCombat.id,
    sprintId: sprintCombat.id,
    description: "Branch/exit windows; launcher into air series.",
    tags: ["combat"],
    progress: 100,
    createdAt: ago(18 * DAY),
    updatedAt: ago(6 * DAY),
  });
  const taskHitstopTuning = await t("Hitstop curve + hit-flash", {
    status: "in_progress",
    priority: "high",
    assignee: "programmer",
    specId: specCombat.id,
    sprintId: sprintCombat.id,
    description: "40–80ms scaled curve; flash + freeze sim (not input).",
    tags: ["combat", "game-feel"],
    progress: 60,
    createdAt: ago(7 * DAY),
    updatedAt: ago(2 * HOUR),
  });
  await t("Perfect-block window decision", {
    status: "review",
    priority: "urgent",
    assignee: "designer",
    specId: specCombat.id,
    sprintId: sprintCombat.id,
    description: "Nail the window between 80 and 120ms; write the decision note.",
    tags: ["combat", "decision"],
    progress: 80,
    createdAt: ago(5 * DAY),
    updatedAt: ago(3 * HOUR),
  });
  await t("Ash Warden behavior tree", {
    status: "in_progress",
    priority: "high",
    assignee: "programmer",
    specId: specEnemyAi.id,
    sprintId: sprintCombat.id,
    description: "Bruiser archetype: close, wind-up, cleave.",
    tags: ["ai", "enemies"],
    progress: 55,
    createdAt: ago(9 * DAY),
    updatedAt: ago(5 * HOUR),
  });
  await t("Glass Choir ranged swarm", {
    status: "todo",
    priority: "medium",
    assignee: "programmer",
    specId: specEnemyAi.id,
    sprintId: sprintCombat.id,
    description: "Kiting ranged archetype; shard volley telegraph.",
    tags: ["ai", "enemies"],
    progress: 10,
    createdAt: ago(4 * DAY),
    updatedAt: ago(1 * DAY),
  });
  await t("Perception LOD for far actors", {
    status: "backlog",
    priority: "low",
    assignee: "optimizer",
    specId: specEnemyAi.id,
    sprintId: sprintContent.id,
    description: "Downgrade far perception ticks to hit the frame budget.",
    tags: ["ai", "performance"],
    progress: 0,
    createdAt: ago(2 * DAY),
    updatedAt: ago(1 * DAY),
  });
  await t("Checkpoint save round-trip", {
    status: "todo",
    priority: "high",
    assignee: "programmer",
    specId: specSave.id,
    sprintId: sprintContent.id,
    description: "Save/load across a versioned blob + migration.",
    tags: ["save"],
    progress: 5,
    createdAt: ago(3 * DAY),
    updatedAt: ago(1 * DAY),
  });
  await t("Dialogue flag graph", {
    status: "backlog",
    priority: "medium",
    assignee: "designer",
    specId: specSave.id,
    sprintId: sprintContent.id,
    description: "Gate story beats on progression flags.",
    tags: ["narrative", "save"],
    progress: 0,
    createdAt: ago(2 * DAY),
    updatedAt: ago(1 * DAY),
  });
  await t("Forge slot UI + swap flow", {
    status: "todo",
    priority: "high",
    assignee: "designer",
    specId: specEchoForge.id,
    sprintId: sprintContent.id,
    description: "One-slot forge UI; swap under 200ms.",
    tags: ["abilities", "ui"],
    progress: 0,
    createdAt: ago(1 * DAY),
    updatedAt: ago(6 * HOUR),
  });
  const taskParticleSpike = await t("Particle pass spike on Echo Forge burst", {
    status: "todo",
    priority: "urgent",
    assignee: "optimizer",
    specId: specEchoForge.id,
    sprintId: sprintContent.id,
    description: "VFX spikes to 5.1ms during the forge burst; pool + cap.",
    tags: ["vfx", "performance"],
    progress: 0,
    createdAt: ago(1 * DAY),
    updatedAt: ago(30 * MIN),
  });
  await t("Boss arena blockout", {
    status: "backlog",
    priority: "medium",
    assignee: "designer",
    specId: specEchoForge.id,
    sprintId: sprintContent.id,
    description: "Blockout for the first boss reveal space.",
    tags: ["level-design"],
    progress: 0,
    createdAt: ago(6 * HOUR),
    updatedAt: ago(6 * HOUR),
  });

  return {
    specMovement: specMovement.id,
    specCombat: specCombat.id,
    specEnemyAi: specEnemyAi.id,
    specSave: specSave.id,
    specEchoForge: specEchoForge.id,
    sprintFoundation: sprintFoundation.id,
    sprintCombat: sprintCombat.id,
    sprintContent: sprintContent.id,
    noteNorthStar,
    noteCombat,
    noteEchoForge,
    noteEnemyRoster,
    taskHitstopTuning: taskHitstopTuning.id,
    taskParticleSpike: taskParticleSpike.id,
  };
}

/** Cross-link specs to notes/tasks now that everything has an id. */
async function wireSpecLinks(projectId: string, ctx: SeedContext): Promise<void> {
  await specsRepo.update(ctx.specCombat, {
    linkedNoteIds: [ctx.noteCombat, ctx.noteNorthStar],
    linkedTaskIds: [ctx.taskHitstopTuning],
  });
  await specsRepo.update(ctx.specEnemyAi, {
    linkedNoteIds: [ctx.noteEnemyRoster],
  });
  await specsRepo.update(ctx.specEchoForge, {
    linkedNoteIds: [ctx.noteEchoForge, ctx.noteNorthStar],
    linkedTaskIds: [ctx.taskParticleSpike],
  });

  // Rebuild implementation progress from the linked tasks for realism.
  for (const id of [
    ctx.specMovement,
    ctx.specCombat,
    ctx.specEnemyAi,
    ctx.specSave,
    ctx.specEchoForge,
  ]) {
    await specsRepo.recomputeProgress(id);
  }

  // A couple of non-wikilink graph edges so the Knowledge Graph shows variety.
  await linksRepo.create({
    projectId,
    sourceType: "spec" as EntityKind,
    sourceId: ctx.specEchoForge,
    targetType: "note" as EntityKind,
    targetId: ctx.noteEchoForge,
    linkType: "implements",
    label: "realizes",
  });
  await linksRepo.create({
    projectId,
    sourceType: "spec" as EntityKind,
    sourceId: ctx.specCombat,
    targetType: "task" as EntityKind,
    targetId: ctx.taskHitstopTuning,
    linkType: "implements",
  });
}

/* ── Documentation ────────────────────────────────────────────────────────── */

async function seedDocs(projectId: string): Promise<void> {
  await docsRepo.create({
    projectId,
    title: "Welcome to Lumen",
    category: "guides",
    body: `# Welcome to Lumen

Lumen: Echoes of the Last Forge is a 2D action-platformer. This workspace is the single source of truth for its design and engineering.

## Where to start
- **Brain** holds design notes and research.
- **Specifications** turn notes into shippable contracts.
- **Task Boards** and **Sprints** track the work.
- **Architecture** maps the systems and their boundaries.

Every feature has a path: idea → note → spec → tasks → commits.`,
    createdAt: ago(39 * DAY),
    updatedAt: ago(2 * DAY),
  });
  await docsRepo.create({
    projectId,
    title: "Architecture Overview",
    category: "engineering",
    body: `# Architecture Overview

The Core Engine hosts the fixed-tick simulation, scene graph, and entity-component runtime. Every gameplay system is a guest of the core.

## Boundaries
- **Platformer Controller** → movement feel.
- **Combat System** → hitboxes, combos, hitstop; the shared hurt pipeline.
- **Enemy AI** → perception + behavior; shares combat's hurt pipeline.
- **Ability System** → data-driven slots, including Echo Forge.
- **Save & Progression**, **Audio Engine**, **VFX & Particles**, **Dialogue** round out the catalog.

The Architecture diagram visualizes these dependencies; a deprecated Legacy Input layer is kept for reference only.`,
    createdAt: ago(24 * DAY),
    updatedAt: ago(3 * DAY),
  });
  await docsRepo.create({
    projectId,
    title: "Contributing",
    category: "guides",
    body: `# Contributing

1. Start from a note or a spec — don't write code without a path.
2. Keep the **Standards** green; the enforcer runs on save.
3. Link your commit to the spec/task it implements.
4. Log non-obvious changes in **Dev Logs**.`,
    createdAt: ago(15 * DAY),
    updatedAt: ago(5 * DAY),
  });
}

/* ── Dev logs ─────────────────────────────────────────────────────────────── */

async function seedDevLogs(
  projectId: string,
  ctx: SeedContext,
): Promise<void> {
  await devLogsRepo.create({
    projectId,
    type: "spec",
    title: "SPEC-002 moved to Implementing",
    body: "Melee combat combo graph landed; hitstop tuning in flight.",
    refType: "spec",
    refId: ctx.specCombat,
    createdAt: ago(4 * HOUR),
  });
  await devLogsRepo.create({
    projectId,
    type: "task",
    title: "Hitstop curve 40–80ms wired",
    body: "Scales with strike weight; sim frozen, input buffered. Feel review pending.",
    refType: "task",
    refId: ctx.taskHitstopTuning,
    createdAt: ago(2 * HOUR),
  });
  await devLogsRepo.create({
    projectId,
    type: "agent",
    title: "Architect agent proposed perception LOD",
    body: "Suggested downgrading far-actor perception ticks; logged as a backlog task.",
    createdAt: ago(1 * DAY),
  });
  await devLogsRepo.create({
    projectId,
    type: "system",
    title: "Dialogue system wired to Save flags",
    body: "Ink beats now read/write progression flags through the Save query API.",
    createdAt: ago(3 * DAY),
  });
  await devLogsRepo.create({
    projectId,
    type: "change",
    title: "Frame budget audit posted",
    body: "0.8ms headroom; particle spike during Echo Forge burst flagged.",
    createdAt: ago(30 * MIN),
  });
  await devLogsRepo.create({
    projectId,
    type: "commit",
    title: "Combo graph + launcher",
    body: "Light→Light→Heavy into air series; branch windows authored as data.",
    createdAt: ago(6 * DAY),
  });
}

/* ── Memories ─────────────────────────────────────────────────────────────── */

async function seedMemories(
  projectId: string,
  ctx: SeedContext,
): Promise<void> {
  await memoriesRepo.create({
    projectId,
    type: "decision",
    content:
      "Combat shares one hurt pipeline with enemies — no parallel damage code. Decided in the north-star note.",
    weight: 0.9,
    tags: ["combat", "architecture"],
    sourceType: "note",
    sourceId: ctx.noteNorthStar,
    createdAt: ago(30 * DAY),
    updatedAt: ago(30 * DAY),
  });
  await memoriesRepo.create({
    projectId,
    type: "lesson",
    content:
      "Freeze the simulation on hitstop, never the input. Buffered inputs must still queue or combos feel dropped.",
    weight: 0.85,
    tags: ["game-feel", "combat"],
    sourceType: "note",
    sourceId: ctx.noteCombat,
    createdAt: ago(11 * DAY),
    updatedAt: ago(11 * DAY),
  });
  await memoriesRepo.create({
    projectId,
    type: "fact",
    content:
      "Frame budget headroom is 0.8ms at peak; the particle pass is the first thing to spike under load.",
    weight: 0.8,
    tags: ["performance"],
    createdAt: ago(5 * DAY),
    updatedAt: ago(30 * MIN),
  });
  await memoriesRepo.create({
    projectId,
    type: "preference",
    content:
      "Author behavior trees and combos as data, not code. Shares nodes across archetypes and keeps tuning non-engineering work.",
    weight: 0.7,
    tags: ["ai", "combat", "architecture"],
    createdAt: ago(19 * DAY),
    updatedAt: ago(19 * DAY),
  });
  await memoriesRepo.create({
    projectId,
    type: "decision",
    content:
      "Echo Forge holds one forged echo at a time — tension with combo depth is intentional, to keep reads readable.",
    weight: 0.82,
    tags: ["abilities", "design"],
    sourceType: "note",
    sourceId: ctx.noteEchoForge,
    createdAt: ago(13 * DAY),
    updatedAt: ago(9 * HOUR),
  });
}

/* ── Commits ──────────────────────────────────────────────────────────────── */

async function seedCommits(
  projectId: string,
  ctx: SeedContext,
): Promise<void> {
  await commitsRepo.create({
    projectId,
    sha: "a1f3c2e9d4b8",
    message: "feat(movement): kinematic body + coyote time",
    author: "mira@studio",
    date: ago(21 * DAY),
    files: ["src/movement/Controller.ts", "src/movement/Body.ts"],
    additions: 642,
    deletions: 18,
    aiSummary:
      "Introduces the kinematic movement body with tuned acceleration, coyote time (100ms), and jump buffering (120ms) per SPEC-001.",
    linkedSpecIds: [ctx.specMovement],
    createdAt: ago(21 * DAY),
  });
  await commitsRepo.create({
    projectId,
    sha: "b7e0d1c44a02",
    message: "feat(combat): combo graph + launcher",
    author: "mira@studio",
    date: ago(6 * DAY),
    files: ["src/combat/ComboGraph.ts", "src/combat/Strikes.ts"],
    additions: 511,
    deletions: 4,
    aiSummary:
      "Light→Light→Heavy launcher into an air series. Branch and exit windows authored as data. Implements part of SPEC-002.",
    linkedSpecIds: [ctx.specCombat],
    linkedTaskIds: [ctx.taskHitstopTuning],
    createdAt: ago(6 * DAY),
  });
  await commitsRepo.create({
    projectId,
    sha: "c93aa7f10b55",
    message: "feat(ai): Ash Warden behavior tree skeleton",
    author: "joon@studio",
    date: ago(5 * HOUR),
    files: ["src/ai/trees/AshWarden.ts", "src/ai/nodes/MeleeCleave.ts"],
    additions: 388,
    deletions: 22,
    aiSummary:
      "Bruiser archetype tree: close distance, wind-up telegraph, cleave. Shares the combat hurt pipeline. Progresses SPEC-003.",
    linkedSpecIds: [ctx.specEnemyAi],
    createdAt: ago(5 * HOUR),
  });
}

/* ── Canvas ───────────────────────────────────────────────────────────────── */

async function seedCanvas(
  projectId: string,
  ctx: SeedContext,
): Promise<void> {
  const canvas = await canvasRepo.create({
    projectId,
    name: "Combat design map",
    description: "How feel, combo, and forge tie together.",
  });

  const feel = await canvasRepo.addNode({
    canvasId: canvas.id,
    type: "text",
    x: 40,
    y: 40,
    width: 220,
    height: 120,
    color: "amber",
    data: { text: "FEEL TARGETS\n\n• Input→impact < 3 frames\n• Hitstop 40–80ms\n• I-frames on dash" },
  });
  const combo = await canvasRepo.addNode({
    canvasId: canvas.id,
    type: "note",
    x: 320,
    y: 40,
    width: 240,
    height: 140,
    color: "violet",
    data: { noteId: ctx.noteCombat, text: "Combat Design\nCombo graph + hurt pipeline" },
  });
  const forge = await canvasRepo.addNode({
    canvasId: canvas.id,
    type: "note",
    x: 640,
    y: 40,
    width: 240,
    height: 140,
    color: "violet",
    data: { noteId: ctx.noteEchoForge, text: "Echo Forge\nOne slot, ember economy" },
  });
  const enemies = await canvasRepo.addNode({
    canvasId: canvas.id,
    type: "note",
    x: 320,
    y: 240,
    width: 240,
    height: 140,
    color: "violet",
    data: { noteId: ctx.noteEnemyRoster, text: "The Hollowed\nBosses gate forge unlocks" },
  });
  const spec = await canvasRepo.addNode({
    canvasId: canvas.id,
    type: "link",
    x: 640,
    y: 240,
    width: 240,
    height: 120,
    color: "sky",
    data: { url: `/specs?spec=${ctx.specCombat}`, text: "SPEC-002 · Melee Combat" },
  });

  await canvasRepo.addEdge({
    canvasId: canvas.id,
    source: feel.id,
    target: combo.id,
    label: "drives",
  });
  await canvasRepo.addEdge({
    canvasId: canvas.id,
    source: combo.id,
    target: forge.id,
    label: "augments",
  });
  await canvasRepo.addEdge({
    canvasId: canvas.id,
    source: enemies.id,
    target: forge.id,
    label: "unlocks",
  });
  await canvasRepo.addEdge({
    canvasId: canvas.id,
    source: combo.id,
    target: spec.id,
    label: "specifies",
  });
}

/* ── Project Watcher feed ─────────────────────────────────────────────────── */

async function seedWatchEvents(projectId: string): Promise<void> {
  // systemId mapping assumes the system names from seedArchitecture.
  const systems = await systemsRepo.listByProject(projectId);
  const byName = (name: string) => systems.find((s) => s.name === name)?.id ?? null;

  await watchEventsRepo.create({
    projectId,
    path: "src/combat/ComboGraph.ts",
    kind: "modified",
    fileType: "code",
    systemId: byName("Combat System"),
    createdAt: ago(6 * DAY),
  });
  await watchEventsRepo.create({
    projectId,
    path: "src/ai/trees/AshWarden.ts",
    kind: "created",
    fileType: "code",
    systemId: byName("Enemy AI"),
    createdAt: ago(5 * HOUR),
  });
  await watchEventsRepo.create({
    projectId,
    path: "assets/vfx/forge_burst.prefab",
    kind: "modified",
    fileType: "shader",
    systemId: byName("VFX & Particles"),
    createdAt: ago(30 * MIN),
  });
  await watchEventsRepo.create({
    projectId,
    path: "scenes/BossArena.blockout.unity",
    kind: "created",
    fileType: "scene",
    systemId: null,
    createdAt: ago(6 * HOUR),
  });
  await watchEventsRepo.create({
    projectId,
    path: "config/frame_budget.json",
    kind: "modified",
    fileType: "config",
    systemId: null,
    createdAt: ago(30 * MIN),
  });
  await watchEventsRepo.create({
    projectId,
    path: "src/legacy/RewiredInput.cs",
    kind: "deleted",
    fileType: "code",
    systemId: byName("Legacy Input (Rewired)"),
    createdAt: ago(12 * DAY),
  });
}

/* ── Sync index ───────────────────────────────────────────────────────────── */

async function seedSyncFiles(projectId: string): Promise<void> {
  await syncRepo.replaceAll(projectId, [
    { path: "design/north-star.md", hash: "d1", status: "synced", entityType: "note", entityId: "demo", lastSyncedAt: ago(2 * DAY) },
    { path: "design/combat.md", hash: "d2", status: "local_modified", entityType: "note", entityId: "demo", lastSyncedAt: ago(2 * DAY) },
    { path: "specs/SPEC-002.md", hash: "d3", status: "local_modified", entityType: "spec", entityId: "demo", lastSyncedAt: ago(1 * DAY) },
    { path: "specs/SPEC-005.md", hash: "d4", status: "new", entityType: "spec", entityId: "demo", lastSyncedAt: null },
    { path: "docs/architecture.md", hash: "d5", status: "synced", entityType: "doc", entityId: "demo", lastSyncedAt: ago(3 * DAY) },
    { path: "docs/welcome.md", hash: "d6", status: "synced", entityType: "doc", entityId: "demo", lastSyncedAt: ago(2 * DAY) },
    { path: "assets/vfx/forge_burst.prefab", hash: "d7", status: "remote_modified", entityType: null, entityId: null, lastSyncedAt: ago(1 * DAY) },
    { path: "config/frame_budget.json", hash: "d8", status: "conflict", entityType: null, entityId: null, lastSyncedAt: ago(1 * DAY) },
  ]);
}

/* ── AI connection + chat + workflow ──────────────────────────────────────── */

async function seedAiConnection(): Promise<string> {
  const conn = await aiConnectionsRepo.create({
    providerId: "anthropic",
    label: "Demo — add your API key in Chat",
    apiKey: "",
    baseUrl: "",
  });
  return conn.id;
}

async function seedChat(projectId: string, connectionId: string): Promise<void> {
  const thread = await chatThreadsRepo.create({
    projectId,
    connectionId,
    modelId: "claude-sonnet-4-5",
    title: "Combat design brainstorm",
    mode: "agentic",
    reasoningEnabled: false,
    createdAt: ago(4 * HOUR),
    updatedAt: ago(3 * HOUR),
  });
  await chatMessagesRepo.create({
    threadId: thread.id,
    role: "user",
    content:
      "Our perfect-block window is drifting between 80 and 120ms. Given the north-star pillars and the hitstop research, what would you recommend?",
    createdAt: ago(4 * HOUR),
  });
  await chatMessagesRepo.create({
    threadId: thread.id,
    role: "assistant",
    content:
      "I'd lock the **perfect-block window at 100ms** with a 60ms forgiving tail.\n\nWhy 100ms:\n- Sits inside your 40–80ms hitstop range's upper bound, so a successful block *feels* like the impact it cancels.\n- Matches the coyote time (100ms) you already use — one internal 'forgiveness budget' to teach.\n- 120ms started to feel unearned in playtests; 80ms punished latency above human reaction.\n\nThe 60ms tail tapers the window (partial parry) so near-misses still sting slightly. I've drafted a decision note and a task to implement the curve — see the linked task.",
    reasoning: "",
    toolActivity: [
      { name: "readNote", summary: "North Star: A Fading Sun", ok: true, running: false },
      { name: "readNote", summary: "Game-feel Research: Hitstop", ok: true, running: false },
      { name: "createTask", summary: "Perfect-block window decision", ok: true, running: false },
    ],
    createdAt: ago(3 * HOUR),
  });
}

async function seedWorkflow(
  projectId: string,
  connectionId: string,
): Promise<void> {
  const run = await workflowRepo.createRun({
    projectId,
    connectionId,
    modelId: "claude-sonnet-4-5",
    title: "Echo Forge — idea to implementation",
    idea:
      "Let Lumen forge a defeated boss's signature move into her kit, one at a time, spending the shared ember resource.",
  });

  const steps = await workflowRepo.listSteps(run.id);
  // Mark the first couple of pipeline steps as complete with sample output.
  const done: Array<{ key: string; output: string }> = [
    {
      key: "clarify",
      output:
        "Refined the idea: one forge slot, ember-shared economy, thematically a memory not a theft. Constraints: no combo-graph bloat.",
    },
    {
      key: "research",
      output:
        "Pulled hitstop + combo-graph notes and the frame-budget audit. Risk: particle spike during the forge burst (5.1ms).",
    },
    {
      key: "spec",
      output:
        "Drafted SPEC-005 (Echo Forge Ability) with goals, acceptance (forge/swap < 200ms), and risks.",
    },
  ];
  for (const step of steps.slice(0, done.length)) {
    const match = done.find((d) => d.key === step.stepKey);
    if (match) {
      await workflowRepo.updateStep(step.id, {
        status: "done",
        output: match.output,
      });
    }
  }
  // The next step is in-flight.
  const next = steps[done.length];
  if (next) {
    await workflowRepo.updateStep(next.id, { status: "running" });
  }
}
