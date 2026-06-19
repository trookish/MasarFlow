"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useTheme } from "next-themes";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Boxes, LayoutGrid } from "lucide-react";
import { systemsRepo, archRepo } from "@/lib/db/repos";
import type { System } from "@/lib/db/schema";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { layoutSystems, type LayoutSystem } from "@/lib/arch-layout";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

type SystemNodeData = {
  name: string;
  category: string;
  status: System["status"];
  health: number;
  onOpen?: (id: string) => void;
};

function healthClass(health: number): string {
  if (health >= 70) return "bg-success";
  if (health >= 40) return "bg-warning";
  return "bg-destructive";
}

const STATUS_DOT: Record<System["status"], string> = {
  active: "bg-success",
  planned: "bg-warning",
  deprecated: "bg-muted-foreground",
};

function SystemNode({ id, data }: NodeProps<Node<SystemNodeData>>) {
  return (
    <div
      className="w-52 rounded-md border border-border bg-card p-2.5 shadow-sm transition-colors hover:border-primary/60"
      onDoubleClick={() => data.onOpen?.(id)}
    >
      <Handle type="target" position={Position.Bottom} />
      <div className="flex items-center gap-1.5">
        <span
          className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[data.status])}
        />
        <span className="flex-1 truncate text-sm font-medium">{data.name}</span>
      </div>
      <div className="mt-1 text-[10px] tracking-wide text-muted-foreground uppercase">
        {data.category}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", healthClass(data.health))}
            style={{ width: `${data.health}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground">{data.health}</span>
      </div>
      <Handle type="source" position={Position.Top} />
    </div>
  );
}

const nodeTypes = { system: SystemNode };

function ArchitectureDiagramInner({
  onOpen,
}: {
  onOpen: (systemId: string) => void;
}) {
  const projectId = useActiveProjectId();
  const { resolvedTheme } = useTheme();

  const systems = useLiveQuery(
    () => systemsRepo.listByProject(projectId ?? ""),
    [projectId],
  );
  const positions = useLiveQuery(() => archRepo.positions(projectId), [
    projectId,
  ]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<SystemNodeData>>(
    [],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Auto-layout positions for systems without a saved arrangement.
  const autoPositions = useMemo(() => {
    if (!systems) return {};
    const input: LayoutSystem[] = systems.map((s) => ({
      id: s.id,
      name: s.name,
      dependencies: s.dependencies,
    }));
    return layoutSystems(input);
  }, [systems]);

  // Sync DB → flow state. Preserve any live (dragged) node position; otherwise
  // use the saved position, falling back to the deterministic auto-layout.
  useEffect(() => {
    if (!systems || positions === undefined) return;
    setNodes((prev) => {
      const prevPos = new Map(prev.map((n) => [n.id, n.position]));
      return systems.map((s) => ({
        id: s.id,
        type: "system",
        position:
          prevPos.get(s.id) ??
          positions[s.id] ??
          autoPositions[s.id] ?? { x: 0, y: 0 },
        data: {
          name: s.name,
          category: s.category,
          status: s.status,
          health: s.health,
          onOpen,
        },
      }));
    });

    const ids = new Set(systems.map((s) => s.id));
    setEdges(
      systems.flatMap((s) =>
        s.dependencies
          .filter((dep) => ids.has(dep) && dep !== s.id)
          .map((dep) => ({
            id: `${s.id}->${dep}`,
            source: s.id,
            target: dep,
            markerEnd: { type: MarkerType.ArrowClosed },
          })),
      ),
    );
  }, [systems, positions, autoPositions, onOpen, setNodes, setEdges]);

  const persistPosition = useCallback(
    (node: Node<SystemNodeData>) => {
      if (!projectId) return;
      void archRepo.savePosition(
        projectId,
        node.id,
        node.data.name,
        node.position.x,
        node.position.y,
      );
    },
    [projectId],
  );

  const autoArrange = useCallback(() => {
    if (!projectId || !systems) return;
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        position: autoPositions[n.id] ?? n.position,
      })),
    );
    // Persist the tidy layout so it survives reloads.
    for (const s of systems) {
      const p = autoPositions[s.id];
      if (p) void archRepo.savePosition(projectId, s.id, s.name, p.x, p.y);
    }
  }, [projectId, systems, autoPositions, setNodes]);

  if (systems && systems.length === 0) {
    return (
      <EmptyState
        icon={Boxes}
        title="No systems to map"
        description="Add systems in the Systems tab and connect them with dependencies — they'll appear here as a live architecture diagram."
      />
    );
  }

  return (
    <div className="relative h-full">
      <div className="absolute top-3 right-3 z-10">
        <Button variant="outline" size="sm" onClick={autoArrange}>
          <LayoutGrid className="h-3.5 w-3.5" />
          Auto-arrange
        </Button>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={(_, node) => persistPosition(node)}
        nodeTypes={nodeTypes}
        nodesConnectable={false}
        colorMode={resolvedTheme === "light" ? "light" : "dark"}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={18} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}

export function ArchitectureDiagram({
  onOpen,
}: {
  onOpen: (systemId: string) => void;
}) {
  return (
    <ReactFlowProvider>
      <ArchitectureDiagramInner onOpen={onOpen} />
    </ReactFlowProvider>
  );
}
