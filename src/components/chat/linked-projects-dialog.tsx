"use client";

import { useState } from "react";
import {
  FolderGit2,
  Plus,
  Trash2,
  Loader2,
  ShieldAlert,
  CircleCheck,
} from "lucide-react";
import { linkedProjectsRepo } from "@/lib/db/repos";
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
}: {
  projectId: string;
  roots: LinkedProject[];
  onClose: () => void;
}) {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function basename(p: string): string {
    const clean = p.trim().replace(/[/\\]+$/, "");
    return clean.split(/[/\\]/).pop() ?? clean;
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
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Unlink ${r.name}`}
                    onClick={() => linkedProjectsRepo.remove(r.id)}
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
          <Input
            value={path}
            onChange={(e) => {
              setPath(e.target.value);
              if (!name) setName("");
            }}
            placeholder={
              "Absolute folder path, e.g. " +
              (typeof navigator !== "undefined" &&
              navigator.userAgent.includes("Windows")
                ? "C:\\Dev\\MyUnityGame"
                : "/home/you/my-project")
            }
            className="h-9 font-mono text-sm"
          />
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
