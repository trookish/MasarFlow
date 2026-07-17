"use client";

import { memo, useState } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { GroupNodeData } from "./types";
import { nodeColorStyle } from "./types";

export type GroupNodeType = Node<GroupNodeData, "groupNode">;

function GroupNodeComponent({
  id,
  data,
  selected,
}: NodeProps<GroupNodeType>) {
  const [collapsed, setCollapsed] = useState(data.collapsed ?? false);
  const label = data.label ?? "Group";

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    data.onDataChange?.(id, { ...data, collapsed: next });
  }

  return (
    <div
      style={{
        ...nodeColorStyle(data.color),
        minHeight: collapsed ? 48 : 120,
      }}
      className={
        "flex flex-col overflow-hidden rounded-xl border-2 border-dashed border-border bg-card/40 backdrop-blur-sm transition-shadow " +
        (selected ? "ring-2 ring-primary/40 " : "")
      }
    >
      {/* Handles on all 4 sides so children/external nodes can connect. */}
      <Handle type="target" position={Position.Left} className="!h-2 !w-2" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2" />
      <Handle type="target" position={Position.Top} className="!h-2 !w-2" />
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2" />

      {/* Header bar */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        <button
          type="button"
          onClick={toggle}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={collapsed ? "Expand group" : "Collapse group"}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
      </div>

      {/* Children are React Flow child nodes (parentId), not rendered here.
          When collapsed, we set a tiny height so children are visually hidden
          by the group's own overflow. The board toggles child visibility. */}
      {!collapsed && <div className="min-h-[80px] flex-1" />}
    </div>
  );
}

export const GroupNode = memo(GroupNodeComponent);
