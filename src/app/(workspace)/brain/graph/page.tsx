"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Maximize } from "lucide-react";
import {
  ReactFlow,
  Background,
  Controls,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useNotes } from "@/lib/db/repos/notes";
import { useRouter } from "next/navigation";

const TYPE_ACCENT: Record<string, string> = {
  idea: "var(--graph-idea)",
  system: "var(--graph-system)",
  mechanic: "var(--graph-task)",
  research: "var(--graph-doc)",
  experiment: "var(--graph-arch)",
  note: "var(--graph-note)",
  lore: "var(--graph-memory)",
  decision: "var(--graph-spec)",
};

function BrainGraphInner() {
  const router = useRouter();
  const project = useActiveProject();
  const notes = useNotes(project?.id);
  const { fitView } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  React.useEffect(() => {
    if (!notes) return;

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    const titleToId = new Map<string, string>();
    notes.forEach((n) => titleToId.set(n.title.toLowerCase(), n.id));

    const W = 800;
    const H = 600;
    const cx = W / 2;
    const cy = H / 2;
    const radius = 300;

    notes.forEach((n, i) => {
      const angle = (i / notes.length) * Math.PI * 2;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;

      newNodes.push({
        id: n.id,
        position: { x, y },
        data: { label: n.title },
        style: {
          background: "var(--card)",
          color: "var(--foreground)",
          border: `2px solid ${TYPE_ACCENT[n.type] || "var(--border)"}`,
          borderRadius: "8px",
          padding: "8px 12px",
          fontSize: "12px",
          fontWeight: 600,
          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
        },
      });

      // Parse [[Links]]
      const matches = n.body.matchAll(/\[\[(.*?)\]\]/g);
      for (const match of matches) {
        const targetTitle = match[1].toLowerCase();
        const targetId = titleToId.get(targetTitle);
        if (targetId && targetId !== n.id) {
          newEdges.push({
            id: `e_${n.id}_${targetId}`,
            source: n.id,
            target: targetId,
            animated: true,
            style: { stroke: "var(--border)", strokeWidth: 2 },
          });
        }
      }
    });

    setNodes(newNodes);
    setEdges(newEdges);
    
    // Fit view after a tick
    setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 50);
  }, [notes, setNodes, setEdges, fitView]);

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => router.push(`/brain/${node.id}`)}
        fitView
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background gap={20} size={1} color="color-mix(in oklch, var(--border) 80%, transparent)" />
        <Controls position="bottom-right" showInteractive={false} className="!shadow-md" />
      </ReactFlow>
      
      <div className="absolute top-4 left-4 z-10">
        <Button variant="secondary" size="sm" onClick={() => fitView({ padding: 0.2, duration: 400 })}>
          <Maximize className="mr-2 h-4 w-4" /> Recenter
        </Button>
      </div>
    </div>
  );
}

export default function BrainGraphPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4 shrink-0">
        <Link
          href="/brain"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Brain
        </Link>
      </div>

      <div className="shrink-0">
        <PageHeader
          eyebrow="Brain"
          title="Note Graph"
          description="Visual representation of how your notes link to one another."
        />
      </div>

      <div className="flex-1 overflow-hidden px-6 pb-6">
        <div className="border-border bg-surface-2 h-full w-full overflow-hidden rounded-lg border shadow-sm">
          <ReactFlowProvider>
            <BrainGraphInner />
          </ReactFlowProvider>
        </div>
      </div>
    </div>
  );
}
