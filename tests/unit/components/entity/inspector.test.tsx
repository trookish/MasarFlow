import "fake-indexeddb/auto";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import {
  Inspector,
  InspectorContent,
  askAboutEntity,
  deriveInspectorView,
  loadEntityProperties,
  selectionHint,
} from "@/components/entity/inspector";
import {
  formatActiveContext,
  deriveActiveContext,
} from "@/lib/ai/active-context";
import { db } from "@/lib/db";
import { notesRepo } from "@/lib/db/repos/notes";
import { specsRepo } from "@/lib/db/repos/specs";
import { tasksRepo } from "@/lib/db/repos/tasks";
import { urlOfFocused } from "@/lib/dock/dock-core";
import { getSurface } from "@/lib/navigation/surfaces";
import { useDockStore } from "@/lib/stores/dock";

function resetDock(projectId: string | null = null): void {
  useDockStore.setState({
    projects: {},
    activeProjectId: null,
    closedTabs: {},
  });
  if (projectId) useDockStore.getState().setProject(projectId);
}

function renderInspectorContent(className?: string): string {
  const project = useDockStore.getState().getProject();
  const view = deriveInspectorView(project, "p1");
  return renderToStaticMarkup(
    <InspectorContent view={view} projectId="p1" className={className} />,
  );
}

beforeEach(async () => {
  resetDock(null);
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe("deriveInspectorView", () => {
  it("has no surface when no project is active", () => {
    const view = deriveInspectorView(null, null);
    expect(view).toMatchObject({
      projectId: null,
      focusedUrl: null,
      ref: null,
      surface: null,
      section: null,
      openTabs: 0,
    });
  });

  it("reads the selected entity and its surface section from dock state", () => {
    resetDock("p1");
    useDockStore.getState().open("/work?view=specs&spec=s1");
    const project = useDockStore.getState().getProject();

    const view = deriveInspectorView(project, "p1");
    expect(view.focusedUrl).toBe("/work?view=specs&spec=s1");
    expect(view.pageId).toBe("/work");
    expect(view.ref).toEqual({ kind: "spec", id: "s1" });
    expect(view.surface?.id).toBe("work");
    expect(view.section?.id).toBe("specs");
    expect(view.openTabs).toBeGreaterThan(0);
  });

  it("follows a legacy section URL and reports its surface instead of an entity", () => {
    resetDock("p1");
    useDockStore.getState().open("/dashboard");
    const project = useDockStore.getState().getProject();

    const view = deriveInspectorView(project, "p1");
    expect(view.focusedUrl).toBe("/today?view=dashboard");
    expect(view.ref).toBeNull();
    expect(view.surface?.id).toBe("today");
    expect(view.section?.id).toBe("dashboard");
    expect(view.pageLabel).toBe("Today");
  });
});

describe("selectionHint", () => {
  it("names the kinds selectable on the active surface", () => {
    expect(selectionHint(getSurface("today")!)).toBe(
      "Select a commit or memory to inspect its properties and connections here.",
    );
  });

  it("says plainly when a surface has no single-item selection", () => {
    expect(selectionHint(getSurface("system")!)).toContain(
      "does not select a single item",
    );
  });
});

describe("loadEntityProperties", () => {
  it("returns kind-specific task properties from the real repo", async () => {
    const task = await tasksRepo.create({
      projectId: "p1",
      title: "Wire the inspector",
      status: "in_progress",
      priority: "high",
      assignee: "ai",
      dueDate: Date.UTC(2030, 0, 15),
    });

    const properties = await loadEntityProperties({
      kind: "task",
      id: task.id,
    });
    expect(properties.map((property) => property.label)).toEqual([
      "Status",
      "Priority",
      "Assignee",
      "Due",
      "Updated",
    ]);
    expect(properties[0].value).toBe("In progress");
    expect(properties[1].value).toBe("High");
    expect(properties[2].value).toBe("AI");
  });

  it("returns note metadata and omits empty tag rows", async () => {
    const tagged = await notesRepo.create({
      projectId: "p1",
      title: "Design notes",
      type: "decision",
      tags: ["ui", "inspector"],
    });
    const untagged = await notesRepo.create({
      projectId: "p1",
      title: "Scratch",
    });

    const taggedProperties = await loadEntityProperties({
      kind: "note",
      id: tagged.id,
    });
    expect(taggedProperties.map((property) => property.label)).toEqual([
      "Type",
      "Tags",
      "Updated",
    ]);
    expect(taggedProperties[0].value).toBe("Decision");
    expect(taggedProperties[1].value).toBe("ui, inspector");

    const untaggedProperties = await loadEntityProperties({
      kind: "note",
      id: untagged.id,
    });
    expect(untaggedProperties.map((property) => property.label)).toEqual([
      "Type",
      "Updated",
    ]);
  });

  it("shows spec progress and returns nothing for a deleted entity", async () => {
    const spec = await specsRepo.create({
      projectId: "p1",
      number: "12",
      title: "Tabs-only shell",
      status: "implementing",
      implementationProgress: 40,
    });

    const properties = await loadEntityProperties({
      kind: "spec",
      id: spec.id,
    });
    expect(properties).toContainEqual({
      label: "Status",
      value: "Implementing",
    });
    expect(properties).toContainEqual({ label: "Progress", value: "40%" });

    expect(await loadEntityProperties({ kind: "spec", id: "missing" })).toEqual(
      [],
    );
  });
});

describe("askAboutEntity", () => {
  it("opens Ask while keeping the entity in the real active context", () => {
    resetDock("p1");

    askAboutEntity({ kind: "task", id: "t1" });

    const project = useDockStore.getState().getProject();
    expect(project).not.toBeNull();
    expect(urlOfFocused(project!)).toBe("/ask");
    expect(deriveInspectorView(project, "p1").section?.id).toBe("chat");

    const context = deriveActiveContext(project)!;
    expect(
      context.panels.some(
        (panel) => panel.ref?.kind === "task" && panel.ref.id === "t1",
      ),
    ).toBe(true);
    expect(formatActiveContext(context, new Map())).toContain("id t1");
  });
});

describe("Inspector rendering", () => {
  it("explains the surface when no entity is selected", () => {
    resetDock("p1");
    useDockStore.getState().open("/dashboard");

    const html = renderInspectorContent("custom-class");
    expect(html).toContain('aria-label="Inspector"');
    expect(html).toContain('data-inspector-mode="surface"');
    expect(html).toContain("custom-class");
    expect(html).toContain("Today");
    expect(html).toContain("Dashboard");
    expect(html).toContain(
      "What needs attention now across the active project.",
    );
    expect(html).toContain("Nothing selected");
    expect(html).toContain("Select a commit or memory");
    expect(html).not.toContain("Ask about this");
  });

  it("renders the selected entity, both connection groups and the Ask action", () => {
    resetDock("p1");
    useDockStore.getState().open("/work?view=specs&spec=s1");

    const html = renderInspectorContent();
    expect(html).toContain('data-inspector-mode="entity"');
    expect(html).toContain("Specifications");
    expect(html).toContain("Spec");
    expect(html).toContain("s1");
    expect(html).toContain("Loading title…");
    expect(html).toContain("Linked from");
    expect(html).toContain("Links to");
    expect(html).toContain("Ask about this");
    expect(html).toContain("Opens Ask");
  });

  it("has no control that pretends to close the shell-owned panel", () => {
    resetDock("p1");

    const html = renderInspectorContent();
    expect(html).not.toContain('aria-label="Close inspector"');
    expect(html).not.toContain("Close inspector");
  });

  it("tells the user when no project is open", () => {
    const html = renderToStaticMarkup(<Inspector />);
    expect(html).toContain('data-inspector-mode="surface"');
    expect(html).toContain("No project open");
    expect(html).not.toContain("Ask about this");
  });
});
