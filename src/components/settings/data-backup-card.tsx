"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { exportBackup, serializeBackup } from "@/lib/db/backup";
import { BackupError, importBackup, parseBackup } from "@/lib/db/backup-import";
import { Button } from "@/components/ui/button";

const APP_VERSION = "0.2.0.0";

type Pending = { text: string; summary: string };

export function DataBackupCard() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function doExport() {
    setBusy(true);
    setMessage(null);
    try {
      const file = await exportBackup(db, APP_VERSION);
      const blob = new Blob([serializeBackup(file)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `masarflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const rows = Object.values(file.tables).reduce((n, t) => n + t.length, 0);
      setMessage({ kind: "ok", text: `Backup exported (${rows} records). API keys are not included.` });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "The backup could not be created." });
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    try {
      const text = await file.text();
      const parsed = parseBackup(text, db);
      const rows = Object.values(parsed.tables).reduce((n, t) => n + t.length, 0);
      setPending({ text, summary: `${file.name}: ${rows} records, created ${new Date(parsed.exportedAt).toLocaleString()}.` });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof BackupError ? e.message : "The file could not be read." });
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function confirm(mode: "replace" | "merge") {
    if (!pending) return;
    setBusy(true);
    try {
      const summary = await importBackup(db, parseBackup(pending.text, db), mode);
      const total = Object.values(summary.tables).reduce((a, b) => a + b, 0);
      setMessage({ kind: "ok", text: mode === "replace" ? `Workspace restored (${total} records).` : `${total} new records merged.` });
      setPending(null);
    } catch (e) {
      setMessage({ kind: "error", text: `Import failed and nothing was changed. ${e instanceof Error ? e.message : ""}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4" aria-labelledby="backup-title">
      <h3 id="backup-title" className="text-sm font-semibold">Backup and restore</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Export your entire workspace to one file, or restore from one. API keys and the semantic index are not included.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={doExport} disabled={busy}>
          <Download className="mr-2 size-3.5" /> Export backup
        </Button>
        <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()} disabled={busy}>
          <Upload className="mr-2 size-3.5" /> Import backup…
        </Button>
        <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>
      {pending ? (
        <div className="mt-3 rounded-md border border-border bg-background p-3 text-xs" role="alertdialog" aria-label="Confirm import">
          <p>{pending.summary}</p>
          <p className="mt-1 text-muted-foreground">
            <strong>Replace</strong> deletes everything in this workspace first. <strong>Merge</strong> only adds records that are missing.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="destructive" onClick={() => void confirm("replace")} disabled={busy}>Replace workspace</Button>
            <Button size="sm" variant="outline" onClick={() => void confirm("merge")} disabled={busy}>Merge missing records</Button>
            <Button size="sm" variant="ghost" onClick={() => setPending(null)} disabled={busy}>Cancel</Button>
          </div>
        </div>
      ) : null}
      {message ? (
        <p className={`mt-2 text-xs ${message.kind === "error" ? "text-destructive" : "text-muted-foreground"}`} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
