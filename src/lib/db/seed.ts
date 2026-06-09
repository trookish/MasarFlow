import { getDb, resetDbInstance } from "./schema";
import type {
  Project,
  Note,
  Spec,
  Standard,
  Task,
  System,
  ArchNode,
  ArchEdge,
  Doc,
  DevLog,
  Agent,
  Commit,
  Memory,
  Link,
  Tag,
  Folder,
  Plan,
} from "./schema";
import { uid } from "@/lib/utils";

const SEED_VERSION = 1;
const SEED_KEY = "seed_version";

function daysAgo(n: number): number {
  return Date.now() - n * 24 * 60 * 60 * 1000;
}

function hoursAgo(n: number): number {
  return Date.now() - n * 60 * 60 * 1000;
}

function minutesAgo(n: number): number {
  return Date.now() - n * 60 * 1000;
}

export function buildSeed(): {
  projects: Project[];
  folders: Folder[];
  tags: Tag[];
  notes: Note[];
  standards: Standard[];
  specs: Spec[];
  plans: Plan[];
  tasks: Task[];
  systems: System[];
  archNodes: ArchNode[];
  archEdges: ArchEdge[];
  docs: Doc[];
  devLogs: DevLog[];
  agents: Agent[];
  commits: Commit[];
  memories: Memory[];
  links: Link[];
} {
  const projectId = "proj_aurora_rising";
  const project: Project = {
    id: projectId,
    name: "Aurora Rising",
    slug: "aurora-rising",
    description: "Vertical-slice action RPG. Unity 6, C# 9, single-player, narrative-driven.",
    health: 86,
    archScore: 78,
    techDebt: 23,
    createdAt: daysAgo(60),
    updatedAt: minutesAgo(8),
    accent: "violet",
  };

  const folders: Folder[] = [
    { id: "fld_systems", projectId, parentId: null, name: "Systems", icon: "box" },
    { id: "fld_mechanics", projectId, parentId: null, name: "Mechanics", icon: "swords" },
    { id: "fld_research", projectId, parentId: null, name: "Research", icon: "flask" },
    { id: "fld_decisions", projectId, parentId: null, name: "Decisions", icon: "git-branch" },
  ];

  const tags: Tag[] = [
    { id: "tag_combat", name: "combat", color: "var(--danger)" },
    { id: "tag_story", name: "story", color: "var(--graph-doc)" },
    { id: "tag_unity", name: "unity", color: "var(--graph-system)" },
    { id: "tag_perf", name: "performance", color: "var(--warning)" },
    { id: "tag_arch", name: "architecture", color: "var(--graph-arch)" },
    { id: "tag_ai", name: "ai", color: "var(--graph-memory)" },
    { id: "tag_save", name: "save-system", color: "var(--info)" },
  ];

  const noteDefs: Array<Omit<Note, "id" | "createdAt" | "updatedAt" | "excerpt">> = [
    {
      projectId,
      type: "system",
      title: "Inventory System",
      body: `A **grid-based inventory** with weight, rarity, and contextual interactions.\n\n- Slots are ScriptableObjects for designer iteration\n- Drag-and-drop with stackable + unique rules\n- Serializes to save-game format \`v2\`\n- Talks to [[Loot Tables]] and [[Equipment System]]\n\n> Decision: 32-slot default grid. We chose this over list-based for visual clarity in cutscenes.`,
      tags: ["unity", "arch"],
      folderId: "fld_systems",
    },
    {
      projectId,
      type: "mechanic",
      title: "Climbing Mechanic",
      body: `Vertical traversal with stamina cost. Free-form surface detection using [[Surface Sampling]].\n\n## Goals\n- Feel responsive (<16ms input-to-animation)\n- Blend into [[Traversal]] state machine\n- Telegraph reach with hint UI\n\nSee also: [[Surface Sampling]], [[Traversal]], [[Stamina System]].`,
      tags: ["combat", "perf"],
      folderId: "fld_mechanics",
    },
    {
      projectId,
      type: "research",
      title: "Surface Sampling Approaches",
      body: `Research on detecting climbable surfaces.\n\n## Candidates\n1. **Sphere casts per frame** — cheap, jittery\n2. **Pre-baked surface volumes** — best perf, designer labor\n3. **Hybrid: baked + runtime check** — recommended\n\nTrade-off table in [[Research Index]].`,
      tags: ["perf", "arch"],
      folderId: "fld_research",
    },
    {
      projectId,
      type: "decision",
      title: "ADR-007: State machines via custom dispatcher",
      body: `We considered Unity's Animator, custom FSM, and a behavior tree library.\n\n**Decision:** Custom dispatcher with ScriptableObject state definitions.\n\n**Why:**\n- Designers can author states without code\n- Plays nicely with our [[Reflection]] pipeline\n- Decouples from Animator for AI logic\n\nRejected: Behavior tree (too heavy for our scale), Animator (no clean introspection).`,
      tags: ["arch"],
      folderId: "fld_decisions",
    },
    {
      projectId,
      type: "idea",
      title: "Memory-bound Echoes",
      body: `What if NPCs remember *how* you treated them, not just *that* you did?\n\nSketch: each NPC has an ` + "`EchoLedger`" + ` that stores weighted impressions. When you return, dialogue branches based on accumulated weight.\n\nConnects to: [[Dialogue System]], [[Reputation]].`,
      tags: ["story", "ai"],
      folderId: null,
    },
    {
      projectId,
      type: "system",
      title: "Dialogue System",
      body: `Yarn Spinner 2.0 with custom variables and a "memory" pass that rewires past lines based on current flags.\n\n- Compiles to node graph for visual editing\n- Variable store is replicated to save format\n- Hooks into [[Memory-bound Echoes]] and [[Reputation]].`,
      tags: ["story", "arch"],
      folderId: "fld_systems",
    },
    {
      projectId,
      type: "system",
      title: "Save System v2",
      body: `Versioned, atomic, with rollback on corruption.\n\n- Per-system serializers, not whole-scene snapshots\n- Cloud-ready (placeholder hook)\n- Migrates from v1 via [SaveMigrations]\n\nSee [[Save System v2 Spec]] for the contract.`,
      tags: ["save", "arch"],
      folderId: "fld_systems",
    },
    {
      projectId,
      type: "mechanic",
      title: "Traversal State Machine",
      body: `States: ` + "`Grounded`" + ` → ` + "`Climbing`" + ` → ` + "`Mantle`" + ` → ` + "`Grounded`" + `.\n\nEach transition is a small [[Command]]. The dispatcher (see ADR-007) handles evaluation, the input system sends intents, the state machine decides.`,
      tags: ["combat"],
      folderId: "fld_mechanics",
    },
    {
      projectId,
      type: "experiment",
      title: "Sparse Sound Culling",
      body: `Audio is the #2 perf offender in our profiles.\n\nHypothesis: cull sounds beyond a distance + obstruction threshold with a coarse auditory map.\n\nResult (n=3 builds): 38% audio CPU reduction, no perceptible loss in spatial cues. Ship it.`,
      tags: ["perf"],
      folderId: null,
    },
    {
      projectId,
      type: "lore",
      title: "The First Memory",
      body: `Long before the Veil, the world had no name for itself. Memory was a single ocean; the first to drink from it drowned.`,
      tags: ["story"],
      folderId: null,
    },
    {
      projectId,
      type: "research",
      title: "Input Latency on Consoles",
      body: `Measured end-to-end input latency across PS5, XSX, Switch. Findings in [[Research Index]].\n\nShort version: Switch needs aggressive input buffering (>2 frames). PS5/XSX fine at 1.`,
      tags: ["perf"],
      folderId: "fld_research",
    },
    {
      projectId,
      type: "system",
      title: "Reputation",
      body: `Faction-level reputation with thresholds for quests, vendors, dialogue.\n\n- One source of truth, broadcast via events\n- Save-friendly (integer 0..100)\n- Tied to [[Dialogue System]] and [[Faction System]].`,
      tags: ["story", "arch"],
      folderId: "fld_systems",
    },
  ];

  const notes: Note[] = noteDefs.map((n, i) => ({
    id: `note_${i + 1}`,
    createdAt: daysAgo(45 - i * 2),
    updatedAt: hoursAgo(i * 3 + 1),
    excerpt: n.body.replace(/[#>*`]/g, "").slice(0, 140),
    ...n,
  }));

  const standards: Standard[] = [
    {
      id: "std_1",
      projectId,
      category: "naming",
      title: "Public fields and methods use PascalCase",
      rule: "Public members are PascalCase. Private fields are _camelCase. Local variables are camelCase. Constants are UPPER_SNAKE.",
      examples: [
        "public int MaxHealth;",
        "private int _currentHealth;",
        "const int MAX_PARTICLES = 1024;",
      ],
      enforced: true,
      createdAt: daysAgo(50),
      updatedAt: daysAgo(10),
    },
    {
      id: "std_2",
      projectId,
      category: "structure",
      title: "Methods ordered: public → internal → private",
      rule: "Within a class, group methods in this order: public, internal, protected, private. Within each, lifecycle first, then public API, then helpers.",
      examples: ["public Api() ... \n internal Lifecycle() ... \n private Helper() ..."],
      enforced: true,
      createdAt: daysAgo(50),
      updatedAt: daysAgo(15),
    },
    {
      id: "std_3",
      projectId,
      category: "comments",
      title: "XML docs on every public symbol",
      rule: "Public types and members require `///` XML docs with summary, params, and (where useful) example. Code is the API.",
      examples: [
        "/// <summary>Adds an item to the inventory.</summary>\n/// <param name=\"item\">Item to add.</param>",
      ],
      enforced: true,
      createdAt: daysAgo(48),
      updatedAt: daysAgo(20),
    },
    {
      id: "std_4",
      projectId,
      category: "performance",
      title: "No allocations in Update",
      rule: "Update / FixedUpdate must not allocate. Use pooled buffers, struct enumerators, cached delegates.",
      examples: ["// bad: var list = new List<Transform>();\n// good: _buffer.Clear();"],
      enforced: true,
      createdAt: daysAgo(40),
      updatedAt: daysAgo(5),
    },
    {
      id: "std_5",
      projectId,
      category: "events",
      title: "Events are C# Action / Func, not UnityEvent",
      rule: "Code-to-code communication uses `event Action<...>`. UnityEvent is reserved for inspector wiring by designers.",
      examples: ["public event Action<Item> OnItemAdded;"],
      enforced: true,
      createdAt: daysAgo(35),
      updatedAt: daysAgo(8),
    },
  ];

  const specDefs: Array<Omit<Spec, "id" | "createdAt" | "updatedAt">> = [
    {
      projectId,
      number: "RFC-014",
      title: "Climbing Mechanic",
      status: "implementing",
      purpose:
        "Introduce a fluid, low-latency climbing traversal mechanic that integrates with the existing state machine and stamina systems.",
      goals: [
        "Sub-frame input response on controller and keyboard",
        "Blend cleanly with Mantle and Grounded states",
        "Designer-friendly authoring of climbable surfaces",
      ],
      features: [
        "Free-form surface detection via hybrid baked + runtime check",
        "Stamina cost scaled by surface angle",
        "Visual reach hint based on stamina remaining",
      ],
      constraints: [
        "Must run at 60fps on PS5 baseline",
        "No allocations in the per-frame path",
        "Compatible with ADR-007 state dispatcher",
      ],
      dependencies: ["std_4", "std_5", "note_2", "note_3", "note_8"],
      acceptance: [
        "GIVEN a player near a climbable surface, WHEN the climb input is pressed, THEN climbing starts within 1 frame (16.67ms)",
        "GIVEN climbing, WHEN stamina reaches zero, THEN the player falls with a 0.4s recovery window",
        "GIVEN a non-climbable surface, WHEN the climb input is pressed, THEN nothing happens (no jitter)",
      ],
      technicalNotes:
        "Surface volumes are baked in editor; runtime check uses a single sphere cast per frame against the cached manifest. State transitions flow through ADR-007 dispatcher.",
      risks: [
        "Surface baking cost on large levels",
        "Network edge cases in co-op (out of scope for v1)",
      ],
      futureImprovements: [
        "Add hand-plant animations driven by surface normal",
        "Co-op assisted climb",
      ],
      implementationProgress: 42,
      linkedNoteIds: ["note_2", "note_3", "note_8"],
      linkedTaskIds: ["task_1", "task_2", "task_3"],
    },
    {
      projectId,
      number: "RFC-015",
      title: "Memory-bound Echoes",
      status: "review",
      purpose: "Give NPCs persistent, weighted impressions of how the player has treated them, unlocking long-form narrative consequences.",
      goals: [
        "Persistent per-NPC ledger of weighted impressions",
        "Dialogue branches reflect accumulated weights",
        "Save/load friendly with deterministic merges",
      ],
      features: [
        "EchoLedger ScriptableObject + runtime instance",
        "Editor window to inspect ledger deltas",
        "Dialogue condition nodes for memory checks",
      ],
      constraints: [
        "Ledger size < 4KB per NPC",
        "No ledger writes on the main thread after the first 30s of play",
        "Must not break existing save format",
      ],
      dependencies: ["note_5", "note_6", "note_12", "std_5"],
      acceptance: [
        "GIVEN an NPC, WHEN the player insults them 3 times, THEN the next dialogue line reflects hostility",
        "GIVEN a save file, WHEN reloaded on a different machine, THEN ledger state is byte-identical",
      ],
      technicalNotes:
        "Weighted impressions stored as `int` (weight) + `string` (tag) per entry. Serialized as length-prefixed binary.",
      risks: [
        "Memory growth across long playthroughs",
        "Authoring complexity for writers",
      ],
      futureImprovements: [
        "Cross-NPC rumor propagation",
        "Player-facing memory journal UI",
      ],
      implementationProgress: 0,
      linkedNoteIds: ["note_5", "note_6", "note_12"],
      linkedTaskIds: ["task_4", "task_5"],
    },
    {
      projectId,
      number: "RFC-012",
      title: "Save System v2",
      status: "shipped",
      purpose: "Versioned, atomic save system with per-system serializers, rollback on corruption, and migration from v1.",
      goals: [
        "Atomic writes (write-temp + rename)",
        "Per-system serializers, no full-scene snapshots",
        "Migration path from v1 saves",
      ],
      features: [
        "SaveManifest with checksum",
        "Per-system ISaveable contract",
        "SaveInspector dev tool",
      ],
      constraints: [
        "Max save size 8MB",
        "Save write < 250ms on Switch",
      ],
      dependencies: ["std_1", "std_3", "note_7"],
      acceptance: [
        "GIVEN a corrupted save, WHEN loaded, THEN the previous valid snapshot is restored",
        "GIVEN a v1 save, WHEN loaded in v2, THEN data is migrated without loss",
      ],
      technicalNotes: "Backed by a single binary blob with a per-system header table. CRC32 for checksum.",
      risks: ["Migration correctness across many sessions"],
      futureImprovements: ["Cloud save", "Encrypted saves"],
      implementationProgress: 100,
      linkedNoteIds: ["note_7"],
      linkedTaskIds: ["task_6", "task_7", "task_8"],
    },
  ];

  const specs: Spec[] = specDefs.map((s, i) => ({
    id: `spec_${i + 1}`,
    createdAt: daysAgo(30 - i * 5),
    updatedAt: hoursAgo(i * 6 + 2),
    ...s,
  }));

  const plans: Plan[] = [
    {
      id: "plan_1",
      specId: "spec_1",
      summary:
        "Implement climbing as a state in ADR-007 dispatcher, with hybrid surface detection and stamina integration. Estimated 9-12 working days.",
      affectedSystems: ["note_8", "note_3", "note_1"],
      conflicts: ["May temporarily regress Mantle transition by ~3 frames during integration."],
      archImpact:
        "Adds a new state class to the dispatcher; no breaking changes. Surface manifest is a new asset kind.",
      alternatives: [
        "Behavior tree (rejected: too heavy)",
        "Animator-driven (rejected: poor introspection)",
      ],
      complexity: "high",
      risks: ["Surface baking cost on large levels", "Designer authoring overhead"],
      roadmap: [
        "Bake surface manifest tool (2d)",
        "Sphere-cast runtime check (1d)",
        "Climbing state class (2d)",
        "Stamina integration (1d)",
        "Visual reach hint (1d)",
        "Polish + perf pass (2d)",
      ],
      status: "approved",
      createdAt: daysAgo(8),
    },
    {
      id: "plan_2",
      specId: "spec_2",
      summary:
        "Echo ledger as a ScriptableObject with runtime instance, persisted via Save System v2. Editor window for inspection.",
      affectedSystems: ["note_6", "note_12", "note_7"],
      conflicts: ["Dialogue system condition evaluator needs a small extension."],
      archImpact: "Adds a new save-system payload. No breaking changes.",
      alternatives: ["Flat dictionary per NPC (rejected: harder to introspect)"],
      complexity: "medium",
      risks: ["Memory growth", "Authoring UX"],
      roadmap: [
        "EchoLedger data model (1d)",
        "Save integration (1d)",
        "Dialogue condition nodes (2d)",
        "Editor inspector (1d)",
        "Writer testing (1d)",
      ],
      status: "awaiting_approval",
      createdAt: hoursAgo(20),
    },
  ];

  const taskDefs: Array<Omit<Task, "id" | "createdAt" | "updatedAt">> = [
    {
      projectId,
      title: "Bake climbable surface manifest",
      description: "Editor tool that walks the scene, classifies surfaces, emits a manifest asset.",
      status: "in_progress",
      priority: "high",
      specId: "spec_1",
      parentTaskId: null,
      assignee: "programmer",
      dependencies: [],
      progress: 55,
      tags: ["unity", "arch"],
    },
    {
      projectId,
      title: "Sphere-cast runtime check",
      description: "Single sphere cast per frame against the cached manifest, classifies climbable.",
      status: "todo",
      priority: "high",
      specId: "spec_1",
      parentTaskId: null,
      assignee: "programmer",
      dependencies: ["task_1"],
      progress: 0,
      tags: ["perf", "unity"],
    },
    {
      projectId,
      title: "Climbing state class",
      description: "New state for ADR-007 dispatcher. Hand-authored ScriptableObject.",
      status: "backlog",
      priority: "high",
      specId: "spec_1",
      parentTaskId: null,
      assignee: "architect",
      dependencies: ["task_2"],
      progress: 0,
      tags: ["arch"],
    },
    {
      projectId,
      title: "EchoLedger ScriptableObject",
      description: "Designer-friendly SO that mirrors runtime instance.",
      status: "todo",
      priority: "medium",
      specId: "spec_2",
      parentTaskId: null,
      assignee: "programmer",
      dependencies: [],
      progress: 0,
      tags: ["arch"],
    },
    {
      projectId,
      title: "Dialogue condition node: memory check",
      description: "Yarn condition that reads from EchoLedger by NPC id.",
      status: "backlog",
      priority: "medium",
      specId: "spec_2",
      parentTaskId: null,
      assignee: "programmer",
      dependencies: ["task_4"],
      progress: 0,
      tags: ["story"],
    },
    {
      projectId,
      title: "Save v1 → v2 migration",
      description: "Migrate save v1 to v2 with all known fields.",
      status: "done",
      priority: "high",
      specId: "spec_3",
      parentTaskId: null,
      assignee: "programmer",
      dependencies: [],
      progress: 100,
      tags: ["save"],
    },
    {
      projectId,
      title: "Atomic write + rollback",
      description: "Write to temp file, fsync, atomic rename. Roll back to last good snapshot on corruption.",
      status: "done",
      priority: "high",
      specId: "spec_3",
      parentTaskId: null,
      assignee: "programmer",
      dependencies: [],
      progress: 100,
      tags: ["save"],
    },
    {
      projectId,
      title: "Save Inspector dev tool",
      description: "Editor window that diffs current save against last loaded.",
      status: "review",
      priority: "low",
      specId: "spec_3",
      parentTaskId: null,
      assignee: "designer",
      dependencies: ["task_7"],
      progress: 80,
      tags: ["save"],
    },
  ];

  const tasks: Task[] = taskDefs.map((t, i) => ({
    id: `task_${i + 1}`,
    createdAt: daysAgo(20 - i * 2),
    updatedAt: hoursAgo(i * 4 + 1),
    ...t,
  }));

  const systemDefs: Array<Omit<System, "id">> = [
    { projectId, name: "Traversal", kind: "gameplay", description: "Movement and traversal state machine.", dependsOn: ["InputSystem", "Animator"], exposes: ["OnStateChanged", "RequestTransition"] },
    { projectId, name: "Inventory", kind: "gameplay", description: "Grid-based item storage.", dependsOn: ["SaveSystem", "UIDataBinding"], exposes: ["OnItemAdded", "OnItemRemoved"] },
    { projectId, name: "Dialogue", kind: "narrative", description: "Yarn-based dialogue with memory hooks.", dependsOn: ["SaveSystem", "Reputation"], exposes: ["OnLineStart", "OnLineEnd"] },
    { projectId, name: "SaveSystem", kind: "platform", description: "Versioned, atomic save format.", dependsOn: [], exposes: ["Save", "Load", "Migrate"] },
    { projectId, name: "Reputation", kind: "narrative", description: "Faction reputation tracker.", dependsOn: ["SaveSystem"], exposes: ["OnThresholdCrossed"] },
  ];
  const systems: System[] = systemDefs.map((s, i) => ({ id: `sys_${i + 1}`, ...s }));

  const archNodes: ArchNode[] = [
    { id: "an_1", projectId, systemId: "sys_1", type: "module", name: "Traversal.Dispatcher" },
    { id: "an_2", projectId, systemId: "sys_1", type: "class", name: "ClimbState" },
    { id: "an_3", projectId, systemId: "sys_1", type: "class", name: "MantleState" },
    { id: "an_4", projectId, systemId: "sys_1", type: "class", name: "GroundedState" },
    { id: "an_5", projectId, systemId: "sys_2", type: "module", name: "Inventory.Grid" },
    { id: "an_6", projectId, systemId: "sys_3", type: "module", name: "Dialogue.Runner" },
    { id: "an_7", projectId, systemId: "sys_4", type: "module", name: "SaveSystem.Manager" },
    { id: "an_8", projectId, systemId: "sys_5", type: "module", name: "Reputation.Service" },
  ];
  const archEdges: ArchEdge[] = [
    { id: "ae_1", source: "an_2", target: "an_1", kind: "calls" },
    { id: "ae_2", source: "an_3", target: "an_1", kind: "calls" },
    { id: "ae_3", source: "an_4", target: "an_1", kind: "calls" },
    { id: "ae_4", source: "an_5", target: "an_7", kind: "depends" },
    { id: "ae_5", source: "an_6", target: "an_7", kind: "depends" },
    { id: "ae_6", source: "an_6", target: "an_8", kind: "depends" },
    { id: "ae_7", source: "an_8", target: "an_7", kind: "depends" },
  ];

  const docs: Doc[] = [
    {
      id: "doc_1",
      projectId,
      kind: "system",
      title: "Save System",
      body: "Versioned, atomic save format. See [[Save System v2 Spec]] for the contract.\n\n## Public API\n- `Save(int slot)` — writes to slot\n- `Load(int slot)` — reads from slot, migrates if needed\n- `Migrate(SaveBlob v1)` — internal",
      generatedFrom: "spec_3",
      updatedAt: hoursAgo(20),
    },
    {
      id: "doc_2",
      projectId,
      kind: "api",
      title: "Traversal.Dispatcher",
      body: "Public methods:\n- `RequestTransition(StateId id)`\n- `OnStateChanged: event Action<StateId, StateId>`\n- `Current: StateId`",
      generatedFrom: "an_1",
      updatedAt: hoursAgo(6),
    },
    {
      id: "doc_3",
      projectId,
      kind: "arch",
      title: "Architecture Overview",
      body: "Aurora Rising follows a state-dispatcher pattern (ADR-007) for gameplay systems, with a versioned save layer (RFC-012) as the platform foundation.",
      generatedFrom: null,
      updatedAt: hoursAgo(2),
    },
  ];

  const devLogs: DevLog[] = [
    {
      id: "dl_1",
      projectId,
      kind: "decision",
      title: "ADR-007: Custom state dispatcher",
      body: "Why we picked it, what we rejected, and how it shapes future work.",
      refs: [{ type: "note", id: "note_4" }],
      createdAt: daysAgo(30),
    },
    {
      id: "dl_2",
      projectId,
      kind: "success",
      title: "Save System v2 shipped",
      body: "Atomic writes, per-system serializers, v1 migration. Profiles show 6x faster load on Switch.",
      refs: [
        { type: "spec", id: "spec_3" },
        { type: "commit", id: "c_3" },
      ],
      createdAt: daysAgo(3),
    },
    {
      id: "dl_3",
      projectId,
      kind: "failure",
      title: "Animator-driven AI: rejected",
      body: "We tried wiring AI into the Animator. Introspection was miserable. ADR-007 was the response.",
      refs: [{ type: "note", id: "note_4" }],
      createdAt: daysAgo(22),
    },
    {
      id: "dl_4",
      projectId,
      kind: "lesson",
      title: "Pre-bake surface data is worth the editor time",
      body: "Baked climbable surface manifests gave us 4x perf over runtime sphere casts, and designers prefer authoring volumes to chasing runtime hits.",
      refs: [{ type: "note", id: "note_3" }],
      createdAt: daysAgo(6),
    },
    {
      id: "dl_5",
      projectId,
      kind: "feature",
      title: "Climbing spec drafted",
      body: "RFC-014 ready for review.",
      refs: [{ type: "spec", id: "spec_1" }],
      createdAt: daysAgo(12),
    },
  ];

  const agents: Agent[] = [
    { id: "ag_arch", name: "Architect", role: "architect", persona: "Thinks in modules, dependencies, and lifetimes.", description: "Analyzes system design and proposes structures.", status: "idle", capabilities: ["system-design", "adr", "dependency-analysis"], lastRunAt: minutesAgo(45) },
    { id: "ag_plan", name: "Planner", role: "planner", persona: "Decomposes features into sequenced, testable steps.", description: "Generates implementation plans from specs.", status: "idle", capabilities: ["roadmap", "estimation", "risk-analysis"], lastRunAt: hoursAgo(2) },
    { id: "ag_prog", name: "Programmer", role: "programmer", persona: "Reads context, writes code that follows the project's standards.", description: "Implements changes inside an approved plan.", status: "idle", capabilities: ["implement", "refactor", "test"], lastRunAt: hoursAgo(8) },
    { id: "ag_rev", name: "Reviewer", role: "reviewer", persona: "Catches what the others miss.", description: "Reviews diffs and design decisions.", status: "idle", capabilities: ["code-review", "design-review", "standards"], lastRunAt: null },
    { id: "ag_opt", name: "Optimizer", role: "optimizer", persona: "Measures twice, cuts once.", description: "Profiles, allocates, and refactors for performance.", status: "idle", capabilities: ["profile", "memory", "perf"], lastRunAt: daysAgo(4) },
    { id: "ag_test", name: "Tester", role: "tester", persona: "Adversarial by default.", description: "Generates and runs tests against the spec's acceptance criteria.", status: "idle", capabilities: ["unit", "integration", "fuzz"], lastRunAt: null },
    { id: "ag_doc", name: "Documenter", role: "documenter", persona: "Says what the code does in the language of the reader.", description: "Maintains system, API, and architecture docs.", status: "idle", capabilities: ["docs", "api-ref", "tutorial"], lastRunAt: hoursAgo(3) },
    { id: "ag_des", name: "Designer", role: "designer", persona: "Wears the player's shoes.", description: "Advocates for feel, clarity, and onboarding.", status: "idle", capabilities: ["ux", "narrative", "tutorial"], lastRunAt: null },
  ];

  const commits: Commit[] = [
    { id: "c_1", projectId, hash: "a1f3b2e", message: "feat(traversal): add ClimbState scaffold", author: "Tariq R.", date: hoursAgo(28), files: ["Assets/Scripts/Traversal/ClimbState.cs", "Assets/Scripts/Traversal/Dispatcher.cs"], aiSummary: "Introduces ClimbState wired into the dispatcher. No behavior yet — sets up the integration point." },
    { id: "c_2", projectId, hash: "7c4d9ab", message: "perf(audio): sparse culling passes profile gate", author: "Mira S.", date: hoursAgo(14), files: ["Assets/Scripts/Audio/CullingService.cs"], aiSummary: "Culls sounds beyond distance + obstruction threshold. 38% audio CPU reduction in stress test." },
    { id: "c_3", projectId, hash: "3e88f10", message: "feat(save): ship v2 with v1 migration", author: "Tariq R.", date: daysAgo(3), files: ["Assets/Scripts/Save/*.cs"], aiSummary: "Atomic writes, per-system serializers, v1 → v2 migration. 6x faster load on Switch." },
    { id: "c_4", projectId, hash: "9b21c0d", message: "docs(arch): update dispatcher overview", author: "Tariq R.", date: hoursAgo(6), files: ["docs/arch/dispatcher.md"], aiSummary: "Refreshes the dispatcher diagram and adds ClimbState to the state list." },
    { id: "c_5", projectId, hash: "5a73ee2", message: "chore(standards): add no-alloc-in-update rule", author: "Mira S.", date: daysAgo(5), files: ["docs/standards/perf.md"], aiSummary: null },
  ];

  const memories: Memory[] = [
    { id: "mem_1", projectId, kind: "pattern", content: "For traversal states, prefer ScriptableObject state definitions with a small dispatcher (ADR-007).", tags: ["arch", "traversal"], weight: 0.9, createdAt: daysAgo(30), lastRecallAt: hoursAgo(2) },
    { id: "mem_2", projectId, kind: "preference", content: "Designer-friendly inspector beats raw code for state authoring.", tags: ["designer", "arch"], weight: 0.8, createdAt: daysAgo(28), lastRecallAt: hoursAgo(2) },
    { id: "mem_3", projectId, kind: "lesson", content: "Baked surface data is worth the editor time — 4x perf and better designer UX.", tags: ["perf", "traversal"], weight: 0.7, createdAt: daysAgo(6), lastRecallAt: hoursAgo(1) },
    { id: "mem_4", projectId, kind: "decision", content: "Per-system serializers, not whole-scene snapshots. Cheaper and safer.", tags: ["save", "arch"], weight: 0.85, createdAt: daysAgo(20), lastRecallAt: daysAgo(1) },
    { id: "mem_5", projectId, kind: "fact", content: "Switch needs >2 frame input buffering for tight-feeling controls.", tags: ["perf", "platform"], weight: 0.6, createdAt: daysAgo(10), lastRecallAt: null },
  ];

  const links: Link[] = [
    { id: uid("lnk"), sourceType: "spec", sourceId: "spec_1", targetType: "note", targetId: "note_2", kind: "references" },
    { id: uid("lnk"), sourceType: "spec", sourceId: "spec_1", targetType: "note", targetId: "note_3", kind: "references" },
    { id: uid("lnk"), sourceType: "spec", sourceId: "spec_1", targetType: "note", targetId: "note_8", kind: "references" },
    { id: uid("lnk"), sourceType: "spec", sourceId: "spec_2", targetType: "note", targetId: "note_5", kind: "references" },
    { id: uid("lnk"), sourceType: "spec", sourceId: "spec_2", targetType: "note", targetId: "note_6", kind: "references" },
    { id: uid("lnk"), sourceType: "spec", sourceId: "spec_3", targetType: "note", targetId: "note_7", kind: "references" },
    { id: uid("lnk"), sourceType: "task", sourceId: "task_2", targetType: "task", targetId: "task_1", kind: "depends" },
    { id: uid("lnk"), sourceType: "task", sourceId: "task_3", targetType: "task", targetId: "task_2", kind: "depends" },
    { id: uid("lnk"), sourceType: "task", sourceId: "task_5", targetType: "task", targetId: "task_4", kind: "depends" },
    { id: uid("lnk"), sourceType: "task", sourceId: "task_8", targetType: "task", targetId: "task_7", kind: "depends" },
    { id: uid("lnk"), sourceType: "doc", sourceId: "doc_2", targetType: "note", targetId: "note_8", kind: "references" },
    { id: uid("lnk"), sourceType: "doc", sourceId: "doc_1", targetType: "spec", targetId: "spec_3", kind: "references" },
  ];

  return {
    projects: [project],
    folders,
    tags,
    notes,
    standards,
    specs,
    plans,
    tasks,
    systems,
    archNodes,
    archEdges,
    docs,
    devLogs,
    agents,
    commits,
    memories,
    links,
  };
}

export async function ensureSeed(): Promise<{ seeded: boolean }> {
  const db = getDb();
  const version = await db.meta.get(SEED_KEY);
  if (version && Number(version.value) >= SEED_VERSION) {
    return { seeded: false };
  }
  const seed = buildSeed();
  await db.transaction(
    "rw",
    [
      db.projects,
      db.folders,
      db.tags,
      db.notes,
      db.standards,
      db.specs,
      db.plans,
      db.tasks,
      db.systems,
      db.archNodes,
      db.archEdges,
      db.docs,
      db.devLogs,
      db.agents,
      db.commits,
      db.memories,
      db.links,
      db.meta,
    ],
    async () => {
      await Promise.all([
        db.projects.clear(),
        db.folders.clear(),
        db.tags.clear(),
        db.notes.clear(),
        db.standards.clear(),
        db.specs.clear(),
        db.plans.clear(),
        db.tasks.clear(),
        db.systems.clear(),
        db.archNodes.clear(),
        db.archEdges.clear(),
        db.docs.clear(),
        db.devLogs.clear(),
        db.agents.clear(),
        db.commits.clear(),
        db.memories.clear(),
        db.links.clear(),
      ]);
      await Promise.all([
        db.projects.bulkPut(seed.projects),
        db.folders.bulkPut(seed.folders),
        db.tags.bulkPut(seed.tags),
        db.notes.bulkPut(seed.notes),
        db.standards.bulkPut(seed.standards),
        db.specs.bulkPut(seed.specs),
        db.plans.bulkPut(seed.plans),
        db.tasks.bulkPut(seed.tasks),
        db.systems.bulkPut(seed.systems),
        db.archNodes.bulkPut(seed.archNodes),
        db.archEdges.bulkPut(seed.archEdges),
        db.docs.bulkPut(seed.docs),
        db.devLogs.bulkPut(seed.devLogs),
        db.agents.bulkPut(seed.agents),
        db.commits.bulkPut(seed.commits),
        db.memories.bulkPut(seed.memories),
        db.links.bulkPut(seed.links),
      ]);
      await db.meta.put({ key: SEED_KEY, value: SEED_VERSION });
    },
  );
  return { seeded: true };
}

export async function resetSeed(): Promise<void> {
  const db = getDb();
  await db.delete();
  resetDbInstance();
  await new Promise((r) => setTimeout(r, 50));
  await ensureSeed();
}
