"use client";
import * as React from "react";
import { Network, Boxes, ArrowRight, GitBranch } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useSystems, useArchGraph } from "@/lib/db/repos/misc";
import { cn } from "@/lib/utils";

const NODE_COLORS: Record<string, string> = {
  service: "var(--graph-system)",
  class: "var(--graph-spec)",
  scene: "var(--graph-task)",
  prefab: "var(--graph-doc)",
  module: "var(--graph-arch)",
  script: "var(--graph-commit)",
  so: "var(--graph-memory)",
};

export default function ArchitecturePage() {
  const project = useActiveProject();
  const systems = useSystems(project?.id);
  const { nodes, edges } = useArchGraph(project?.id);

  const systemsById = React.useMemo(() => {
    const m: Record<string, (typeof systems extends Array<infer T> ? T : never) | undefined> = {};
    systems?.forEach((s) => (m[s.id] = s));
    return m;
  }, [systems]);

  const nodePositions = React.useMemo(() => {
    const W = 600;
    const H = 320;
    const cx = W / 2;
    const cy = H / 2;
    const R = 110;
    const result: Record<string, { x: number; y: number }> = {};
    nodes.forEach((n, i) => {
      const a = (i / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2;
      result[n.id] = { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R };
    });
    return result;
  }, [nodes]);

  return (
    <div className="pb-10">
      <PageHeader
        icon={Network}
        eyebrow="Architecture"
        title="Systems, modules, and flow"
        description="Service relationships, dependency graphs, execution flow, and state machines — all interactive."
      />

      <div className="grid gap-4 px-6 py-5 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardHeader>
            <CardDescription>Diagram</CardDescription>
            <CardTitle className="mt-1">Dependency & call graph</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative rounded-lg border border-border bg-surface-2 p-4">
              <svg viewBox="0 0 600 320" className="h-72 w-full">
                {edges.map((e) => {
                  const a = nodePositions[e.source];
                  const b = nodePositions[e.target];
                  if (!a || !b) return null;
                  return (
                    <g key={e.id}>
                      <line
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke="var(--border)"
                        strokeWidth="1"
                        strokeDasharray={e.kind === "depends" ? "0" : "3 3"}
                      />
                      <polygon
                        points={`${b.x - 4},${b.y - 4} ${b.x + 4},${b.y - 4} ${b.x},${b.y}`}
                        fill="var(--border)"
                        transform={`rotate(${Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI) - 90} ${b.x} ${b.y})`}
                      />
                    </g>
                  );
                })}
                {nodes.map((n) => {
                  const p = nodePositions[n.id];
                  if (!p) return null;
                  return (
                    <g key={n.id} className="cursor-pointer">
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r="20"
                        fill="var(--background)"
                        stroke={NODE_COLORS[n.type] ?? "var(--primary)"}
                        strokeWidth="2"
                      />
                      <text
                        x={p.x}
                        y={p.y + 30}
                        textAnchor="middle"
                        fontSize="10"
                        fill="var(--foreground)"
                      >
                        {n.name}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                {Object.entries(NODE_COLORS).map(([k, c]) => (
                  <span key={k} className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c }} /> {k}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3 lg:col-span-4">
          {systems?.map((s) => (
            <Card key={s.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-sm">{s.name}</CardTitle>
                  <CardDescription className="mt-0.5">{s.kind}</CardDescription>
                </div>
                <Boxes className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-2 pt-0 text-xs">
                <p className="text-pretty text-muted-foreground">{s.description}</p>
                {s.dependsOn.length > 0 && (
                  <div>
                    <div className="mb-1 text-muted-foreground">Depends on</div>
                    <div className="flex flex-wrap gap-1">
                      {s.dependsOn.map((d) => (
                        <Badge key={d} variant="outline" className="font-mono text-[10px]">
                          {d}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {s.exposes.length > 0 && (
                  <div>
                    <div className="mb-1 text-muted-foreground">Exposes</div>
                    <div className="flex flex-wrap gap-1">
                      {s.exposes.map((d) => (
                        <Badge key={d} variant="secondary" className="font-mono text-[10px]">
                          {d}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
