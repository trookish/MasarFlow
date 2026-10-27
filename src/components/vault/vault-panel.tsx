"use client";

import { useLiveQuery } from "dexie-react-hooks";
import {
  FolderOpen,
  RefreshCw,
  AlertTriangle,
  FileWarning,
  Loader2,
} from "lucide-react";
import { db } from "@/lib/db";
import { useActiveProject, useActiveProjectId } from "@/lib/hooks/use-project";
import { useVaultSync } from "@/lib/hooks/use-vault-sync";
import { countByStatus, vaultConflicts } from "@/lib/vault/view";
import { entityHref } from "@/lib/entities/registry"; // P5.T1
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function VaultPanel() {
  const projectId = useActiveProjectId();
  const project = useActiveProject();
  const {
    binding,
    running,
    summary,
    message,
    run,
    resolve,
    pickFolder,
    setFlags,
    unbind,
    setBinding,
  } = useVaultSync(projectId, project?.slug ?? "project");
  const rows = useLiveQuery(
    async () =>
      projectId
        ? db.syncFiles
            .where("[projectId+adapter]")
            .equals([projectId, "folder"])
            .toArray()
        : [],
    [projectId],
  );
  // Entities deleted in the app sit in the trash; their conflicts read differently.
  const trashed = useLiveQuery(
    async () =>
      new Set(
        projectId
          ? (await db.trash.where("projectId").equals(projectId).toArray()).map(
              (t) => t.entityId,
            )
          : [],
      ),
    [projectId],
  );
  const counts = countByStatus(rows ?? []);
  const problems = vaultConflicts(rows ?? []);

  if (!projectId) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Markdown vault</h2>
          <p className="text-xs text-muted-foreground">
            Every note, doc, spec and task as a plain .md file Obsidian, VS Code
            and git can open.
          </p>
        </div>
        {binding.root ? (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void run()} disabled={running}>
              {running ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}{" "}
              Sync now
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void run({ autoImport: true })}
              disabled={running}
            >
              Import from folder
            </Button>
            {summary && summary.untracked > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void run({ adoptUntracked: true })}
                disabled={running}
                title="Files in the folder that MasarFlow did not create. They are never imported on their own."
              >
                Import untracked ({summary.untracked})
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <Button variant="outline" size="sm" onClick={() => void pickFolder()}>
          <FolderOpen className="h-3 w-3" />{" "}
          {binding.root ? "Change folder…" : "Choose folder…"}
        </Button>
        {binding.root ? (
          <>
            <code className="rounded bg-muted px-2 py-0.5 text-xs">
              {binding.root}/{binding.folder}
            </code>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void navigator.clipboard.writeText(
                  `${binding.root}/${binding.folder}`,
                )
              }
            >
              Copy path
            </Button>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={binding.enabled}
                onChange={(e) => setFlags({ enabled: e.target.checked })}
              />
              Watch continuously
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={binding.autoImport}
                onChange={(e) => setFlags({ autoImport: e.target.checked })}
              />
              Import file edits automatically
            </label>
            <button
              type="button"
              onClick={unbind}
              className="text-muted-foreground underline"
            >
              Unbind
            </button>
          </>
        ) : (
          <span className="text-muted-foreground">
            Nothing is written to disk until you pick a folder.
          </span>
        )}
      </div>

      {!binding.root ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const value = new FormData(e.currentTarget).get("root");
            if (typeof value === "string" && value.trim())
              setBinding(value.trim());
          }}
        >
          <Input
            name="root"
            placeholder="C:/Users/you/Documents/ObsidianVault (browser dev only)"
            className="h-8 text-xs"
          />
          <Button type="submit" variant="outline" size="sm">
            Use this path
          </Button>
        </form>
      ) : null}

      {message ? (
        <p className="mt-3 text-xs text-muted-foreground">{message}</p>
      ) : null}

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
        {(
          [
            "synced",
            "local_modified",
            "remote_modified",
            "conflict",
            "deleted",
            "new",
          ] as const
        ).map((s) => (
          <div key={s} className="rounded border border-border p-2">
            <div className="text-muted-foreground">{s.replace("_", " ")}</div>
            <div className="text-sm font-semibold">{counts[s]}</div>
          </div>
        ))}
      </div>

      {problems.length ? (
        <ul className="mt-3 space-y-2">
          {problems.map((row) => {
            const deletedInApp =
              row.status === "conflict" &&
              !!row.entityId &&
              !!trashed?.has(row.entityId);
            return (
              <li
                key={row.id}
                className="flex items-center justify-between gap-2 rounded border border-border p-2 text-xs"
              >
                <span className="flex items-center gap-2">
                  {row.status === "conflict" ? (
                    <AlertTriangle className="h-3 w-3" />
                  ) : (
                    <FileWarning className="h-3 w-3" />
                  )}
                  <span className="font-mono">{row.path}</span>
                  <span
                    className="text-muted-foreground"
                    data-testid="vault-conflict-reason"
                  >
                    {deletedInApp
                      ? "deleted in the app, edited on disk"
                      : row.status === "conflict"
                        ? "changed in the app AND on disk"
                        : "deleted on disk"}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {row.entityType && row.entityId && !deletedInApp ? (
                    <a
                      className="underline"
                      href={entityHref({
                        kind: row.entityType,
                        id: row.entityId,
                      })}
                    >
                      Open
                    </a>
                  ) : null}
                  {deletedInApp ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void resolve(row.entityId!, "file")}
                      >
                        Restore with file content
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void resolve(row.entityId!, "app")}
                      >
                        Keep deleted
                      </Button>
                    </>
                  ) : row.status === "conflict" ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void resolve(row.entityId!, "app")}
                      >
                        Keep app version
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void resolve(row.entityId!, "file")}
                      >
                        Keep file
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void resolve(row.entityId!, "recreate")}
                    >
                      Re-create file
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
