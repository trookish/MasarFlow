"use client";
import * as React from "react";
import { Network, Boxes, ArrowRight, Layers, GitBranch, Search, Trash2, Plus } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ArchGraph,
  type ArchGraphNode,
  type ArchGraphEdge,
  type ArchNodeType,
  type ArchEdgeKind,
} from "@/components/architecture/arch-graph";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useSystems, useArchGraph } from "@/lib/db/repos/misc";
import { getDb } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TYPE_FILTERS: Array<{ id: ArchNodeType | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "service", label: "Services" },
  { id: "module", label: "Modules" },
  { id: "class", label: "Classes" },
  { id: "so", label: "ScriptableObjects" },
  { id: "scene", label: "Scenes" },
  { id: "prefab", label: "Prefabs" },
];

export default function ArchitecturePage() {
  const project = useActiveProject();
  const systems = useSystems(project?.id);
  const { nodes: archNodes, edges: archEdges } = useArchGraph(project?.id);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [typeFilter, setTypeFilter] = React.useState<ArchNodeType | "all">("all");
  const [search, setSearch] = React.useState("");
  const [layered, setLayered] = React.useState(false);

  const systemName = React.useCallback(
    (systemId: string | null | undefined) => {
      if (!systemId) return undefined;
      return systems?.find((s) => s.id === systemId)?.name;
    },
    [systems],
  );

  const filteredNodes: ArchGraphNode[] = React.useMemo(() => {
    const list: ArchGraphNode[] = archNodes.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      systemName: systemName(n.systemId),
      systemId: n.systemId,
      x: n.x,
      y: n.y,
    }));
    return list.filter((n) => {
      if (typeFilter !== "all" && n.type !== typeFilter) return false;
      if (search && !n.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [archNodes, typeFilter, search, systemName]);

  const visibleIds = React.useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);
  const filteredEdges: ArchGraphEdge[] = React.useMemo(() => {
    return archEdges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
  }, [archEdges, visibleIds]);

  const selected = React.useMemo(() => {
    if (!selectedId) return null;
    const node = archNodes.find((n) => n.id === selectedId);
    if (!node) return null;
    const incoming = archEdges.filter((e) => e.target === selectedId);
    const outgoing = archEdges.filter((e) => e.source === selectedId);
    return { node, system: systemName(node.systemId), incoming, outgoing };
  }, [selectedId, archNodes, archEdges, systemName]);

  const handleConnect = React.useCallback(
    async (source: string, target: string) => {
      if (!project) return;
      if (source === target) return;
      const existing = archEdges.find((e) => e.source === source && e.target === target);
      if (existing) {
        toast.error("Edge already exists");
        return;
      }
      try {
        await getDb().archEdges.add({
          id: crypto.randomUUID(),
          source,
          target,
          kind: "depends",
        });
        toast.success("Edge created");
      } catch (err) {
        console.error(err);
        toast.error("Failed to create edge");
      }
    },
    [archEdges, project],
  );

  const handleNodePositionChange = React.useCallback(
    async (id: string, position: { x: number; y: number }) => {
      await getDb().archNodes.update(id, { x: position.x, y: position.y });
    },
    [],
  );

  const handleAddSystem = async () => {
    if (!project) return;
    const name = window.prompt("System Name:");
    if (!name) return;
    await getDb().systems.add({
      id: crypto.randomUUID(),
      projectId: project.id,
      name,
      kind: "domain",
      description: "",
      dependsOn: [],
      exposes: [],
    });
    toast.success("System created");
  };

  const handleAddNode = async (systemId: string | null) => {
    if (!project) return;
    const name = window.prompt("Node Name:");
    if (!name) return;
    try {
      await getDb().archNodes.add({
        id: crypto.randomUUID(),
        projectId: project.id,
        systemId,
        name,
        type: "module",
        x: null,
        y: null,
      });
      toast.success("Node created");
    } catch (err) {
      console.error(err);
      toast.error("Failed to create node");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={Network}
        eyebrow="Architecture"
        title="Systems, modules, and flow"
        description="Service relationships, dependency graph, execution flow, scenes and prefabs. Click any node to inspect or drag from handles to create edges."
        actions={
          <div className="flex items-center gap-1">
            <Button
              variant={layered ? "soft" : "ghost"}
              size="sm"
              onClick={() => setLayered(!layered)}
              className="gap-1.5"
            >
              <Layers className="h-3.5 w-3.5" />
              {layered ? "Layered" : "Free"}
            </Button>
          </div>
        }
      />

      <div className="border-border flex min-h-0 flex-1 border-t">
        <aside className="border-border bg-surface/50 hidden w-64 shrink-0 border-r p-3 lg:block overflow-y-auto">
          <div className="relative mb-3">
            <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-3.5 w-3.5" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter nodes..."
              className="pl-8"
            />
          </div>
          <div className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wider uppercase">
            Node type
          </div>
          <div className="mb-3 flex flex-wrap gap-1">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setTypeFilter(f.id)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                  typeFilter === f.id
                    ? "border-foreground/30 bg-accent text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/20",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
              Systems
            </div>
            <Button variant="ghost" size="icon" className="h-4 w-4 rounded-sm" onClick={handleAddSystem} title="Add System">
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          <div className="space-y-1">
            {systems?.map((s) => (
              <div key={s.id} className="border-border rounded-md border p-2 text-xs flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{s.name}</div>
                  <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => handleAddNode(s.id)} title="Add Node">
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <div className="text-muted-foreground text-[10px]">
                  {archNodes.filter((n) => n.systemId === s.id).length} nodes
                </div>
              </div>
            ))}
            <div className="border-border border-dashed rounded-md border p-2 text-xs flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-muted-foreground">Orphans</div>
                  <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => handleAddNode(null)} title="Add Orphan Node">
                    <Plus className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
                <div className="text-muted-foreground text-[10px]">
                  {archNodes.filter((n) => n.systemId === null).length} nodes
                </div>
            </div>
          </div>
        </aside>

        <div className="bg-background relative min-h-[520px] flex-1">
          <ArchGraph
            nodes={filteredNodes}
            edges={filteredEdges}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onConnect={handleConnect}
            onNodePositionChange={handleNodePositionChange}
          />
        </div>

        <aside
          className={cn(
            "border-border bg-surface/50 hidden w-80 shrink-0 border-l p-3 lg:block overflow-y-auto",
            !selected && "opacity-50 pointer-events-none",
          )}
        >
          {selected ? (
            <NodeInspector 
              data={selected} 
              onDeleteNode={async () => {
                if (window.confirm("Delete this node and all connected edges?")) {
                  await Promise.all([
                    getDb().archNodes.delete(selected.node.id),
                    getDb().archEdges.where("source").equals(selected.node.id).delete(),
                    getDb().archEdges.where("target").equals(selected.node.id).delete()
                  ]);
                  setSelectedId(null);
                  toast.success("Node deleted");
                }
              }}
              onDeleteEdge={async (edgeId) => {
                await getDb().archEdges.delete(edgeId);
              }}
            />
          ) : (
            <div className="text-muted-foreground grid h-full place-items-center text-center text-xs">
              <div>
                <Boxes className="mx-auto mb-2 h-6 w-6" />
                Click any node to inspect incoming and outgoing edges.
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function NodeInspector({
  data,
  onDeleteNode,
  onDeleteEdge
}: {
  data: {
    node: { id: string; name: string; type: ArchNodeType; systemId: string | null | undefined };
    system: string | undefined;
    incoming: { id: string; source: string; target: string; kind: ArchEdgeKind }[];
    outgoing: { id: string; source: string; target: string; kind: ArchEdgeKind }[];
  };
  onDeleteNode: () => void;
  onDeleteEdge: (id: string) => void;
}) {
  return (
    <div className="flex h-full flex-col gap-3">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center justify-between">
            <span className="flex items-center gap-1.5"><GitBranch className="h-3 w-3" /> Selected node</span>
            <Button variant="ghost" size="icon" className="h-4 w-4 hover:text-[color:var(--danger)]" onClick={onDeleteNode} title="Delete Node">
              <Trash2 className="h-3 w-3" />
            </Button>
          </CardDescription>
          <CardTitle className="text-sm">{data.node.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Type</span>
            <Badge variant="outline" className="capitalize">
              {data.node.type}
            </Badge>
          </div>
          {data.system && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">System</span>
              <span className="font-medium">{data.system}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">ID</span>
            <span className="text-muted-foreground font-mono text-[10px]">{data.node.id}</span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1.5">
            <ArrowRight className="h-3 w-3" />
            Incoming
          </CardDescription>
          <CardTitle className="text-sm">{data.incoming.length}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {data.incoming.length === 0 && (
            <p className="text-muted-foreground text-[10px]">No incoming edges.</p>
          )}
          {data.incoming.map((e) => (
            <div
              key={e.id}
              className="border-border bg-card flex items-center gap-2 rounded-md border p-2 text-[11px] group"
            >
              <span className="text-muted-foreground font-mono truncate max-w-[80px]">{e.source}</span>
              <ArrowRight className="text-muted-foreground shrink-0 h-3 w-3" />
              <span className="font-mono truncate max-w-[80px]">{e.target}</span>
              <Button variant="ghost" size="icon" className="h-4 w-4 ml-auto opacity-0 group-hover:opacity-100 hover:text-[color:var(--danger)]" onClick={() => onDeleteEdge(e.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1.5">
            <ArrowRight className="h-3 w-3" />
            Outgoing
          </CardDescription>
          <CardTitle className="text-sm">{data.outgoing.length}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {data.outgoing.length === 0 && (
            <p className="text-muted-foreground text-[10px]">No outgoing edges.</p>
          )}
          {data.outgoing.map((e) => (
            <div
              key={e.id}
              className="border-border bg-card flex items-center gap-2 rounded-md border p-2 text-[11px] group"
            >
              <span className="font-mono truncate max-w-[80px]">{e.source}</span>
              <ArrowRight className="text-muted-foreground shrink-0 h-3 w-3" />
              <span className="text-muted-foreground font-mono truncate max-w-[80px]">{e.target}</span>
              <Button variant="ghost" size="icon" className="h-4 w-4 ml-auto opacity-0 group-hover:opacity-100 hover:text-[color:var(--danger)]" onClick={() => onDeleteEdge(e.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
