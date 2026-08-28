"use client";

/**
 * Recursive layout renderer: splits render as flex rows/columns with
 * draggable dividers, tabs/page nodes render as DockGroups. Panels stay
 * mounted (keep-alive) — hiding happens inside PanelContent.
 */

import type { DockNode } from "@/lib/dock/types";
import { useDockStore } from "@/lib/stores/dock";
import { SplitDivider } from "./split-divider";
import { DockGroup } from "./dock-group";
import { cn } from "@/lib/utils/cn";
export function DockTreeView({ node }: { node: DockNode }) {
  switch (node.type) {
    case "split":
      return <SplitNode node={node} />;
    case "tabs":
      return (
        <DockGroup
          nodeId={node.id}
          pages={node.pages}
          activePage={node.activePage}
          collapsed={false}
        />
      );
    case "page":
      return (
        <DockGroup
          nodeId={node.id}
          pages={[node.pageId]}
          activePage={node.pageId}
          collapsed={false}
        />
      );
  }
}

function SplitNode({
  node,
}: {
  node: Extract<DockNode, { type: "split" }>;
}) {
  const [first, second] = node.children;
  const horizontal = node.direction === "horizontal";

  return (
    <div
      className={cn("flex h-full min-h-0 w-full", horizontal ? "flex-row" : "flex-col")}
    >
      <div
        className="min-h-0 min-w-0"
        style={
          horizontal
            ? { width: `${node.ratio * 100}%`, flex: "0 0 auto" }
            : { height: `${node.ratio * 100}%`, flex: "0 0 auto" }
        }
      >
        <DockNodeChild node={first} />
      </div>
      <SplitDivider direction={node.direction} splitId={node.id} />
      <div className="min-h-0 min-w-0 flex-1">
        <DockNodeChild node={second} />
      </div>
    </div>
  );
}

/** Render a child, collapsing it to a slim bar when its panel is collapsed. */
function DockNodeChild({ node }: { node: DockNode }) {
  if (node.type === "page") {
    return <CollapsedAwareGroup nodeId={node.id} pages={[node.pageId]} activePage={node.pageId} />;
  }
  if (node.type === "tabs") {
    return <CollapsedAwareGroup nodeId={node.id} pages={node.pages} activePage={node.activePage} />;
  }
  return <DockTreeView node={node} />;
}

/**
 * Group wrapper that resolves the collapsed state of its primary panel and
 * renders the slim restore bar when collapsed.
 */
function CollapsedAwareGroup({
  nodeId,
  pages,
  activePage,
}: {
  nodeId: string;
  pages: string[];
  activePage: string;
}) {
  const projectState = useDockStore((s) =>
    s.activeProjectId ? (s.projects[s.activeProjectId] ?? null) : null,
  );
  const collapsed = projectState?.collapsedPanels.includes(activePage) ?? false;
  return (
    <DockGroup nodeId={nodeId} pages={pages} activePage={activePage} collapsed={collapsed} />
  );
}
