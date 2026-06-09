"use client";
import * as React from "react";
import { BookOpen, ArrowLeft } from "lucide-react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDocs } from "@/lib/db/repos/misc";
import { useActiveProject } from "@/lib/db/repos/projects";
import { formatRelativeTime } from "@/lib/utils";

export default function DocDetailPage() {
  const params = useParams<{ docId: string }>();
  const project = useActiveProject();
  const docs = useDocs(project?.id);
  const doc = docs?.find((d) => d.id === params.docId);

  if (!doc) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/docs" className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <div className="border-b border-border px-6 py-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/docs" className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to documentation
          </Link>
        </Button>
      </div>
      <div className="px-6 py-5">
        <div className="mb-2 flex items-center gap-2">
          <Badge variant="secondary" className="capitalize">{doc.kind}</Badge>
          <span className="text-[10px] text-muted-foreground">Updated {formatRelativeTime(doc.updatedAt)}</span>
        </div>
        <h1 className="text-balance text-3xl font-semibold tracking-tight">{doc.title}</h1>
        <Card className="mt-5">
          <CardContent className="prose prose-sm max-w-none p-6 dark:prose-invert">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-pretty">
              {doc.body}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
