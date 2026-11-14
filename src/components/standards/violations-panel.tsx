"use client";
import * as React from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Violation } from "@/lib/standards/enforcer";

export function ViolationsPanel({
  violations,
  title = "Standards",
}: {
  violations: Violation[];
  title?: string;
}) {
  if (violations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardDescription className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-[color:var(--success)]" />
            Standards
          </CardDescription>
          <CardTitle className="mt-1 text-sm">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-xs">
            No violations. This item follows your standards.
          </p>
        </CardContent>
      </Card>
    );
  }

  const hasErrors = violations.some((v) => v.severity === "error");

  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-[color:var(--warning)]" />
          Standards
        </CardDescription>
        <CardTitle className="mt-1 flex items-center gap-2 text-sm">
          {title}
          <Badge variant={hasErrors ? "danger" : "warning"} className="text-[10px]">
            {violations.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {violations.map((v, i) => (
          <div key={i} className="border-border/60 rounded-md border p-2 text-xs">
            <div className="flex items-center gap-2">
              <Badge
                variant={v.severity === "error" ? "danger" : "warning"}
                className="text-[9px] uppercase"
              >
                {v.severity}
              </Badge>
            </div>
            <p className="text-foreground/90 mt-1 text-pretty">{v.message}</p>
            {v.snippet && (
              <p className="text-muted-foreground mt-1 line-clamp-2 text-[11px]">{v.snippet}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
