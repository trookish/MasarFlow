"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Hash, Calendar, Folder, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NoteTypeBadge } from "@/components/common/badges";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { useNote } from "@/lib/db/repos/notes";
import { useFolders } from "@/lib/db/repos/misc";
import { formatRelativeTime } from "@/lib/utils";
import { Brain } from "lucide-react";

export default function NotePage() {
  const params = useParams<{ noteId: string }>();
  const note = useNote(params.noteId);
  const folders = useFolders(note?.projectId);
  const folder = folders?.find((f) => f.id === note?.folderId);

  if (note === undefined) return <Skeleton className="m-6 h-64" />;
  if (!note) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Brain}
          title="Note not found"
          description="The note you're looking for doesn't exist or has been deleted."
          actionLabel="Back to Brain"
        />
      </div>
    );
  }

  return (
    <div className="pb-10">
      <div className="border-b border-border px-6 py-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/brain" className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Brain
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 px-6 py-5 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <NoteTypeBadge type={note.type} />
              {folder && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Folder className="h-3 w-3" /> {folder.name}
                </span>
              )}
              <span className="ml-auto text-[10px] text-muted-foreground">
                Updated {formatRelativeTime(note.updatedAt)}
              </span>
            </div>
            <h1 className="text-balance text-3xl font-semibold tracking-tight">{note.title}</h1>
          </div>
          <Card>
            <CardContent className="prose prose-sm max-w-none p-6 dark:prose-invert">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-pretty">
                {note.body}
              </pre>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4 lg:col-span-4">
          <Card>
            <CardHeader>
              <CardDescription>Metadata</CardDescription>
              <CardTitle className="mt-1 text-sm">About this note</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Type</span>
                <span className="ml-auto font-medium">{note.type}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Created</span>
                <span className="ml-auto">{new Date(note.createdAt).toLocaleDateString()}</span>
              </div>
            </CardContent>
          </Card>
          {note.tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardDescription>Links</CardDescription>
                <CardTitle className="mt-1 text-sm">Tags</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {note.tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-0.5 rounded-full border border-border px-2 py-0.5 text-[10px]"
                  >
                    <Hash className="h-2.5 w-2.5" /> {t}
                  </span>
                ))}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardDescription>Coming in S2</CardDescription>
              <CardTitle className="mt-1 text-sm">Backlinks</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Backlinks and the live link graph will populate here once the markdown editor is wired up.
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
