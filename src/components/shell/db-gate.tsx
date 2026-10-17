"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { checkDb, type DbProblem } from "@/lib/db/health";
import { parseBackup, importBackup } from "@/lib/db/backup-import";
import { resetData } from "@/lib/db/data";
import { getDesktop } from "@/lib/desktop/bridge";
import { Button } from "@/components/ui/button";

/** Renders children once the database is readable; otherwise a recovery screen. */
export function DbGate({ children }: { children: ReactNode }) {
  const [problem, setProblem] = useState<DbProblem | null>(null);
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const run = useCallback(async () => {
    setProblem(await checkDb(db));
    setChecked(true);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time startup probe
    void run();
  }, [run]);

  if (!checked) return null;
  if (!problem) return <>{children}</>;

  const desktop = getDesktop();
  async function restoreLatest() {
    try {
      const [latest] = await desktop!.backups.list();
      if (!latest) return setNote("There is no automatic backup to restore.");
      await importBackup(db, parseBackup(await desktop!.backups.read(latest.name), db), "replace");
      await run();
    } catch (e) {
      setNote(`Restore failed. ${e instanceof Error ? e.message : ""}`);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-8" role="alert">
        <AlertTriangle className="mb-4 size-8 text-warning" />
        <h1 className="text-base font-semibold">Your workspace could not be opened</h1>
        <p className="mt-2 text-sm text-muted-foreground">{problem.message}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => void run()}>Try again</Button>
          {desktop ? <Button variant="outline" onClick={() => void restoreLatest()}>Restore the latest automatic backup</Button> : null}
          {desktop ? <Button variant="ghost" onClick={() => void desktop.backups.openFolder()}>Open backups folder</Button> : null}
          <Button
            variant="destructive"
            onClick={async () => {
              if (window.confirm("This permanently deletes the local workspace. Continue?")) {
                await resetData().catch(() => undefined);
                await run();
              }
            }}
          >
            Reset the workspace
          </Button>
        </div>
        {note ? <p className="mt-3 text-xs text-muted-foreground">{note}</p> : null}
      </div>
    </div>
  );
}
