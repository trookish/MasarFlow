/**
 * Demo project seeder.
 *
 * Seeds THREE sample projects so every project type MasarFlow supports is
 * visible at a glance:
 *   - **Pulse** (web app) — a realtime team dashboard SaaS.
 *   - **Lumen** (game) — a Unity 2D action-platformer.
 *   - **DraftDeck** (desktop) — a cross-platform markdown editor.
 *
 * Each is populated across every MasarFlow surface (notes, specs, standards,
 * tasks, sprints, systems, docs, dev logs, memories, commits, canvas, watcher
 * feed, sync index, chat, and the 16-step workflow) so every page lights up
 * with real, interlinked content — showing that MasarFlow works for software
 * apps, web apps, and games alike.
 *
 * Idempotent: a project with a demo slug is returned as-is if it already
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
import type {
  Assignee,
  EntityKind,
  TaskPriority,
  TaskStatus,
} from "@/lib/db/schema";

const DEMO_SLUGS = {
  web: "pulse-realtime-team-dashboard",
  game: "lumen-echoes-of-the-last-forge",
  desktop: "draftdeck-markdown-desktop-editor",
} as const;

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;

/** Epoch ms for `n` minutes ago. */
function ago(ms: number): number {
  return Date.now() - ms;
}

/** Seed all demo projects and return the primary (web app) project id. */
export async function seedDemoProject(): Promise<string> {
  const webId = await seedPulseDemo();
  await seedLumenDemo();
  await seedDraftDeckDemo();
  return webId;
}

async function seedProjectIfMissing(
  slug: string,
  seed: () => Promise<string>,
): Promise<string | null> {
  const existing = await db.projects.where("slug").equals(slug).first();
  if (existing) return existing.id;
  return seed();
}

/* ══ Demo 1 · Pulse — a realtime team dashboard (web app) ══════════════ */

async function seedPulseDemo(): Promise<string> {
  const existing = await seedProjectIfMissing(DEMO_SLUGS.web, () =>
    db.transaction("rw", db.tables, async () => {
      const projectId = await seedPulseProject();
      await seedPulseArchitecture(projectId);
      await seedPulseNotes(projectId);
      await seedPulseStandards(projectId);
      const ctx = await seedPulseSpecsTasks(projectId);
      await seedPulseDocs(projectId);
      await seedPulseDevLogs(projectId, ctx);
      await seedPulseMemories(projectId, ctx);
      await seedPulseCommits(projectId, ctx);
      await seedPulseCanvas(projectId, ctx);
      await seedPulseWatchAndSync(projectId);
      const connectionId = await seedAiConnection();
      await seedPulseChat(projectId, connectionId);
      await seedPulseWorkflow(projectId, connectionId);
      return projectId;
    }),
  );
  return (
    existing ??
    (await db.projects.where("slug").equals(DEMO_SLUGS.web).first())!.id
  );
}

async function seedPulseProject(): Promise<string> {
  const project = await projectsRepo.create({
    name: "Pulse: Realtime Team Dashboard",
    slug: DEMO_SLUGS.web,
    description:
      "A SaaS dashboard that streams live status, deployments, and alerts to engineering teams. Web app: React frontend, event-driven Node backend.",
    health: 82,
    archScore: 78,
    techDebt: 15,
    accent: "sky",
    createdAt: ago(30 * DAY),
    updatedAt: ago(3 * HOUR),
  });
  return project.id;
}

async function seedPulseArchitecture(projectId: string): Promise<void> {
  const client = await systemsRepo.create({
    projectId,
    name: "Web Client",
    description:
      "React + TypeScript SPA. Optimistic UI, live presence cursors, and a local cache that syncs through the gateway.",
    category: "frontend",
    status: "active",
    health: 88,
    dependencies: [],
    createdAt: ago(30 * DAY),
    updatedAt: ago(6 * HOUR),
  });
  const gateway = await systemsRepo.create({
    projectId,
    name: "API Gateway",
    description:
      "Edge auth, rate limiting, and request routing. Everything client-facing crosses here; it owns no business state.",
    category: "backend",
    status: "active",
    health: 84,
    dependencies: [],
    createdAt: ago(28 * DAY),
    updatedAt: ago(2 * DAY),
  });
  const realtime = await systemsRepo.create({
    projectId,
    name: "Realtime Engine",
    description:
      "WebSocket fan-out for presence, deploy streams, and alerts. Backpressure-aware; degrades to polling per channel.",
    category: "backend",
    status: "active",
    health: 74,
    dependencies: [gateway.id],
    createdAt: ago(20 * DAY),
    updatedAt: ago(5 * HOUR),
  });
  const analytics = await systemsRepo.create({
    projectId,
    name: "Analytics Pipeline",
    description:
      "Event ingestion → warehouse → dashboards. Batched, schema-versioned events with a dead-letter queue.",
    category: "data",
    status: "active",
    health: 70,
    dependencies: [gateway.id],
    createdAt: ago(12 * DAY),
    updatedAt: ago(1 * DAY),
  });
  const positions = [
    { id: client.id, label: "Web Client", x: 80, y: 240 },
    { id: gateway.id, label: "API Gateway", x: 320, y: 240 },
    { id: realtime.id, label: "Realtime Engine", x: 560, y: 120 },
    { id: analytics.id, label: "Analytics Pipeline", x: 560, y: 380 },
  ];
  for (const p of positions) {
    await archRepo.savePosition(projectId, p.id, p.label, p.x, p.y);
  }
}

async function seedPulseNotes(projectId: string): Promise<void> {
  const product = await foldersRepo.create({ projectId, name: "Product" });
  const eng = await foldersRepo.create({ projectId, name: "Engineering" });
  const stub = (
    title: string,
    type: Parameters<typeof notesRepo.create>[0]["type"],
    folderId: string,
    tags: string[],
  ) => notesRepo.create({ projectId, title, type, folderId, tags });
  const [northStar, ux, syncArch, backpressure] = await Promise.all([
    stub("North Star: Live by Default", "decision", product.id, [
      "vision",
      "pillars",
    ]),
    stub("Dashboard UX", "note", product.id, ["ui", "product"]),
    stub("Realtime Sync Architecture", "system", eng.id, [
      "architecture",
      "websockets",
    ]),
    stub("WebSocket Backpressure Study", "research", eng.id, [
      "realtime",
      "research",
    ]),
  ]);
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

Pulse is a **realtime team dashboard**: every meaningful change (deploys, alerts, PR status) shows up on the board *live*.

Three pillars:

1. **Live by default** — data arrives in < 1s or the UI says why it's stale.
2. **Calm at scale** — presence and streams must not drown the signal.
3. **Every team can adopt it in a day** — OAuth, one embed, done.

> Decision: realtime engine ships before analytics; live presence is the wedge.`,
    ago(29 * DAY),
    ago(1 * DAY),
  );
  await write(
    ux.id,
    `# Dashboard UX

Board-first layout with a "live" state chip on every card (see [[North Star: Live by Default]]).

## State model
- \`live\` — stream connected, data < 1s old.
- \`stale\` — reconnect backoff, shows last-seen timestamp.
- \`offline\` — degraded to polling; banner explains why.

Never show a spinner for more than 400ms: render last-known data immediately, patch it live.`,
    ago(21 * DAY),
    ago(12 * HOUR),
  );
  await write(
    syncArch.id,
    `# Realtime Sync Architecture

One WebSocket per workspace, multiplexed channels (presence, deploys, alerts). Reference the [[WebSocket Backpressure Study]] for the failure modes.

- Gateway terminates TLS; the Realtime Engine owns channels.
- Backpressure: slow consumers get delta-compressed snapshots, then a channel-level pause with a \`stale\` UI state.
- Reconnect: client sends \`lastSeq\` and the engine replays missed events from the outbox.`,
    ago(16 * DAY),
    ago(8 * HOUR),
  );
  await write(
    backpressure.id,
    `# WebSocket Backpressure Study

Question: what happens to a slow client on a busy workspace?

Findings:
- TCP-level backpressure stalls the event loop unless we cap per-socket queues (64KB).
- Delta compression cuts 87% of payload size on hot channels.
- Abandoned sockets must be pruned after 30s or the reconnect storm bites.

Next steps: cap + prune in the Realtime Engine, replay from the outbox (see [[Realtime Sync Architecture]]).`,
    ago(9 * DAY),
    ago(2 * DAY),
  );
}

async function seedPulseStandards(projectId: string): Promise<void> {
  await standardsRepo.create({
    projectId,
    category: "naming",
    title: "Component file names match exports",
    rule: "One component per file; the filename must equal the default export name (PascalCase).",
    examples: ["`DeployCard.tsx` exports `DeployCard`"],
    enforced: true,
    pattern: "",
    createdAt: ago(20 * DAY),
    updatedAt: ago(20 * DAY),
  });
  await standardsRepo.create({
    projectId,
    category: "structure",
    title: "Services communicate via events, not direct calls",
    rule: "Backend services exchange domain events over the outbox; a service never imports another service's repository.",
    examples: [
      "`DeploymentPublished` event → alert service, never `deployRepo.all()`",
    ],
    enforced: false,
    pattern: "",
    createdAt: ago(18 * DAY),
    updatedAt: ago(18 * DAY),
  });
}

interface PulseContext {
  specRealtime: string;
  specAnalytics: string;
  sprint: string;
  noteNorthStar: string;
  noteUx: string;
  taskBackpressure: string;
}

async function seedPulseSpecsTasks(projectId: string): Promise<PulseContext> {
  const sprint = await sprintsRepo.create({
    projectId,
    name: "Sprint 4 — Realtime Beta",
    goal: "Live presence + deploy streams on the board for five beta teams.",
    status: "active",
    startDate: ago(6 * DAY),
    endDate: ago(8 * DAY),
    createdAt: ago(6 * DAY),
    updatedAt: ago(2 * HOUR),
  });
  const specRealtime = await specsRepo.create({
    projectId,
    number: "SPEC-001",
    title: "Realtime Presence & Deploy Streams",
    status: "implementing",
    purpose:
      "Ship the live board: presence cursors, deploy events, and honest staleness.",
    goals: [
      "Live updates under 1s.",
      "Per-channel backpressure with a stale state.",
    ],
    features: [
      "Multiplexed WebSocket per workspace.",
      "Outbox replay on reconnect.",
      "Presence cursors.",
    ],
    constraints: [
      "No per-socket queue above 64KB.",
      "Degrade to polling per channel.",
    ],
    acceptance: [
      "Beta team sees a deploy land live in < 1s.",
      "Slow client shows stale, not frozen.",
    ],
    risks: ["Reconnect storms on flaky networks (see backpressure research)."],
    technicalNotes:
      "Delta-compressed snapshots; lastSeq replay from the outbox.",
    implementationProgress: 55,
    createdAt: ago(14 * DAY),
    updatedAt: ago(3 * HOUR),
  });
  const specAnalytics = await specsRepo.create({
    projectId,
    number: "SPEC-002",
    title: "Analytics Pipeline",
    status: "review",
    purpose:
      "Turn board events into dashboards without touching the realtime path.",
    goals: ["Schema-versioned events.", "Dead-letter queue for bad events."],
    features: [
      "Ingestion API behind the gateway.",
      "Warehouse load + dashboard refresh.",
    ],
    constraints: ["No reads from the realtime engine's store."],
    acceptance: ["Pipeline ingests 10k events/min without loss."],
    risks: ["Event schema drift across teams."],
    technicalNotes: "Batched loads; versioned envelopes; DLQ with replay UI.",
    implementationProgress: 30,
    createdAt: ago(10 * DAY),
    updatedAt: ago(1 * DAY),
  });
  const noteNorthStar = (await notesRepo.getByTitle(
    projectId,
    "North Star: Live by Default",
  ))!.id;
  const noteUx = (await notesRepo.getByTitle(projectId, "Dashboard UX"))!.id;

  const t = (title: string, over: TaskOver) =>
    tasksRepo.create({ projectId, title, ...over });
  const taskBackpressure = await t("Per-channel backpressure + stale state", {
    status: "in_progress",
    priority: "high",
    assignee: "programmer",
    specId: specRealtime.id,
    sprintId: sprint.id,
    description:
      "Cap queues at 64KB; flip channels to stale; show last-seen in the UI.",
    tags: ["realtime", "websockets"],
    progress: 60,
    createdAt: ago(4 * DAY),
    updatedAt: ago(2 * HOUR),
  });
  await t("Presence cursors on the board", {
    status: "todo",
    priority: "high",
    assignee: "programmer",
    specId: specRealtime.id,
    sprintId: sprint.id,
    description: "Avatar cursors for online teammates, pruned after 30s idle.",
    tags: ["realtime", "ui"],
    progress: 0,
    createdAt: ago(3 * DAY),
    updatedAt: ago(1 * DAY),
  });
  await t("Outbox replay on reconnect", {
    status: "todo",
    priority: "medium",
    assignee: "programmer",
    specId: specRealtime.id,
    sprintId: sprint.id,
    description:
      "lastSeq handshake + replay from the outbox; cap replay at 200 events.",
    tags: ["realtime"],
    progress: 10,
    createdAt: ago(3 * DAY),
    updatedAt: ago(1 * DAY),
  });
  await t("Deploy webhook ingestion", {
    status: "done",
    priority: "high",
    assignee: "programmer",
    specId: specRealtime.id,
    sprintId: sprint.id,
    description: "GitHub/GitLab webhooks → gateway → realtime channel.",
    tags: ["backend"],
    progress: 100,
    createdAt: ago(12 * DAY),
    updatedAt: ago(5 * DAY),
  });
  await t("Event schema registry", {
    status: "review",
    priority: "medium",
    assignee: "architect",
    specId: specAnalytics.id,
    sprintId: sprint.id,
    description: "Versioned envelopes + validation before the DLQ.",
    tags: ["analytics", "data"],
    progress: 80,
    createdAt: ago(8 * DAY),
    updatedAt: ago(4 * HOUR),
  });
  await t("Beta onboarding checklist", {
    status: "backlog",
    priority: "low",
    assignee: "human",
    specId: null,
    sprintId: sprint.id,
    description: "OAuth + embed instructions for the five beta teams.",
    tags: ["product"],
    progress: 0,
    createdAt: ago(1 * DAY),
    updatedAt: ago(1 * DAY),
  });

  await specsRepo.update(specRealtime.id, {
    linkedNoteIds: [noteNorthStar, noteUx],
    linkedTaskIds: [taskBackpressure.id],
  });
  await linksRepo.create({
    projectId,
    sourceType: "spec" as EntityKind,
    sourceId: specRealtime.id,
    targetType: "task" as EntityKind,
    targetId: taskBackpressure.id,
    linkType: "implements",
  });

  return {
    specRealtime: specRealtime.id,
    specAnalytics: specAnalytics.id,
    sprint: sprint.id,
    noteNorthStar,
    noteUx,
    taskBackpressure: taskBackpressure.id,
  };
}

async function seedPulseDocs(projectId: string): Promise<void> {
  await docsRepo.create({
    projectId,
    title: "Welcome to Pulse",
    category: "guides",
    body: `# Welcome to Pulse

Pulse is a realtime team dashboard SaaS. This workspace is the single source of truth for its product and engineering.

## Where to start
- **Brain** holds product decisions and the sync architecture notes.
- **Specifications** turn them into shippable contracts.
- **Task Boards** and **Sprints** track the work.
- **Architecture** maps the services and their boundaries.

Every feature has a path: idea → note → spec → tasks → commits.`,
    createdAt: ago(28 * DAY),
    updatedAt: ago(3 * DAY),
  });
  await docsRepo.create({
    projectId,
    title: "Architecture Overview",
    category: "engineering",
    body: `# Architecture Overview

The **Web Client** talks only to the **API Gateway**, which owns auth, rate limiting, and routing. The **Realtime Engine** fans out presence/deploy/alert streams; the **Analytics Pipeline** ingests events for dashboards.

## Boundaries
- Gateway holds no business state.
- Realtime Engine owns channels; slow consumers degrade to stale.
- Analytics never reads the realtime store.`,
    createdAt: ago(15 * DAY),
    updatedAt: ago(2 * DAY),
  });
}

async function seedPulseDevLogs(
  projectId: string,
  ctx: PulseContext,
): Promise<void> {
  await devLogsRepo.create({
    projectId,
    type: "task",
    title: "Deploy webhooks live for beta",
    body: "GitHub + GitLab webhooks flowing into the board; five teams onboarded.",
    refType: "task",
    refId: ctx.taskBackpressure,
    createdAt: ago(2 * HOUR),
  });
  await devLogsRepo.create({
    projectId,
    type: "spec",
    title: "SPEC-001 hit 55% implementation",
    body: "Presence cursors next; backpressure pass in flight.",
    refType: "spec",
    refId: ctx.specRealtime,
    createdAt: ago(5 * HOUR),
  });
  await devLogsRepo.create({
    projectId,
    type: "agent",
    title: "Architect agent flagged reconnect storms",
    body: "Suggested outbox replay + socket pruning from the backpressure research.",
    createdAt: ago(1 * DAY),
  });
}

async function seedPulseMemories(
  projectId: string,
  ctx: PulseContext,
): Promise<void> {
  await memoriesRepo.create({
    projectId,
    type: "decision",
    content:
      "Realtime engine ships before analytics — live presence is the wedge. Decided in the north-star note.",
    weight: 0.9,
    tags: ["realtime", "product"],
    sourceType: "note",
    sourceId: ctx.noteNorthStar,
    createdAt: ago(29 * DAY),
    updatedAt: ago(29 * DAY),
  });
  await memoriesRepo.create({
    projectId,
    type: "lesson",
    content:
      "Never let TCP backpressure stall the event loop: cap per-socket queues and degrade to a stale UI state.",
    weight: 0.85,
    tags: ["websockets", "realtime"],
    sourceType: "note",
    sourceId: ctx.noteUx,
    createdAt: ago(9 * DAY),
    updatedAt: ago(9 * DAY),
  });
}

async function seedPulseCommits(
  projectId: string,
  ctx: PulseContext,
): Promise<void> {
  await commitsRepo.create({
    projectId,
    sha: "9f21ac3d77b1",
    message: "feat(realtime): per-channel backpressure + stale state",
    author: "ada@team",
    date: ago(2 * HOUR),
    files: ["src/realtime/channel.ts", "src/realtime/backpressure.ts"],
    additions: 486,
    deletions: 12,
    aiSummary:
      "Caps per-socket queues at 64KB and flips slow channels to a stale UI state with last-seen timestamps. Progresses SPEC-001.",
    linkedSpecIds: [ctx.specRealtime],
    linkedTaskIds: [ctx.taskBackpressure],
    createdAt: ago(2 * HOUR),
  });
  await commitsRepo.create({
    projectId,
    sha: "4d0b7e51c902",
    message: "feat(gateway): deploy webhook ingestion",
    author: "ada@team",
    date: ago(5 * DAY),
    files: ["src/gateway/webhooks.ts", "src/gateway/routes.ts"],
    additions: 312,
    deletions: 8,
    aiSummary:
      "GitHub and GitLab webhooks normalize into deployment events and publish to the realtime engine.",
    linkedSpecIds: [ctx.specRealtime],
    createdAt: ago(5 * DAY),
  });
}

async function seedPulseCanvas(
  projectId: string,
  ctx: PulseContext,
): Promise<void> {
  const canvas = await canvasRepo.create({
    projectId,
    name: "Realtime feature map",
    description: "How live presence, backpressure, and the board tie together.",
  });
  const ux = await canvasRepo.addNode({
    canvasId: canvas.id,
    type: "text",
    x: 40,
    y: 40,
    width: 220,
    height: 120,
    color: "sky",
    data: {
      text: "UX STATES\n\n• live < 1s\n• stale + last-seen\n• offline → polling",
    },
  });
  const arch = await canvasRepo.addNode({
    canvasId: canvas.id,
    type: "note",
    x: 320,
    y: 40,
    width: 240,
    height: 140,
    color: "violet",
    data: {
      noteId: ctx.noteUx,
      text: "Dashboard UX\nState chips + board-first layout",
    },
  });
  const spec = await canvasRepo.addNode({
    canvasId: canvas.id,
    type: "link",
    x: 320,
    y: 240,
    width: 240,
    height: 120,
    color: "amber",
    data: {
      url: `/specs?spec=${ctx.specRealtime}`,
      text: "SPEC-001 · Realtime Sync",
    },
  });
  await canvasRepo.addEdge({
    canvasId: canvas.id,
    source: ux.id,
    target: arch.id,
    label: "drives",
  });
  await canvasRepo.addEdge({
    canvasId: canvas.id,
    source: arch.id,
    target: spec.id,
    label: "specifies",
  });
}

async function seedPulseWatchAndSync(projectId: string): Promise<void> {
  const systems = await systemsRepo.listByProject(projectId);
  const byName = (name: string) =>
    systems.find((s) => s.name === name)?.id ?? null;
  await watchEventsRepo.create({
    projectId,
    path: "src/realtime/backpressure.ts",
    kind: "modified",
    fileType: "code",
    systemId: byName("Realtime Engine"),
    createdAt: ago(2 * HOUR),
  });
  await watchEventsRepo.create({
    projectId,
    path: "src/gateway/webhooks.ts",
    kind: "created",
    fileType: "code",
    systemId: byName("API Gateway"),
    createdAt: ago(5 * DAY),
  });
  await watchEventsRepo.create({
    projectId,
    path: "web/package.json",
    kind: "modified",
    fileType: "config",
    systemId: null,
    createdAt: ago(1 * DAY),
  });
  await syncRepo.replaceAll(projectId, [
    {
      path: "product/north-star.md",
      hash: "w1",
      status: "synced",
      entityType: "note",
      entityId: "demo",
      lastSyncedAt: ago(2 * DAY),
    },
    {
      path: "specs/SPEC-001.md",
      hash: "w2",
      status: "local_modified",
      entityType: "spec",
      entityId: "demo",
      lastSyncedAt: ago(1 * DAY),
    },
    {
      path: "docs/architecture.md",
      hash: "w3",
      status: "synced",
      entityType: "doc",
      entityId: "demo",
      lastSyncedAt: ago(2 * DAY),
    },
    {
      path: "config/feature_flags.json",
      hash: "w4",
      status: "conflict",
      entityType: null,
      entityId: null,
      lastSyncedAt: ago(1 * DAY),
    },
  ]);
}

async function seedPulseChat(
  projectId: string,
  connectionId: string,
): Promise<void> {
  const thread = await chatThreadsRepo.create({
    projectId,
    connectionId,
    modelId: "claude-sonnet-4-5",
    title: "Backpressure design review",
    mode: "agentic",
    reasoningEnabled: false,
    createdAt: ago(3 * HOUR),
    updatedAt: ago(2 * HOUR),
  });
  await chatMessagesRepo.create({
    threadId: thread.id,
    role: "user",
    content:
      "Our realtime engine stalls when a slow client stops reading. Given the backpressure research and the north-star pillars, how should we handle slow consumers?",
    createdAt: ago(3 * HOUR),
  });
  await chatMessagesRepo.create({
    threadId: thread.id,
    role: "assistant",
    content:
      "Cap per-socket queues at **64KB** and degrade to a per-channel `stale` state instead of letting TCP backpressure stall the loop.\n\n- On queue full: stop enqueueing, flip the channel to `stale`, and send the client a `lastSeq` hint.\n- On reconnect: replay missed events from the outbox (max 200) before resuming live.\n- Prune abandoned sockets after 30s so reconnect storms can't pile up.\n\nI've linked the backpressure research note and the in-flight task for the implementation.",
    reasoning: "",
    toolActivity: [
      {
        name: "readNote",
        summary: "WebSocket Backpressure Study",
        ok: true,
        running: false,
      },
      {
        name: "readNote",
        summary: "Realtime Sync Architecture",
        ok: true,
        running: false,
      },
      {
        name: "updateTask",
        summary: "Per-channel backpressure + stale state",
        ok: true,
        running: false,
      },
    ],
    createdAt: ago(2 * HOUR),
  });
}

async function seedPulseWorkflow(
  projectId: string,
  connectionId: string,
): Promise<void> {
  const run = await workflowRepo.createRun({
    projectId,
    connectionId,
    modelId: "claude-sonnet-4-5",
    title: "Live presence — idea to implementation",
    idea: "Show live presence cursors and deploy streams on the dashboard with an honest stale state.",
  });
  const steps = await workflowRepo.listSteps(run.id);
  const done = [
    {
      key: "clarify",
      output:
        "Live < 1s, calm at scale, adoptable in a day. Presence is the wedge; stale beats frozen.",
    },
    {
      key: "research",
      output:
        "Backpressure study: cap queues at 64KB, delta-compress, prune sockets after 30s.",
    },
    {
      key: "spec",
      output:
        "Drafted SPEC-001 (Realtime Presence & Deploy Streams) with acceptance and risks.",
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
  const next = steps[done.length];
  if (next) await workflowRepo.updateStep(next.id, { status: "running" });
}

/* ══ Demo 2 · Lumen — a Unity 2D action-platformer (game) ══════════════ */

async function seedLumenDemo(): Promise<string> {
  const existing = await seedProjectIfMissing(DEMO_SLUGS.game, () =>
    db.transaction("rw", db.tables, async () => {
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
    }),
  );
  return (
    existing ??
    (await db.projects.where("slug").equals(DEMO_SLUGS.game).first())!.id
  );
}

/* ── Project ──────────────────────────────────────────────────────────────── */

async function seedCoreProject(): Promise<string> {
  const project = await projectsRepo.create({
    name: "Lumen: Echoes of the Last Forge",
    slug: DEMO_SLUGS.game,
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
  const [
    northStar,
    combatDesign,
    echoForge,
    enemyRoster,
    lumen,
    theForge,
    hitstop,
    frameBudget,
  ] = await Promise.all([
    stub("North Star: A Fading Sun", "decision", design.id, [
      "vision",
      "pillars",
    ]),
    stub("Combat Design", "mechanic", design.id, ["combat", "game-feel"]),
    stub("Echo Forge Ability", "mechanic", design.id, ["abilities", "combat"]),
    stub("Enemy Roster: The Hollowed", "system", design.id, ["enemies", "ai"]),
    stub("Lumen, the Last Spark", "lore", narrative.id, ["character", "story"]),
    stub("The Last Forge", "lore", narrative.id, ["world", "story"]),
    stub("Game-feel Research: Hitstop", "research", tech.id, [
      "game-feel",
      "research",
    ]),
    stub("Frame Budget Audit", "experiment", tech.id, [
      "performance",
      "profiling",
    ]),
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
    examples: [
      "Replace `TODO: decide window` with the decided value before promoting.",
    ],
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

async function seedSpecsSprintsTasks(projectId: string): Promise<SeedContext> {
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
    acceptance: [
      "Player crosses the graybox course in < 40s without exploits.",
    ],
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
    goals: [
      "Forward-compatible versioned blobs.",
      "Checkpoint + death reload.",
    ],
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
    purpose:
      "The signature mechanic: forge a defeated boss's move into Lumen's kit.",
    goals: [
      "One forged echo at a time.",
      "Ember charge economy shared with heavy attacks.",
    ],
    features: [
      "Forge slot UI.",
      "Boss-kill unlock trigger.",
      "Echo swap SFX + VFX.",
    ],
    constraints: ["Must not bloat the combo graph complexity."],
    acceptance: ["Forge/swap under 200ms with no sim stall."],
    risks: ["Slot-limit tension with combo depth (see Echo Forge note)."],
    technicalNotes:
      "Abilities are data-driven slots; forge = swap the active slot.",
    implementationProgress: 0,
    createdAt: ago(13 * DAY),
    updatedAt: ago(9 * HOUR),
  });

  // Resolve note ids for linking.
  const noteNorthStar = (await notesRepo.getByTitle(
    projectId,
    "North Star: A Fading Sun",
  ))!.id;
  const noteCombat = (await notesRepo.getByTitle(projectId, "Combat Design"))!
    .id;
  const noteEchoForge = (await notesRepo.getByTitle(
    projectId,
    "Echo Forge Ability",
  ))!.id;
  const noteEnemyRoster = (await notesRepo.getByTitle(
    projectId,
    "Enemy Roster: The Hollowed",
  ))!.id;

  // Tasks — a spread of statuses, priorities, and assignees.
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
    description:
      "Nail the window between 80 and 120ms; write the decision note.",
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
async function wireSpecLinks(
  projectId: string,
  ctx: SeedContext,
): Promise<void> {
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

async function seedDevLogs(projectId: string, ctx: SeedContext): Promise<void> {
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

async function seedCommits(projectId: string, ctx: SeedContext): Promise<void> {
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

async function seedCanvas(projectId: string, ctx: SeedContext): Promise<void> {
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
    data: {
      text: "FEEL TARGETS\n\n• Input→impact < 3 frames\n• Hitstop 40–80ms\n• I-frames on dash",
    },
  });
  const combo = await canvasRepo.addNode({
    canvasId: canvas.id,
    type: "note",
    x: 320,
    y: 40,
    width: 240,
    height: 140,
    color: "violet",
    data: {
      noteId: ctx.noteCombat,
      text: "Combat Design\nCombo graph + hurt pipeline",
    },
  });
  const forge = await canvasRepo.addNode({
    canvasId: canvas.id,
    type: "note",
    x: 640,
    y: 40,
    width: 240,
    height: 140,
    color: "violet",
    data: {
      noteId: ctx.noteEchoForge,
      text: "Echo Forge\nOne slot, ember economy",
    },
  });
  const enemies = await canvasRepo.addNode({
    canvasId: canvas.id,
    type: "note",
    x: 320,
    y: 240,
    width: 240,
    height: 140,
    color: "violet",
    data: {
      noteId: ctx.noteEnemyRoster,
      text: "The Hollowed\nBosses gate forge unlocks",
    },
  });
  const spec = await canvasRepo.addNode({
    canvasId: canvas.id,
    type: "link",
    x: 640,
    y: 240,
    width: 240,
    height: 120,
    color: "sky",
    data: {
      url: `/specs?spec=${ctx.specCombat}`,
      text: "SPEC-002 · Melee Combat",
    },
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
  const byName = (name: string) =>
    systems.find((s) => s.name === name)?.id ?? null;

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
    {
      path: "design/north-star.md",
      hash: "d1",
      status: "synced",
      entityType: "note",
      entityId: "demo",
      lastSyncedAt: ago(2 * DAY),
    },
    {
      path: "design/combat.md",
      hash: "d2",
      status: "local_modified",
      entityType: "note",
      entityId: "demo",
      lastSyncedAt: ago(2 * DAY),
    },
    {
      path: "specs/SPEC-002.md",
      hash: "d3",
      status: "local_modified",
      entityType: "spec",
      entityId: "demo",
      lastSyncedAt: ago(1 * DAY),
    },
    {
      path: "specs/SPEC-005.md",
      hash: "d4",
      status: "new",
      entityType: "spec",
      entityId: "demo",
      lastSyncedAt: null,
    },
    {
      path: "docs/architecture.md",
      hash: "d5",
      status: "synced",
      entityType: "doc",
      entityId: "demo",
      lastSyncedAt: ago(3 * DAY),
    },
    {
      path: "docs/welcome.md",
      hash: "d6",
      status: "synced",
      entityType: "doc",
      entityId: "demo",
      lastSyncedAt: ago(2 * DAY),
    },
    {
      path: "assets/vfx/forge_burst.prefab",
      hash: "d7",
      status: "remote_modified",
      entityType: null,
      entityId: null,
      lastSyncedAt: ago(1 * DAY),
    },
    {
      path: "config/frame_budget.json",
      hash: "d8",
      status: "conflict",
      entityType: null,
      entityId: null,
      lastSyncedAt: ago(1 * DAY),
    },
  ]);
}

/* ── AI connection + chat + workflow ──────────────────────────────────────── */

async function seedAiConnection(): Promise<string> {
  // Idempotent: one shared demo connection across all demo projects.
  const existing = await aiConnectionsRepo.list();
  const demo = existing.find(
    (c) => c.providerId === "anthropic" && c.label.startsWith("Demo"),
  );
  if (demo) return demo.id;
  const conn = await aiConnectionsRepo.create({
    providerId: "anthropic",
    label: "Demo — add your API key in Chat",
    apiKey: "",
    baseUrl: "",
  });
  return conn.id;
}

async function seedChat(
  projectId: string,
  connectionId: string,
): Promise<void> {
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
      {
        name: "readNote",
        summary: "North Star: A Fading Sun",
        ok: true,
        running: false,
      },
      {
        name: "readNote",
        summary: "Game-feel Research: Hitstop",
        ok: true,
        running: false,
      },
      {
        name: "createTask",
        summary: "Perfect-block window decision",
        ok: true,
        running: false,
      },
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
    idea: "Let Lumen forge a defeated boss's signature move into her kit, one at a time, spending the shared ember resource.",
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

/* ══ Demo 3 · DraftDeck — a markdown desktop editor (software app) ══════ */

async function seedDraftDeckDemo(): Promise<string> {
  const existing = await seedProjectIfMissing(DEMO_SLUGS.desktop, () =>
    db.transaction("rw", db.tables, async () => {
      const projectId = await seedDraftDeckProject();
      await seedDraftDeckArchitecture(projectId);
      await seedDraftDeckNotes(projectId);
      await seedDraftDeckStandards(projectId);
      const ctx = await seedDraftDeckSpecsTasks(projectId);
      await seedDraftDeckDocs(projectId);
      await seedDraftDeckDevLogs(projectId);
      await seedDraftDeckMemories(projectId);
      await seedDraftDeckCommits(projectId, ctx);
      await seedDraftDeckCanvas(projectId);
      await seedDraftDeckWatchAndSync(projectId);
      const connectionId = await seedAiConnection();
      await seedDraftDeckChat(projectId, connectionId);
      await seedDraftDeckWorkflow(projectId, connectionId);
      return projectId;
    }),
  );
  return (
    existing ??
    (await db.projects.where("slug").equals(DEMO_SLUGS.desktop).first())!.id
  );
}

async function seedDraftDeckProject(): Promise<string> {
  const project = await projectsRepo.create({
    name: "DraftDeck: Markdown Desktop Editor",
    slug: DEMO_SLUGS.desktop,
    description:
      "A fast, local-first markdown editor for desktop. Cross-platform (Electron), plugin runtime, and offline-first sync.",
    health: 70,
    archScore: 72,
    techDebt: 28,
    accent: "emerald",
    createdAt: ago(26 * DAY),
    updatedAt: ago(4 * HOUR),
  });
  return project.id;
}

async function seedDraftDeckArchitecture(projectId: string): Promise<void> {
  const core = await systemsRepo.create({
    projectId,
    name: "Editor Core",
    description:
      "CodeMirror-based editing surface: cursor/scroll state, markdown parsing, and the command palette. No IO except through ports.",
    category: "frontend",
    status: "active",
    health: 90,
    dependencies: [],
    createdAt: ago(26 * DAY),
    updatedAt: ago(2 * DAY),
  });
  const sync = await systemsRepo.create({
    projectId,
    name: "Sync Engine",
    description:
      "Offline-first file sync: local journal, conflict detection, and a push/pull bridge to cloud vaults.",
    category: "backend",
    status: "active",
    health: 64,
    dependencies: [core.id],
    createdAt: ago(18 * DAY),
    updatedAt: ago(6 * HOUR),
  });
  const plugins = await systemsRepo.create({
    projectId,
    name: "Plugin Runtime",
    description:
      "Sandboxed WASM plugins with a versioned host API. Commands, themes, and export pipelines live here.",
    category: "platform",
    status: "active",
    health: 58,
    dependencies: [core.id],
    createdAt: ago(12 * DAY),
    updatedAt: ago(1 * DAY),
  });
  const positions = [
    { id: core.id, label: "Editor Core", x: 80, y: 240 },
    { id: sync.id, label: "Sync Engine", x: 320, y: 380 },
    { id: plugins.id, label: "Plugin Runtime", x: 320, y: 100 },
  ];
  for (const p of positions) {
    await archRepo.savePosition(projectId, p.id, p.label, p.x, p.y);
  }
}

async function seedDraftDeckNotes(projectId: string): Promise<void> {
  const product = await foldersRepo.create({ projectId, name: "Product" });
  const eng = await foldersRepo.create({ projectId, name: "Engineering" });
  const stub = (
    title: string,
    type: Parameters<typeof notesRepo.create>[0]["type"],
    folderId: string,
    tags: string[],
  ) => notesRepo.create({ projectId, title, type, folderId, tags });
  const [northStar, editorFeel, syncDesign] = await Promise.all([
    stub("North Star: Zero-friction Writing", "decision", product.id, [
      "vision",
      "pillars",
    ]),
    stub("Editor Feel", "note", product.id, ["ux", "editing"]),
    stub("Offline Sync Design", "system", eng.id, ["sync", "architecture"]),
  ]);
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

DraftDeck is a **desktop markdown editor** that gets out of the way: open, write, done.

Three pillars:

1. **Zero-friction writing** — launch to a blank buffer in < 1s; autosave is silent.
2. **Local-first** — files live on disk; sync is a bridge, never a lock.
3. **Extensible without weight** — plugins add power, the core stays lean.

> Decision: offline-first sync ships before the plugin store.`,
    ago(25 * DAY),
    ago(1 * DAY),
  );
  await write(
    editorFeel.id,
    `# Editor Feel

Everything the cursor does should feel instant (see [[North Star: Zero-friction Writing]]).

- Keystroke → screen: < 16ms p95.
- Autosave: debounced 800ms, written to the local journal — never a modal.
- Find/replace and the palette are single-keypress away.

Anything that can't hit those targets gets pushed behind an async hint (spinner, inline progress), never a blocking dialog.`,
    ago(17 * DAY),
    ago(12 * HOUR),
  );
  await write(
    syncDesign.id,
    `# Offline Sync Design

Every keystroke lands in the **local journal** first; sync pushes journal entries to the vault and pulls remote ones back.

- Conflicts: last-writer-wins per block, with a per-file diff saved for review.
- Lock-free: no file locking, ever — the vault is treated as a dumb store.
- See [[North Star: Zero-friction Writing]] for why sync must never block writing.`,
    ago(11 * DAY),
    ago(6 * HOUR),
  );
}

async function seedDraftDeckStandards(projectId: string): Promise<void> {
  await standardsRepo.create({
    projectId,
    category: "naming",
    title: "Commands are verb-noun and kebab-case",
    rule: "Every palette command and plugin command is kebab-case verb-noun (e.g. export-pdf).",
    examples: ["`export-pdf`, `toggle-focus`, not `pdf` or `ExportPDF`"],
    enforced: true,
    pattern: "",
    createdAt: ago(15 * DAY),
    updatedAt: ago(15 * DAY),
  });
  await standardsRepo.create({
    projectId,
    category: "structure",
    title: "Editor Core touches IO only through ports",
    rule: "The core defines ports (files, clipboard, sync); adapters implement them. No direct fs or network calls inside the core.",
    examples: ["`FilePort.write` not `fs.writeFileSync`"],
    enforced: false,
    pattern: "",
    createdAt: ago(13 * DAY),
    updatedAt: ago(13 * DAY),
  });
}

interface DraftDeckContext {
  specPlugin: string;
  specSync: string;
  taskPluginHost: string;
}

async function seedDraftDeckSpecsTasks(
  projectId: string,
): Promise<DraftDeckContext> {
  const sprint = await sprintsRepo.create({
    projectId,
    name: "Sprint 2 — Plugins",
    goal: "Ship the plugin host with two first-party plugins.",
    status: "active",
    startDate: ago(4 * DAY),
    endDate: ago(10 * DAY),
    createdAt: ago(4 * DAY),
    updatedAt: ago(2 * HOUR),
  });
  const specPlugin = await specsRepo.create({
    projectId,
    number: "SPEC-001",
    title: "Plugin API",
    status: "draft",
    purpose: "Let third parties extend DraftDeck without touching the core.",
    goals: [
      "WASM sandbox with a versioned host API.",
      "Commands, themes, and export pipelines.",
    ],
    features: [
      "Manifest-based registration.",
      "Permission-gated host capabilities.",
      "Plugin gallery metadata.",
    ],
    constraints: [
      "No blocking IO inside the sandbox.",
      "Core must never crash on a plugin fault.",
    ],
    acceptance: ["A hello-world plugin loads and runs in < 300ms."],
    risks: ["API churn breaking old plugins; version pinning needed."],
    technicalNotes:
      "Host API versioned; plugins declare the version they target.",
    implementationProgress: 20,
    createdAt: ago(8 * DAY),
    updatedAt: ago(1 * DAY),
  });
  const specSync = await specsRepo.create({
    projectId,
    number: "SPEC-002",
    title: "Offline-first Sync",
    status: "approved",
    purpose: "Sync vaults without ever blocking writing.",
    goals: [
      "Local journal first; sync as a bridge.",
      "Block-level conflict diff.",
    ],
    features: [
      "Push/pull with last-writer-wins per block.",
      "Conflict diff saved next to the file.",
    ],
    constraints: ["No file locking.", "Sync must degrade to offline silently."],
    acceptance: ["Edit on two machines converges without data loss."],
    risks: ["Large vaults stalling the journal flush."],
    technicalNotes:
      "Journal is a CRDT-friendly append log; compaction on idle.",
    implementationProgress: 15,
    createdAt: ago(9 * DAY),
    updatedAt: ago(2 * DAY),
  });
  const noteNorthStar = (await notesRepo.getByTitle(
    projectId,
    "North Star: Zero-friction Writing",
  ))!.id;

  const t = (title: string, over: TaskOver) =>
    tasksRepo.create({ projectId, title, ...over });
  const taskPluginHost = await t("WASM host with permission gates", {
    status: "in_progress",
    priority: "high",
    assignee: "programmer",
    specId: specPlugin.id,
    sprintId: sprint.id,
    description: "Sandboxed WASM host; capability flags per plugin.",
    tags: ["plugins", "wasm"],
    progress: 45,
    createdAt: ago(3 * DAY),
    updatedAt: ago(2 * HOUR),
  });
  await t("Command palette registry", {
    status: "todo",
    priority: "high",
    assignee: "programmer",
    specId: specPlugin.id,
    sprintId: sprint.id,
    description: "Core commands + plugin commands in one registry.",
    tags: ["plugins", "ux"],
    progress: 0,
    createdAt: ago(2 * DAY),
    updatedAt: ago(1 * DAY),
  });
  await t("Journal flush + compaction", {
    status: "done",
    priority: "high",
    assignee: "programmer",
    specId: specSync.id,
    sprintId: sprint.id,
    description: "Debounced autosave to the journal; compaction on idle.",
    tags: ["sync"],
    progress: 100,
    createdAt: ago(12 * DAY),
    updatedAt: ago(3 * DAY),
  });
  await t("Conflict diff view", {
    status: "review",
    priority: "medium",
    assignee: "designer",
    specId: specSync.id,
    sprintId: sprint.id,
    description: "Per-file before/after review UI for conflicted blocks.",
    tags: ["sync", "ui"],
    progress: 75,
    createdAt: ago(4 * DAY),
    updatedAt: ago(5 * HOUR),
  });
  await t("Export-to-PDF sample plugin", {
    status: "backlog",
    priority: "low",
    assignee: "programmer",
    specId: specPlugin.id,
    sprintId: sprint.id,
    description: "First-party plugin exercising the export pipeline.",
    tags: ["plugins"],
    progress: 0,
    createdAt: ago(1 * DAY),
    updatedAt: ago(1 * DAY),
  });

  await specsRepo.update(specPlugin.id, {
    linkedNoteIds: [noteNorthStar],
    linkedTaskIds: [taskPluginHost.id],
  });

  return {
    specPlugin: specPlugin.id,
    specSync: specSync.id,
    taskPluginHost: taskPluginHost.id,
  };
}

async function seedDraftDeckDocs(projectId: string): Promise<void> {
  await docsRepo.create({
    projectId,
    title: "Welcome to DraftDeck",
    category: "guides",
    body: `# Welcome to DraftDeck

DraftDeck is a cross-platform markdown desktop editor. This workspace tracks its product and engineering.

## Where to start
- **Brain** holds product decisions and the sync design.
- **Specifications** cover the plugin API and offline sync.
- **Task Boards** and **Sprints** track the work.
- **Architecture** maps the editor core, sync engine, and plugin runtime.`,
    createdAt: ago(24 * DAY),
    updatedAt: ago(2 * DAY),
  });
}

async function seedDraftDeckDevLogs(projectId: string): Promise<void> {
  await devLogsRepo.create({
    projectId,
    type: "task",
    title: "Journal flush shipped",
    body: "Autosave is silent and debounced; compaction runs on idle.",
    createdAt: ago(3 * DAY),
  });
  await devLogsRepo.create({
    projectId,
    type: "agent",
    title: "Architect agent proposed WASM sandbox",
    body: "Suggested permission-gated WASM over Node child processes for plugin isolation.",
    createdAt: ago(1 * DAY),
  });
}

async function seedDraftDeckMemories(projectId: string): Promise<void> {
  await memoriesRepo.create({
    projectId,
    type: "decision",
    content:
      "Local-first, always: files live on disk and sync is a bridge — never a lock. Decided in the north-star note.",
    weight: 0.9,
    tags: ["architecture", "product"],
    sourceType: "note",
    sourceId: (await notesRepo.getByTitle(
      projectId,
      "North Star: Zero-friction Writing",
    ))!.id,
    createdAt: ago(25 * DAY),
    updatedAt: ago(25 * DAY),
  });
}

async function seedDraftDeckCommits(
  projectId: string,
  ctx: DraftDeckContext,
): Promise<void> {
  await commitsRepo.create({
    projectId,
    sha: "b13f9021c4da",
    message: "feat(sync): journal flush + compaction",
    author: "noa@studio",
    date: ago(3 * DAY),
    files: ["src/sync/journal.ts", "src/sync/compaction.ts"],
    additions: 402,
    deletions: 9,
    aiSummary:
      "Debounced autosave into the local journal with idle-time compaction. Progresses SPEC-002.",
    linkedSpecIds: [ctx.specSync],
    createdAt: ago(3 * DAY),
  });
  await commitsRepo.create({
    projectId,
    sha: "e7a05d8b3f11",
    message: "feat(plugins): WASM host skeleton",
    author: "kai@studio",
    date: ago(1 * DAY),
    files: ["src/plugins/host.ts", "src/plugins/manifest.ts"],
    additions: 355,
    deletions: 2,
    aiSummary:
      "Sandboxed WASM host with per-plugin capability flags. Progresses SPEC-001.",
    linkedSpecIds: [ctx.specPlugin],
    linkedTaskIds: [ctx.taskPluginHost],
    createdAt: ago(1 * DAY),
  });
}

async function seedDraftDeckCanvas(projectId: string): Promise<void> {
  const canvas = await canvasRepo.create({
    projectId,
    name: "Plugin API sketch",
    description: "How the core, host, and plugins relate.",
  });
  const core = await canvasRepo.addNode({
    canvasId: canvas.id,
    type: "text",
    x: 40,
    y: 40,
    width: 220,
    height: 120,
    color: "emerald",
    data: {
      text: "EDITOR CORE\n\n• CodeMirror surface\n• Command palette\n• Ports, no IO",
    },
  });
  const host = await canvasRepo.addNode({
    canvasId: canvas.id,
    type: "note",
    x: 320,
    y: 40,
    width: 240,
    height: 140,
    color: "violet",
    data: {
      noteId: (await notesRepo.getByTitle(projectId, "Offline Sync Design"))!
        .id,
      text: "Offline Sync Design\nJournal first, sync as a bridge",
    },
  });
  const spec = await canvasRepo.addNode({
    canvasId: canvas.id,
    type: "link",
    x: 320,
    y: 240,
    width: 240,
    height: 120,
    color: "amber",
    data: {
      url: `/specs?spec=${(await specsRepo.listByProject(projectId)).find((s) => s.title.includes("Plugin API"))?.id ?? ""}`,
      text: "SPEC-001 · Plugin API",
    },
  });
  await canvasRepo.addEdge({
    canvasId: canvas.id,
    source: core.id,
    target: host.id,
    label: "ports",
  });
  await canvasRepo.addEdge({
    canvasId: canvas.id,
    source: host.id,
    target: spec.id,
    label: "specifies",
  });
}

async function seedDraftDeckWatchAndSync(projectId: string): Promise<void> {
  const systems = await systemsRepo.listByProject(projectId);
  const byName = (name: string) =>
    systems.find((s) => s.name === name)?.id ?? null;
  await watchEventsRepo.create({
    projectId,
    path: "src/plugins/host.ts",
    kind: "modified",
    fileType: "code",
    systemId: byName("Plugin Runtime"),
    createdAt: ago(1 * DAY),
  });
  await watchEventsRepo.create({
    projectId,
    path: "src/sync/journal.ts",
    kind: "modified",
    fileType: "code",
    systemId: byName("Sync Engine"),
    createdAt: ago(3 * DAY),
  });
  await syncRepo.replaceAll(projectId, [
    {
      path: "product/north-star.md",
      hash: "s1",
      status: "synced",
      entityType: "note",
      entityId: "demo",
      lastSyncedAt: ago(2 * DAY),
    },
    {
      path: "specs/SPEC-001.md",
      hash: "s2",
      status: "new",
      entityType: "spec",
      entityId: "demo",
      lastSyncedAt: null,
    },
    {
      path: "docs/welcome.md",
      hash: "s3",
      status: "synced",
      entityType: "doc",
      entityId: "demo",
      lastSyncedAt: ago(2 * DAY),
    },
  ]);
}

async function seedDraftDeckChat(
  projectId: string,
  connectionId: string,
): Promise<void> {
  const thread = await chatThreadsRepo.create({
    projectId,
    connectionId,
    modelId: "claude-sonnet-4-5",
    title: "Plugin isolation approach",
    mode: "agentic",
    reasoningEnabled: false,
    createdAt: ago(5 * HOUR),
    updatedAt: ago(4 * HOUR),
  });
  await chatMessagesRepo.create({
    threadId: thread.id,
    role: "user",
    content:
      "We need third-party plugins without risking the editor's stability. WASM sandbox vs child processes — what's the right call for DraftDeck?",
    createdAt: ago(5 * HOUR),
  });
  await chatMessagesRepo.create({
    threadId: thread.id,
    role: "assistant",
    content:
      "**WASM with permission gates.**\n\n- Child processes give isolation but pay 5–15ms IPC per call — too slow for keystroke-adjacent hooks.\n- WASM keeps everything in-process, is deterministic, and the capability model (read/write/export per plugin) matches the standards you already keep.\n- Fault containment: a panicking plugin aborts its own instance, never the core.\n\nI've noted the decision in the memory store and flagged the host task for the permission gates.",
    reasoning: "",
    toolActivity: [
      {
        name: "readNote",
        summary: "Offline Sync Design",
        ok: true,
        running: false,
      },
      {
        name: "readStandard",
        summary: "Editor Core touches IO only through ports",
        ok: true,
        running: false,
      },
      {
        name: "updateTask",
        summary: "WASM host with permission gates",
        ok: true,
        running: false,
      },
    ],
    createdAt: ago(4 * HOUR),
  });
}

async function seedDraftDeckWorkflow(
  projectId: string,
  connectionId: string,
): Promise<void> {
  const run = await workflowRepo.createRun({
    projectId,
    connectionId,
    modelId: "claude-sonnet-4-5",
    title: "Plugin store — idea to implementation",
    idea: "Let users discover, install, and update plugins from a gallery without leaving DraftDeck.",
  });
  const steps = await workflowRepo.listSteps(run.id);
  const done = [
    {
      key: "clarify",
      output:
        "Gallery browsing, one-click install, auto-update with version pinning. Core stays lean.",
    },
    {
      key: "research",
      output:
        "WASM host + manifest registry reviewed; API churn risk flagged for version pinning.",
    },
    {
      key: "spec",
      output:
        "SPEC-001 (Plugin API) drafted with acceptance: hello-world plugin loads in < 300ms.",
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
  const next = steps[done.length];
  if (next) await workflowRepo.updateStep(next.id, { status: "running" });
}
