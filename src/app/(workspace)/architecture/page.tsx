"use client";
import * as React from "react";
import { Network, Boxes, ArrowRight, Layers, Plus, GitBranch, Search } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArchGraph, type ArchGraphNode, type ArchGraphEdge, type ArchNodeType, type ArchEdgeKind } from "@/components/architecture/arch-graph";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useSystems, useArchGraph } from "@/lib/db/repos/misc";
import { cn } from "@/lib/utils";

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

  const systemName = React.useCallback((systemId: string | null | undefined) => {
    if (!systemId) return undefined;
    return systems?.find((s) => s.id === systemId)?.name;
  }, [systems]);

  const filteredNodes: ArchGraphNode[] = React.useMemo(() => {
    const list: ArchGraphNode[] = archNodes.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      systemName: systemName(n.systemId),
      systemId: n.systemId,
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

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={Network}
        eyebrow="Architecture"
        title="Systems, modules, and flow"
        description="Service relationships, dependency graph, execution flow, scenes and prefabs. Click any node to inspect."
        actions={
          <div className="flex items-center gap-1">
            <Button variant={layered ? "soft" : "ghost"} size="sm" onClick={() => setLayered(!layered)} className="gap-1.5">
              <Layers className="h-3.5 w-3.5" />{layered ? "Layered" : "Free"}
            </Button>
          </div>
        }
      />

      <div className="flex flex-1 min-h-0 border-t border-border">
        <aside className="hidden w-64 shrink-0 border-r border-border bg-surface/50 p-3 lg:block">
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter nodes..." className="pl-8" />
          </div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Node type</div>
          <div className="mb-3 flex flex-wrap gap-1">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setTypeFilter(f.id)}
                className={cn("rounded-full border px-2 py-0.5 text-[10px] transition-colors", typeFilter === f.id ? "border-foreground/30 bg-accent text-foreground" : "border-border text-muted-foreground hover:border-foreground/20")}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Systems</div>
          <div className="space-y-1">
            {systems?.map((s) => (
              <div key={s.id} className="rounded-md border border-border p-2 text-xs">
                <div className="font-medium">{s.name}</div>
                <div className="text-[10px] text-muted-foreground">{(archNodes.filter((n) => n.systemId === s.id)).length} nodes</div>
              </div>
            ))}
          </div>
        </aside>

        <div className="relative min-h-[520px] flex-1 bg-background">
          <ArchGraph
            nodes={layered ? filteredNodes : filteredNodes}
            edges={filteredEdges}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        <aside className={cn("hidden w-80 shrink-0 border-l border-border bg-surface/50 p-3 lg:block", !selected && "opacity-50")}>
          {selected ? (
            <NodeInspector data={selected} />
          ) : (
            <div className="grid h-full place-items-center text-center text-xs text-muted-foreground">
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

function NodeInspector({ data }: { data: { node: { id: string; name: string; type: ArchNodeType; systemId: string | null | undefined }; system: string | undefined; incoming: { id: string; source: string; target: string; kind: ArchEdgeKind }[]; outgoing: { id: string; source: string; target: string; kind: ArchEdgeKind }[] } }) {
  return (
    <div className="flex h-full flex-col gap-3">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1.5">
            <GitBranch className="h-3 w-3" /> Selected node
          </CardDescription>
          <CardTitle className="text-sm">{data.node.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Type</span>
            <Badge variant="outline" className="capitalize">{data.node.type}</Badge>
          </div>
          {data.system && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">System</span>
              <span className="font-medium">{data.system}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">ID</span>
            <span className="font-mono text-[10px] text-muted-foreground">{data.node.id}</span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1.5"><ArrowRight className="h-3 w-3" />Incoming</CardDescription>
          <CardTitle className="text-sm">{data.incoming.length}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {data.incoming.length === 0 && <p className="text-[10px] text-muted-foreground">No incoming edges.</p>}
          {data.incoming.map((e) => (
            <div key={e.id} className="flex items-center gap-2 rounded-md border border-border bg-card p-2 text-[11px]">
              <span className="font-mono text-muted-foreground">{e.source}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono">{e.target}</span>
              <Badge variant="outline" className="ml-auto text-[9px] capitalize">{e.kind}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1.5"><ArrowRight className="h-3 w-3" />Outgoing</CardDescription>
          <CardTitle className="text-sm">{data.outgoing.length}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {data.outgoing.length === 0 && <p className="text-[10px] text-muted-foreground">No outgoing edges.</p>}
          {data.outgoing.map((e) => (
            <div key={e.id} className="flex items-center gap-2 rounded-md border border-border bg-card p-2 text-[11px]">
              <span className="font-mono">{e.source}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono text-muted-foreground">{e.target}</span>
              <Badge variant="outline" className="ml-auto text-[9px] capitalize">{e.kind}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
