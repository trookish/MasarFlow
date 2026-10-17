"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { db } from "@/lib/db";
import { parseBackup, importBackup } from "@/lib/db/backup-import";
import { backupNow } from "@/lib/db/auto-backup";
import { getDesktop } from "@/lib/desktop/bridge";
import { useMounted } from "@/lib/hooks/use-mounted";
import { Button } from "@/components/ui/button";

interface Item {
  name: string;
  mtimeMs: number;
}

export function AutoBackupsCard() {
  const mounted = useMounted();
  const desktop = mounted ? getDesktop() : null;
  const [items, setItems] = useState<Item[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (desktop) setItems(await desktop.backups.list());
  }, [desktop]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial async load
    void refresh();
  }, [refresh]);

  if (!desktop) return null;

  async function restore(name: string) {
    if (!window.confirm(`Replace the current workspace with the backup from ${name}?`)) return;
    setBusy(true);
    try {
      const text = await desktop!.backups.read(name);
      await importBackup(db, parseBackup(text, db), "replace");
      setMessage("Workspace restored.");
    } catch (e) {
      setMessage(`Restore failed and nothing was changed. ${e instanceof Error ? e.message : ""}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4" aria-labelledby="auto-backups-title">
      <div className="flex items-center justify-between">
        <h3 id="auto-backups-title" className="text-sm font-semibold">Automatic backups</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={async () => { setBusy(true); await backupNow(); await refresh(); setBusy(false); }}>
            Back up now
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void desktop.backups.openFolder()}>
            <FolderOpen className="mr-2 size-3.5" /> Open folder
          </Button>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        MasarFlow keeps recent copies of your workspace on this computer. The newest five, one per day for a week and one per week for a month are retained.
      </p>
      <ul className="mt-3 divide-y divide-border text-xs">
        {items.length === 0 ? <li className="py-2 text-muted-foreground">No backups yet.</li> : null}
        {items.map((b) => (
          <li key={b.name} className="flex items-center justify-between py-2">
            <span>{new Date(b.mtimeMs).toLocaleString()}</span>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void restore(b.name)}>Restore</Button>
          </li>
        ))}
      </ul>
      {message ? <p className="mt-2 text-xs text-muted-foreground" role="status">{message}</p> : null}
    </section>
  );
}
