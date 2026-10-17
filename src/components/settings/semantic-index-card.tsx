"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Loader2, RefreshCw } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { getEmbedClient } from "@/lib/ai/embeddings/client";
import type { EmbedderStatus } from "@/lib/ai/embeddings/embedder-core";
import { reindexProject } from "@/lib/ai/embeddings/indexer";
import { useProjectStore } from "@/lib/stores/project";

export function SemanticIndexCard() {
  const projectId = useProjectStore((s) => s.activeProjectId);
  const count = useLiveQuery(() => (projectId ? db.embeddings.where("projectId").equals(projectId).count() : 0), [projectId]);
  const [status, setStatus] = useState<EmbedderStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const poll = () => getEmbedClient().status().then((s) => live && setStatus(s)).catch(() => undefined);
    void poll();
    const t = setInterval(poll, 2000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  async function rebuild() {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      await db.embeddings.where("projectId").equals(projectId).delete();
      await reindexProject(projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const label =
    status?.state === "ready" ? "Ready" : status?.state === "loading" ? "Loading the model…" : status?.state === "error" ? "Unavailable" : "Idle";

  return (
    <section className="rounded-lg border border-border bg-card p-4" aria-labelledby="semantic-index-title">
      <h3 id="semantic-index-title" className="text-sm font-semibold">Semantic index</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Meaning-based search and chat context run entirely on this computer. No data leaves the application.
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
        <div><dt className="text-muted-foreground">Model</dt><dd data-testid="semantic-status">{label}</dd></div>
        <div><dt className="text-muted-foreground">Indexed passages</dt><dd data-testid="semantic-count">{count ?? 0}</dd></div>
        <div><dt className="text-muted-foreground">Dimensions</dt><dd>{status?.dimensions ?? 384}</dd></div>
      </dl>
      {status?.error || error ? <p className="mt-2 text-xs text-destructive" role="alert">{error ?? status?.error}</p> : null}
      <Button className="mt-3" size="sm" variant="outline" onClick={rebuild} disabled={busy || !projectId}>
        {busy ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <RefreshCw className="mr-2 size-3.5" />}
        Rebuild index
      </Button>
    </section>
  );
}
