"use client";

import { useEffect, useRef, useState } from "react";
import {
  FolderGit2,
  FolderOpen,
  Plus,
  Trash2,
  Loader2,
  ShieldAlert,
  CircleCheck,
} from "lucide-react";
import { linkedProjectsRepo } from "@/lib/db/repos";
import { getDesktop } from "@/lib/desktop/bridge";
import type { LinkedProject } from "@/lib/db/schema";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * Manage the external project folders linked to this workspace project.
 * Linked roots are the ONLY folders the agentic fs/shell tools can touch.
 */
export function LinkedProjectsDialog({
  projectId,
  roots,
  onClose,
  onChange,
}: {
  projectId: string;
  roots: LinkedProject[];
  onClose: () => void;
  /** Called after a link/unlink/re-grant so the host can re-read the list. */
  onChange?: () => void;
}) {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Desktop: the path can only come from the native picker, and the main
  // process tells us which registered roots cover each linked project.
  const [desktop] = useState(() => getDesktop());
  const [browseBusy, setBrowseBusy] = useState(false);
  const [covers, setCovers] = useState<Record<string, boolean>>({});
  const checkedRef = useRef<Set<string>>(new Set());

  function basename(p: string): string {
    const clean = p.trim().replace(/[/\\]+$/, "");
    return clean.split(/[/\\]/).pop() ?? clean;
  }

  useEffect(() => {
    const d = getDesktop();
    if (!d) return;
    const toCheck = roots.filter((r) => !checkedRef.current.has(`${r.id}:${r.rootPath}`));
    if (toCheck.length === 0) return;
    let cancelled = false;
    void Promise.all(
      toCheck.map(async (r) => {
        const allowed = await d.roots.covers(r.rootPath);
        checkedRef.current.add(`${r.id}:${r.rootPath}`);
        return [r.id, allowed] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setCovers((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
    return () => {
      cancelled = true;
    };
  }, [roots]);

  async function browse() {
    const d = getDesktop();
    if (!d) return;
    setBrowseBusy(true);
    setError(null);
    try {
      const picked = await d.dialog.chooseFolder();
      if (picked) setPath(picked);
    } finally {
      setBrowseBusy(false);
    }
  }

  async function regrant(root: LinkedProject) {
    const d = getDesktop();
    if (!d) return;
    const picked = await d.dialog.chooseFolder(root.rootPath);
    if (!picked) return;
    await linkedProjectsRepo.update(root.id, { rootPath: picked });
    setCovers((prev) => ({ ...prev, [root.id]: true }));
    onChange?.();
  }

  async function add() {
    const rootPath = path.trim();
    if (!rootPath) return;
    setBusy(true);
    setError(null);
    try {
      // Validate the folder exists and is a directory before linking.
      const res = await fetch("/api/fs/list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ root: rootPath, depth: 0, maxEntries: 1 }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Folder not reachable.");
        return;
      }
      await linkedProjectsRepo.create({
        projectId,
        name: name.trim() || basename(rootPath),
        rootPath,
      });
      setPath("");
      setName("");
      onChange?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      ariaLabel="Linked projects"
      className="w-[480px] p-0"
    >
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold">Linked projects</h2>
        <p className="text-xs text-muted-foreground">
          External folders the AI can work in during agentic chats.
        </p>
      </div>

      <div className="space-y-3 p-5">
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <span>
            Reads (list/read/search) run freely. Writes and shell commands
            always ask for your approval in chat before anything executes. Paths
            are sandboxed to linked folders; secret files (.env, keys) are never
            exposed.
          </span>
        </div>

        {roots.length > 0 && (
          <ScrollArea className="max-h-40">
            <ul className="space-y-1">
              {roots.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                >
                  <FolderGit2 className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.name}</div>
                    <div className="truncate font-mono text-[11px] text-muted-foreground">
                      {r.rootPath}
                    </div>
                  </div>
                  {covers[r.id] === false && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => regrant(r)}
                      className="shrink-0 border-warning/40 text-warning hover:bg-warning/10"
                    >
                      <ShieldAlert className="h-3.5 w-3.5" />
                      Re-grant access
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Unlink ${r.name}`}
                    onClick={() => {
                      void linkedProjectsRepo.remove(r.id).then(() => onChange?.());
                    }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={path}
              onChange={(e) => {
                setPath(e.target.value);
                if (!name) setName("");
              }}
              readOnly={desktop !== null}
              placeholder={
                "Absolute folder path, e.g. " +
                (typeof navigator !== "undefined" &&
                navigator.userAgent.includes("Windows")
                  ? "C:\\Dev\\MyProject"
                  : "/home/you/my-project")
              }
              className="h-9 font-mono text-sm"
            />
            {desktop && (
              <Button
                variant="outline"
                size="sm"
                onClick={browse}
                disabled={browseBusy}
                className="shrink-0"
              >
                {browseBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FolderOpen className="h-3.5 w-3.5" />
                )}
                Browse…
              </Button>
            )}
          </div>
          {desktop && (
            <p className="text-[11px] text-muted-foreground">
              Choose the project folder. MasarFlow can only read folders you select here.
            </p>
          )}
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Display name (default: ${path ? basename(path) : "folder name"})`}
            className="h-9 text-sm"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end">
            <Button size="sm" onClick={add} disabled={busy || !path.trim()}>
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Link folder
            </Button>
          </div>
        </div>

        {roots.length > 0 && (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CircleCheck className="h-3 w-3 text-success" />
            Agentic chats can now use fs_list, fs_read, fs_search, fs_write and
            shell_run on {roots.length === 1 ? "this folder" : "these folders"}.
          </p>
        )}
      </div>
    </Dialog>
  );
}
