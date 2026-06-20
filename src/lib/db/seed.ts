import { db } from "@/lib/db";
import {
  projectsRepo,
  foldersRepo,
  notesRepo,
  noteTemplatesRepo,
  specsRepo,
  tasksRepo,
  standardsRepo,
  systemsRepo,
  memoriesRepo,
  commitsRepo,
  devLogsRepo,
  docsRepo,
  watchEventsRepo,
} from "@/lib/db/repos";
import type { Note } from "@/lib/db/schema";
import { inferFileType } from "@/lib/watcher";

const DEMO_SLUG = "aetheris-demo";
const DAY = 86_400_000;

/** Whether the demo project has been loaded. */
export async function isDemoLoaded(): Promise<boolean> {
  const match = await db.projects.where("slug").equals(DEMO_SLUG).first();
  return Boolean(match);
}

/** Remove every record from every table (full local wipe). */
export async function resetData(): Promise<void> {
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}

/**
 * Populate a self-contained demo project: interlinked notes (with real
 * wikilinks), templates, specs, tasks, standards, systems, commits, memories,
 * and dev logs. Returns the new project id. Safe to call repeatedly — it skips
 * if the demo already exists.
 */
export async function loadDemoData(): Promise<string> {
  const existing = await db.projects.where("slug").equals(DEMO_SLUG).first();
  if (existing) return existing.id;

  const project = await projectsRepo.create({
    name: "Aetheris (Demo)",
    slug: DEMO_SLUG,
    description:
      "A demo action-RPG project showcasing the MasarFlow feature path.",
    accent: "violet",
    health: 78,
    archScore: 84,
    techDebt: 23,
  });
  const projectId = project.id;

  // ── Folders ──────────────────────────────────────────────────────────
  const systemsFolder = await foldersRepo.create({
    projectId,
    name: "01. Systems",
  });
  const mechanicsFolder = await foldersRepo.create({
    projectId,
    name: "02. Mechanics",
  });
  const loreFolder = await foldersRepo.create({ projectId, name: "03. Lore" });
  const researchFolder = await foldersRepo.create({
    projectId,
    name: "04. Research",
  });

  // ── Notes (two-pass so wikilinks resolve to real notes) ───────────────
  const noteSpecs: Array<{
    title: string;
    type: Note["type"];
    folderId: string | null;
    tags: string[];
    body: string;
  }> = [
    {
      title: "Project Vision",
      type: "idea",
      folderId: null,
      tags: ["vision", "pillars"],
      body: "# Project Vision\n\nAetheris is a fast, readable action-RPG built around a tight [[Combat System]] and a world shaped by [[World Lore: The Sundering]].\n\n## Pillars\n- **Responsive** combat with i-frames\n- **Legible** enemy telegraphs via [[Enemy AI]]\n- **Meaningful** resource decisions through the [[Stamina System]]",
    },
    {
      title: "Combat System",
      type: "system",
      folderId: systemsFolder.id,
      tags: ["combat", "core"],
      body: "# Combat System\n\nThe combat core ties together the [[Dash Mechanic]], [[Enemy AI]], and the [[Damage Formula Research]].\n\nBuilt on the [[Decision: Use ECS Architecture]] so behaviors compose cleanly.\n\n```\nattack -> hit detection -> damage formula -> reaction\n```",
    },
    {
      title: "Dash Mechanic",
      type: "mechanic",
      folderId: mechanicsFolder.id,
      tags: ["movement", "combat"],
      body: "# Dash Mechanic\n\nA short burst with invincibility frames. Consumes from the [[Stamina System]] and is a key part of the [[Combat System]].\n\n- i-frame window: **0.30s**\n- cooldown: 0.6s",
    },
    {
      title: "Stamina System",
      type: "system",
      folderId: systemsFolder.id,
      tags: ["resource"],
      body: "# Stamina System\n\nGoverns the [[Dash Mechanic]] and heavy attacks. Regenerates after a short delay out of combat.",
    },
    {
      title: "Enemy AI",
      type: "system",
      folderId: systemsFolder.id,
      tags: ["ai", "combat"],
      body: "# Enemy AI\n\nDriven by behavior trees. Feeds telegraphs into the [[Combat System]] and relies on the [[Pathfinding Experiment]] for navigation.",
    },
    {
      title: "Pathfinding Experiment",
      type: "experiment",
      folderId: researchFolder.id,
      tags: ["ai", "navmesh"],
      body: "# Pathfinding Experiment\n\nProto comparing nav-mesh vs grid A* for [[Enemy AI]]. Nav-mesh wins on open terrain.",
    },
    {
      title: "Damage Formula Research",
      type: "research",
      folderId: researchFolder.id,
      tags: ["balance"],
      body: "# Damage Formula Research\n\nExploring scaling curves for the [[Combat System]]. Leaning toward `atk * (1 - def/(def+k))`.",
    },
    {
      title: "World Lore: The Sundering",
      type: "lore",
      folderId: loreFolder.id,
      tags: ["lore", "world"],
      body: "# The Sundering\n\nThe cataclysm that split the continent and created the warring [[Faction Design]] groups.",
    },
    {
      title: "Faction Design",
      type: "idea",
      folderId: loreFolder.id,
      tags: ["lore", "design"],
      body: "# Faction Design\n\nThree factions born from [[World Lore: The Sundering]], each with distinct combat identities feeding the [[Combat System]].",
    },
    {
      title: "Decision: Use ECS Architecture",
      type: "decision",
      folderId: systemsFolder.id,
      tags: ["adr", "architecture"],
      body: "# ADR: Use ECS Architecture\n\n**Status:** Accepted\n\nWe will use an Entity-Component-System approach so the [[Combat System]] and [[Enemy AI]] compose behaviors without deep inheritance.",
    },
  ];

  const created: Note[] = [];
  for (const spec of noteSpecs) {
    created.push(
      await notesRepo.create({
        projectId,
        title: spec.title,
        type: spec.type,
        folderId: spec.folderId,
        tags: spec.tags,
      }),
    );
  }
  // Pass 2: set bodies (triggers wikilink resolution against existing notes).
  for (let i = 0; i < created.length; i++) {
    await notesRepo.update(created[i].id, { body: noteSpecs[i].body });
  }
  const noteByTitle = (title: string) =>
    created.find((n) => n.title === title)!.id;

  // ── Templates ─────────────────────────────────────────────────────────
  await noteTemplatesRepo.create({
    projectId,
    name: "Feature Idea",
    description: "Capture a raw feature idea.",
    type: "idea",
    body: "# {{title}}\n\n## Problem\n\n## Proposed solution\n\n## Open questions\n- ",
    tags: ["idea"],
  });
  await noteTemplatesRepo.create({
    projectId,
    name: "System Design",
    description: "Design doc for a game system.",
    type: "system",
    body: "# {{title}}\n\n## Responsibilities\n\n## Inputs / Outputs\n\n## Dependencies\n- [[ ]]\n\n## Risks",
    tags: ["system"],
  });
  await noteTemplatesRepo.create({
    projectId,
    name: "Decision Record (ADR)",
    description: "Architecture decision record.",
    type: "decision",
    body: "# ADR: {{title}}\n\n**Status:** Proposed\n\n## Context\n\n## Decision\n\n## Consequences",
    tags: ["adr"],
  });

  // ── Specs ─────────────────────────────────────────────────────────────
  const rfc1 = await specsRepo.create({
    projectId,
    number: "RFC-001",
    title: "Real-time Combat Loop",
    status: "approved",
    purpose: "Define the moment-to-moment combat loop and its timings.",
    goals: ["Responsive controls", "Readable enemy telegraphs"],
    features: ["Dash i-frames", "Hit reactions", "Damage formula"],
    constraints: ["60fps budget", "No per-frame allocations"],
    acceptance: ["Dash cancels recovery", "Damage matches formula spec"],
    implementationProgress: 60,
    linkedNoteIds: [noteByTitle("Combat System"), noteByTitle("Dash Mechanic")],
    technicalNotes: "Built on the ECS combat core.",
  });
  const rfc2 = await specsRepo.create({
    projectId,
    number: "RFC-002",
    title: "Enemy AI Behavior Trees",
    status: "implementing",
    purpose: "Specify the behavior-tree runtime for enemies.",
    goals: ["Composable behaviors", "Designer-tunable"],
    features: ["BT runtime", "Telegraph nodes"],
    implementationProgress: 30,
    linkedNoteIds: [noteByTitle("Enemy AI")],
  });
  const rfc3 = await specsRepo.create({
    projectId,
    number: "RFC-003",
    title: "Stamina & Resource Economy",
    status: "draft",
    purpose: "Model stamina costs and regeneration.",
    goals: ["Meaningful dash cost"],
    implementationProgress: 0,
    linkedNoteIds: [noteByTitle("Stamina System")],
  });

  // ── Tasks ─────────────────────────────────────────────────────────────
  const taskRows: Array<Parameters<typeof tasksRepo.create>[0]> = [
    {
      projectId,
      title: "Implement dash i-frames",
      specId: rfc1.id,
      status: "in_progress",
      priority: "high",
      assignee: "programmer",
      progress: 50,
      tags: ["combat"],
    },
    {
      projectId,
      title: "Tune damage curve",
      specId: rfc1.id,
      status: "todo",
      priority: "medium",
      assignee: "human",
      tags: ["balance"],
    },
    {
      projectId,
      title: "Build behavior-tree runtime",
      specId: rfc2.id,
      status: "in_progress",
      priority: "high",
      assignee: "ai",
      progress: 35,
      tags: ["ai"],
    },
    {
      projectId,
      title: "Bake nav-mesh for arena",
      specId: rfc2.id,
      status: "backlog",
      priority: "low",
      assignee: "programmer",
    },
    {
      projectId,
      title: "Stamina regen system",
      specId: rfc3.id,
      status: "todo",
      priority: "medium",
      assignee: "programmer",
    },
    {
      projectId,
      title: "Review combat feel",
      status: "review",
      priority: "medium",
      assignee: "reviewer",
      progress: 80,
    },
    {
      projectId,
      title: "Write combat system docs",
      status: "done",
      priority: "low",
      assignee: "documenter",
      progress: 100,
    },
  ];
  for (const t of taskRows) await tasksRepo.create(t);

  // ── Standards ─────────────────────────────────────────────────────────
  await standardsRepo.create({
    projectId,
    category: "naming",
    title: "PascalCase for components",
    rule: "ECS components use PascalCase nouns (e.g. HealthComponent).",
    examples: ["struct HealthComponent { ... }"],
  });
  await standardsRepo.create({
    projectId,
    category: "performance",
    title: "No per-frame allocations",
    rule: "Avoid heap allocation inside Update/tick loops; pool instead.",
    examples: ["// pool projectiles instead of `new Projectile()`"],
    pattern: "new\\s+[A-Z]\\w*\\(",
  });
  await standardsRepo.create({
    projectId,
    category: "patterns",
    title: "Prefer composition over inheritance",
    rule: "Compose behaviors via components/systems, not deep class trees.",
  });
  await standardsRepo.create({
    projectId,
    category: "comments",
    title: "Document public systems",
    rule: "Every public system exposes a one-line summary of responsibility.",
  });
  await standardsRepo.create({
    projectId,
    category: "naming",
    title: "Spell out 'prototype'",
    rule: "Write 'prototype' in docs — avoid the abbreviation 'proto'.",
    examples: ["// prototype the nav-mesh, not 'proto the nav-mesh'"],
    pattern: "\\bproto\\b",
  });

  // ── Systems (a small dependency graph for the Architecture diagram) ───
  const inputSystem = await systemsRepo.create({
    projectId,
    name: "Input System",
    description: "Buffered input with action mapping.",
    category: "input",
    health: 90,
  });
  const combatCore = await systemsRepo.create({
    projectId,
    name: "Combat Core",
    description: "Owns the combat loop and hit resolution.",
    category: "core",
    health: 82,
    dependencies: [inputSystem.id],
  });
  const aiSubsystem = await systemsRepo.create({
    projectId,
    name: "AI Subsystem",
    description: "Behavior-tree driven enemy logic.",
    category: "ai",
    health: 68,
    dependencies: [combatCore.id],
  });
  await systemsRepo.create({
    projectId,
    name: "Boss Director",
    description: "Orchestrates multi-phase boss encounters.",
    category: "ai",
    health: 45,
    status: "planned",
    dependencies: [aiSubsystem.id, combatCore.id],
  });
  await systemsRepo.create({
    projectId,
    name: "Telemetry",
    description: "Legacy event logging — slated for replacement.",
    category: "tooling",
    health: 28,
    status: "deprecated",
  });

  // ── Commits ───────────────────────────────────────────────────────────
  const t0 = Date.now();
  await commitsRepo.create({
    projectId,
    sha: "a1b2c3d",
    message: "RFC-001: add dash i-frame window",
    author: "trookish",
    date: t0 - 2 * DAY,
    files: ["src/combat/Dash.cs", "src/combat/CombatLoop.cs"],
    additions: 64,
    deletions: 8,
    aiSummary:
      "Adds an invincibility window to the dash and wires it into the combat loop.",
    linkedSpecIds: [rfc1.id],
  });
  await commitsRepo.create({
    projectId,
    sha: "e4f5061",
    message: "RFC-002: scaffold behavior-tree runtime",
    author: "trookish",
    date: t0 - 1 * DAY,
    files: ["src/ai/BehaviorTree.cs"],
    additions: 120,
    deletions: 0,
    aiSummary: "Introduces a minimal behavior-tree runtime for enemy AI.",
    linkedSpecIds: [rfc2.id],
  });

  // ── Memories ──────────────────────────────────────────────────────────
  await memoriesRepo.create({
    projectId,
    type: "decision",
    content: "Chose ECS over OOP inheritance for entity composition.",
    weight: 0.9,
    tags: ["architecture"],
  });
  await memoriesRepo.create({
    projectId,
    type: "lesson",
    content: "Dash i-frames feel best at ~0.30s; shorter feels unfair.",
    weight: 0.7,
    tags: ["combat", "feel"],
  });
  await memoriesRepo.create({
    projectId,
    type: "preference",
    content: "Team prefers behavior trees over GOAP for readability.",
    weight: 0.6,
    tags: ["ai"],
  });

  // ── Dev logs ──────────────────────────────────────────────────────────
  // A multi-day timeline across types, some linked to real entities.
  const nowTs = Date.now();
  const devLogRows: Array<Parameters<typeof devLogsRepo.create>[0]> = [
    {
      projectId,
      type: "commit",
      title: "Dash i-frames landed",
      body: "Implemented the dash invincibility window (commit `a1b2c3d`).",
      createdAt: nowTs - 2 * 3_600_000,
    },
    {
      projectId,
      type: "change",
      title: "Refactored damage pipeline",
      body: "Split resolve/react stages so the **AI Subsystem** can react one frame earlier.",
      createdAt: nowTs - 5 * 3_600_000,
    },
    {
      projectId,
      type: "spec",
      title: "RFC-001 approved",
      body: "Combat loop spec approved and moved to implementation.",
      refType: "spec",
      refId: rfc1.id,
      createdAt: nowTs - DAY - 3 * 3_600_000,
    },
    {
      projectId,
      type: "system",
      title: "Combat Core health raised to 82",
      body: "Crit rounding bug fixed; coverage back above target.",
      refType: "system",
      refId: combatCore.id,
      createdAt: nowTs - DAY - 6 * 3_600_000,
    },
    {
      projectId,
      type: "task",
      title: "Added telemetry opt-out",
      body: "Players can now disable analytics in settings.",
      createdAt: nowTs - 3 * DAY,
    },
    {
      projectId,
      type: "change",
      title: "Migrated save format to v3",
      body: "Inventory now stored as deltas — see the Save File Format doc.",
      createdAt: nowTs - 3 * DAY - 2 * 3_600_000,
    },
  ];
  for (const row of devLogRows) await devLogsRepo.create(row);

  // ── Documentation ─────────────────────────────────────────────────────
  await docsRepo.create({
    projectId,
    title: "Getting Started",
    category: "guides",
    body: [
      "# Getting Started",
      "",
      "Welcome to **Aetheris**. This guide gets you from clone to first build.",
      "",
      "## Prerequisites",
      "",
      "- Unity 2022 LTS",
      "- .NET 8 SDK",
      "- Git LFS (assets are large)",
      "",
      "## Steps",
      "",
      "1. Clone the repo and run `git lfs pull`.",
      "2. Open the project in Unity.",
      "3. Press Play to enter the combat sandbox.",
      "",
      "> [!TIP]",
      "> Use the `~` console to spawn enemies for quick iteration.",
    ].join("\n"),
  });
  await docsRepo.create({
    projectId,
    title: "Combat System Overview",
    category: "architecture",
    body: [
      "# Combat System",
      "",
      "The combat core drives all damage resolution. It feeds the ==AI Subsystem== and the boss director.",
      "",
      "## Damage pipeline",
      "",
      "| Stage | Owner | Notes |",
      "|-------|-------|-------|",
      "| Input | Input System | buffered 6 frames |",
      "| Resolve | Combat Core | crit + armor |",
      "| React | AI Subsystem | telegraph next move |",
      "",
      "See the [design notes](https://example.com/combat) for the full spec.",
    ].join("\n"),
  });
  await docsRepo.create({
    projectId,
    title: "Save File Format",
    category: "api",
    body: [
      "# Save File Format",
      "",
      "Saves are JSON, versioned by `schemaVersion`.",
      "",
      "```json",
      '{ "schemaVersion": 3, "player": { "hp": 100 } }',
      "```",
      "",
      "- [x] v1 — flat keys",
      "- [x] v2 — nested player block",
      "- [ ] v3 — inventory deltas",
    ].join("\n"),
  });

  // ── Project Watcher events ────────────────────────────────────────────
  const watchRows: Array<{
    path: string;
    kind: "created" | "modified" | "deleted";
    systemId: string | null;
    agoMs: number;
  }> = [
    { path: "src/combat/CombatCore.cs", kind: "modified", systemId: combatCore.id, agoMs: 4 * 60_000 },
    { path: "config/balance.json", kind: "modified", systemId: combatCore.id, agoMs: 12 * 60_000 },
    { path: "src/ai/EnemyBehaviour.cs", kind: "modified", systemId: aiSubsystem.id, agoMs: 26 * 60_000 },
    { path: "assets/textures/hero_albedo.png", kind: "created", systemId: null, agoMs: 55 * 60_000 },
    { path: "src/input/InputSystem.cs", kind: "modified", systemId: inputSystem.id, agoMs: 90 * 60_000 },
    { path: "scenes/Old_Arena.scene", kind: "deleted", systemId: null, agoMs: 3 * 3_600_000 },
    { path: "shaders/Dissolve.shader", kind: "created", systemId: null, agoMs: 5 * 3_600_000 },
  ];
  const watchNow = Date.now();
  for (const w of watchRows) {
    await watchEventsRepo.create({
      projectId,
      path: w.path,
      kind: w.kind,
      fileType: inferFileType(w.path),
      systemId: w.systemId,
      createdAt: watchNow - w.agoMs,
    });
  }

  return projectId;
}
