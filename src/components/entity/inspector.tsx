"use client";

/**
 * The one right-hand Inspector for the tabs-only harness.
 *
 * It reads only the active project's dock state: the focused tab decides the
 * surface/section, and a selected entity arrives as the tab's deep-link query
 * (see src/lib/entities/registry.ts). Titles and properties come from the same
 * repositories the entity views use; connections are the project's real links.
 *
 * "Ask about this" uses no private chat runtime: it focuses/opens the entity,
 * then opens the existing Ask surface. Chat already derives its active context
 * from the open dock panels (src/lib/ai/active-context.ts), so the entity stays
 * in that context while the conversation starts.
 */

import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Link2,
  MessageSquare,
  PanelRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EntityChip } from "@/components/entities/entity-chip";
import { deriveActiveContext } from "@/lib/ai/active-context";
import { db } from "@/lib/db";
import {
  agentsRepo,
  canvasRepo,
  chatThreadsRepo,
  commitsRepo,
  devLogsRepo,
  docsRepo,
  linksRepo,
  memoriesRepo,
  notesRepo,
  specsRepo,
  sprintsRepo,
  standardsRepo,
  systemsRepo,
  tasksRepo,
} from "@/lib/db/repos";
import { getPageDef } from "@/lib/dock/registry";
import { pageIdOf, paramsOf, type ProjectDockState } from "@/lib/dock/types";
import { assigneeLabel } from "@/lib/domain/task-model";
import { computeBacklinks, type LinkEdge } from "@/lib/entities/backlinks";
import { openEntity } from "@/lib/entities/open";
import {
  ENTITY_KINDS,
  KIND_META,
  refFromUrl,
  type EntityRef,
} from "@/lib/entities/registry";
import { titleOfEntity } from "@/lib/entities/resolve";
import {
  getSurface,
  surfaceForPath,
  type Surface,
  type SurfaceSection,
} from "@/lib/navigation/surfaces";
import { useDockStore } from "@/lib/stores/dock";
import { cn } from "@/lib/utils/cn";
import { formatRelativeTime } from "@/lib/utils/relative-time";
import { priorityMeta, specStatusMeta, taskStatusLabel } from "@/lib/workflow";

export interface InspectorView {
  projectId: string | null;
  /** The focused tab's URL, including its selection snapshot. */
  focusedUrl: string | null;
  pageId: string | null;
  pageLabel: string;
  ref: EntityRef | null;
  surface: Surface | null;
  section: SurfaceSection | null;
  openTabs: number;
}

export interface InspectorProperty {
  label: string;
  value: string;
}

const EMPTY_VIEW: Omit<InspectorView, "projectId"> = {
  focusedUrl: null,
  pageId: null,
  pageLabel: "",
  ref: null,
  surface: null,
  section: null,
  openTabs: 0,
};

/** The section a focused tab shows; `view` wins for surface routes. */
function sectionFor(
  surface: Surface,
  pageId: string,
  query: string,
): SurfaceSection | null {
  const view = new URLSearchParams(query).get("view");
  if (view) {
    const byView = surface.sections.find((section) => section.id === view);
    if (byView) return byView;
  }
  return (
    surface.sections.find((section) => section.href === pageId) ??
    surface.sections[0] ??
    null
  );
}

/**
 * Pure derivation from dock state. Everything the Inspector says about "where
 * am I / what is selected" comes from here, so it is testable without React.
 */
export function deriveInspectorView(
  state: ProjectDockState | null,
  projectId: string | null,
): InspectorView {
  if (!state || !projectId) return { ...EMPTY_VIEW, projectId };

  const active = deriveActiveContext(state);
  if (!active) return { ...EMPTY_VIEW, projectId };

  const focusedUrl = active.focusedUrl;
  const pageId = pageIdOf(focusedUrl);
  const query = paramsOf(focusedUrl);
  const ref = refFromUrl(pageId, query);
  const surfaceId = surfaceForPath(pageId);
  const surface = surfaceId ? (getSurface(surfaceId) ?? null) : null;
  const section = surface ? sectionFor(surface, pageId, query) : null;

  return {
    projectId,
    focusedUrl,
    pageId,
    pageLabel: getPageDef(pageId)?.label ?? pageId,
    ref,
    surface,
    section,
    openTabs: active.panels.length,
  };
}

/** Human wording for an enum-ish stored value ("in_progress" -> "In progress"). */
export function humanizeValue(value: string): string {
  const text = value.replace(/[_-]+/g, " ").trim();
  return text ? text[0].toUpperCase() + text.slice(1) : "—";
}

function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function keep(items: Array<InspectorProperty | null>): InspectorProperty[] {
  return items.filter((item): item is InspectorProperty => item !== null);
}

/**
 * Read the small set of kind-specific properties a person actually checks in
 * an inspector. Uses the same repositories as the entity pages; unknown or
 * deleted entities simply yield no extra rows (the ID row always remains).
 */
export async function loadEntityProperties(
  ref: EntityRef,
): Promise<InspectorProperty[]> {
  switch (ref.kind) {
    case "note": {
      const note = await notesRepo.get(ref.id);
      if (!note) return [];
      return keep([
        { label: "Type", value: humanizeValue(note.type) },
        note.tags.length
          ? { label: "Tags", value: note.tags.join(", ") }
          : null,
        { label: "Updated", value: formatRelativeTime(note.updatedAt) },
      ]);
    }
    case "spec": {
      const spec = await specsRepo.get(ref.id);
      if (!spec) return [];
      return keep([
        { label: "Status", value: specStatusMeta(spec.status).label },
        {
          label: "Progress",
          value: `${spec.implementationProgress}%`,
        },
        { label: "Updated", value: formatRelativeTime(spec.updatedAt) },
      ]);
    }
    case "task": {
      const task = await tasksRepo.get(ref.id);
      if (!task) return [];
      return keep([
        { label: "Status", value: taskStatusLabel(task.status) },
        { label: "Priority", value: priorityMeta(task.priority).label },
        { label: "Assignee", value: assigneeLabel(task.assignee) },
        task.dueDate === null
          ? null
          : { label: "Due", value: shortDate(task.dueDate) },
        { label: "Updated", value: formatRelativeTime(task.updatedAt) },
      ]);
    }
    case "system": {
      const system = await systemsRepo.get(ref.id);
      if (!system) return [];
      return keep([
        { label: "Status", value: humanizeValue(system.status) },
        { label: "Health", value: `${system.health}%` },
        { label: "Category", value: humanizeValue(system.category) },
        { label: "Updated", value: formatRelativeTime(system.updatedAt) },
      ]);
    }
    case "commit": {
      const commit = await commitsRepo.get(ref.id);
      if (!commit) return [];
      return keep([
        commit.author ? { label: "Author", value: commit.author } : null,
        {
          label: "Changes",
          value: `+${commit.additions} / −${commit.deletions}`,
        },
        {
          label: "Files",
          value: `${commit.files.length} file${commit.files.length === 1 ? "" : "s"}`,
        },
        commit.date ? { label: "Date", value: shortDate(commit.date) } : null,
      ]);
    }
    case "memory": {
      const memory = await memoriesRepo.get(ref.id);
      if (!memory) return [];
      return keep([
        { label: "Type", value: humanizeValue(memory.type) },
        { label: "Weight", value: `${Math.round(memory.weight * 100)}%` },
        { label: "Updated", value: formatRelativeTime(memory.updatedAt) },
      ]);
    }
    case "doc": {
      const doc = await docsRepo.get(ref.id);
      if (!doc) return [];
      return keep([
        { label: "Category", value: humanizeValue(doc.category) },
        { label: "Source", value: humanizeValue(doc.sourceType) },
        { label: "Updated", value: formatRelativeTime(doc.updatedAt) },
      ]);
    }
    case "archNode": {
      const node = await db.archNodes.get(ref.id);
      if (!node) return [];
      return keep([
        { label: "Type", value: humanizeValue(node.type) },
        { label: "Updated", value: formatRelativeTime(node.updatedAt) },
      ]);
    }
    case "standard": {
      const standard = await standardsRepo.get(ref.id);
      if (!standard) return [];
      return keep([
        { label: "Category", value: humanizeValue(standard.category) },
        { label: "Enforced", value: standard.enforced ? "Yes" : "No" },
        { label: "Updated", value: formatRelativeTime(standard.updatedAt) },
      ]);
    }
    case "sprint": {
      const sprint = await sprintsRepo.get(ref.id);
      if (!sprint) return [];
      return keep([
        { label: "Status", value: humanizeValue(sprint.status) },
        sprint.startDate === null
          ? null
          : { label: "Starts", value: shortDate(sprint.startDate) },
        sprint.endDate === null
          ? null
          : { label: "Ends", value: shortDate(sprint.endDate) },
      ]);
    }
    case "devlog": {
      const log = await devLogsRepo.get(ref.id);
      if (!log) return [];
      return keep([
        { label: "Type", value: humanizeValue(log.type) },
        { label: "Created", value: formatRelativeTime(log.createdAt) },
      ]);
    }
    case "canvas": {
      const canvas = await canvasRepo.get(ref.id);
      if (!canvas) return [];
      return keep([
        { label: "Updated", value: formatRelativeTime(canvas.updatedAt) },
      ]);
    }
    case "agent": {
      const agent = await agentsRepo.get(ref.id);
      if (!agent) return [];
      return keep([
        { label: "Role", value: humanizeValue(agent.role) },
        agent.model ? { label: "Model", value: agent.model } : null,
        { label: "Enabled", value: agent.enabled ? "Yes" : "No" },
      ]);
    }
    case "thread": {
      const thread = await chatThreadsRepo.get(ref.id);
      if (!thread) return [];
      return keep([
        { label: "Mode", value: humanizeValue(thread.mode) },
        thread.modelId ? { label: "Model", value: thread.modelId } : null,
        { label: "Updated", value: formatRelativeTime(thread.updatedAt) },
      ]);
    }
  }
}

/** Display labels for the entity kinds a surface can select, e.g. "task". */
export function selectableKindLabels(surface: Surface): string[] {
  const routes = new Set([
    surface.route,
    ...surface.sections.map((section) => section.href),
  ]);
  return ENTITY_KINDS.filter((kind) => routes.has(KIND_META[kind].route)).map(
    (kind) => KIND_META[kind].label.toLowerCase(),
  );
}

/** Concise, surface-specific explanation shown when nothing is selected. */
export function selectionHint(surface: Surface): string {
  const labels = selectableKindLabels(surface);
  if (labels.length === 0) {
    return "This page does not select a single item. Open a tab with a selection to inspect it here.";
  }
  const list =
    labels.length === 1
      ? labels[0]
      : labels.length === 2
        ? `${labels[0]} or ${labels[1]}`
        : `${labels.slice(0, -1).join(", ")}, or ${labels[labels.length - 1]}`;
  const article = /^[aeiou]/i.test(list) ? "an" : "a";
  return `Select ${article} ${list} to inspect its properties and connections here.`;
}

/**
 * Focus-or-open the entity, then open Ask. This is the real context handoff:
 * the chat assembles "currently open" from the dock, so the entity tab must be
 * open when the chat panel starts.
 */
export function askAboutEntity(ref: EntityRef): void {
  openEntity(ref);
  useDockStore.getState().open("/ask");
}

function PropertyRows({
  properties,
  entity,
}: {
  properties: InspectorProperty[] | undefined;
  entity: EntityRef;
}) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
      <dt className="text-muted-foreground">Kind</dt>
      <dd className="text-foreground">{KIND_META[entity.kind].label}</dd>
      <dt className="text-muted-foreground">ID</dt>
      <dd className="break-all font-mono text-xs text-muted-foreground">
        {entity.id}
      </dd>
      {properties?.map((property) => (
        <div key={property.label} className="contents">
          <dt className="text-muted-foreground">{property.label}</dt>
          <dd className="break-words text-foreground">{property.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function LinkGroup({
  title,
  edges,
  empty,
  direction,
  loading = false,
}: {
  title: string;
  edges: LinkEdge[];
  empty: string;
  direction: "in" | "out";
  loading?: boolean;
}) {
  const Icon = direction === "in" ? ArrowDownLeft : ArrowUpRight;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        <span>{title}</span>
        {loading ? null : (
          <Badge className="ml-auto px-1.5 py-0 text-xs">{edges.length}</Badge>
        )}
      </div>
      {loading ? (
        <p className="mt-1 text-xs text-muted-foreground">Loading…</p>
      ) : edges.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {edges.map((edge) => (
            <li key={edge.linkId} className="min-w-0 max-w-full">
              <EntityChip entity={edge.other} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Connections({
  connections,
}: {
  connections: { incoming: LinkEdge[]; outgoing: LinkEdge[] } | null;
}) {
  return (
    <section aria-label="Connections">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold">
        <Link2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        Connections
      </h4>
      {connections === null ? (
        <div className="mt-2 space-y-3">
          <LinkGroup
            title="Linked from"
            edges={[]}
            empty=""
            direction="in"
            loading
          />
          <LinkGroup
            title="Links to"
            edges={[]}
            empty=""
            direction="out"
            loading
          />
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          <LinkGroup
            title="Linked from"
            edges={connections.incoming}
            empty="Nothing links here yet."
            direction="in"
          />
          <LinkGroup
            title="Links to"
            edges={connections.outgoing}
            empty="No outgoing links."
            direction="out"
          />
        </div>
      )}
    </section>
  );
}

function EntityInspector({
  projectId,
  view,
  entity,
}: {
  projectId: string;
  view: InspectorView;
  entity: EntityRef;
}) {
  const meta = KIND_META[entity.kind];
  const title = useLiveQuery(
    () => titleOfEntity(entity),
    [entity.kind, entity.id],
  );
  const properties = useLiveQuery(
    () => loadEntityProperties(entity),
    [entity.kind, entity.id],
  );
  const links = useLiveQuery(
    () => linksRepo.listByProject(projectId),
    [projectId],
  );
  const connections = links ? computeBacklinks(links, entity) : null;
  const where = view.surface
    ? `${view.surface.label}${view.section ? ` · ${view.section.label}` : ""}`
    : view.pageLabel;

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-5 p-4">
        <header className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {where}
          </p>
          <div className="flex items-start gap-2">
            <Badge variant="primary" className="mt-0.5 shrink-0">
              {meta.label}
            </Badge>
            <h3 className="min-w-0 break-words text-base font-semibold leading-snug">
              {title === undefined
                ? "Loading title…"
                : title === null
                  ? `${meta.label} not found`
                  : title}
            </h3>
          </div>
        </header>

        <section aria-label="Properties">
          <h4 className="text-xs font-semibold">Properties</h4>
          <div className="mt-2">
            <PropertyRows properties={properties} entity={entity} />
          </div>
        </section>

        <Connections connections={connections} />

        <div className="space-y-2 border-t border-border pt-4">
          <Button className="w-full" onClick={() => askAboutEntity(entity)}>
            <MessageSquare className="h-4 w-4" aria-hidden />
            Ask about this
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Opens Ask and keeps this item open so the assistant can use it as
            context.
          </p>
        </div>
      </div>
    </ScrollArea>
  );
}

function SurfaceSummary({ view }: { view: InspectorView }) {
  if (!view.surface) {
    return (
      <div className="space-y-2 p-4">
        <h3 className="text-sm font-semibold">
          {view.pageId ? view.pageLabel : "No active tab"}
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {view.pageId
            ? "This page has no inspector metadata. Open a tab with a selection to inspect it here."
            : "Open a page from the sidebar to inspect its selection here."}
        </p>
      </div>
    );
  }

  const Icon = view.surface.icon;
  return (
    <div className="space-y-4 p-4">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {view.surface.label}
          </p>
        </div>
        <h3 className="text-sm font-semibold">
          {view.section?.label ?? view.pageLabel}
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {view.surface.description}
        </p>
      </header>
      <div className="space-y-1.5 rounded-md border border-border bg-background/60 p-3">
        <p className="text-xs font-medium">Nothing selected</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {selectionHint(view.surface)}
        </p>
      </div>
    </div>
  );
}

/**
 * Right-hand inspector content. Split from the store subscription so the pure
 * presentational layer can be rendered with any derived view (tests, previews).
 */
export function InspectorContent({
  view,
  projectId,
  className,
}: {
  view: InspectorView;
  projectId: string | null;
  className?: string;
}) {
  return (
    <aside
      aria-label="Inspector"
      data-testid="inspector"
      data-inspector-mode={view.ref ? "entity" : "surface"}
      className={cn(
        "flex h-full min-h-0 w-full flex-col border-l border-border bg-card/40",
        className,
      )}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <PanelRight className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold">Inspector</h2>
        {view.openTabs > 0 ? (
          <span className="ml-auto text-xs text-muted-foreground">
            {view.openTabs} {view.openTabs === 1 ? "tab" : "tabs"}
          </span>
        ) : null}
      </header>

      {!projectId ? (
        <div className="space-y-2 p-4">
          <h3 className="text-sm font-semibold">No project open</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Open or create a project to see the active tab, its properties and
            its connections here.
          </p>
        </div>
      ) : view.ref ? (
        <EntityInspector projectId={projectId} view={view} entity={view.ref} />
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <SurfaceSummary view={view} />
        </ScrollArea>
      )}
    </aside>
  );
}

/**
 * Right-hand inspector. The shell owns the panel width and visibility, so the
 * component intentionally has no close button of its own.
 */
export function Inspector({ className }: { className?: string }) {
  const projectId = useDockStore((s) => s.activeProjectId);
  const projectState = useDockStore((s) =>
    s.activeProjectId ? (s.projects[s.activeProjectId] ?? null) : null,
  );
  const view = deriveInspectorView(projectState, projectId);

  return (
    <InspectorContent view={view} projectId={projectId} className={className} />
  );
}
