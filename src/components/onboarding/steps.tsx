"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, FolderOpen, KeyRound } from "lucide-react";
import { aiConnectionsRepo, projectsRepo } from "@/lib/db/repos";
import { aiKeySecret } from "@/lib/db/repos/chat-secrets";
import { getDesktop } from "@/lib/desktop/bridge";
import { fetchCatalog, flattenProviders } from "@/lib/ai/catalog";
import type { Project } from "@/lib/db/schema";
import { applyMigration, basenameOf, linkFolder, readMigrationFile } from "@/lib/onboarding/actions";
import type { WizardProgress } from "@/lib/onboarding/state";
import { NewProjectDialog } from "@/components/shell/new-project-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/* ── welcome ─────────────────────────────────────────────────────────────── */

export function WelcomeStep() {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Welcome to MasarFlow</h2>
      <p className="text-sm text-muted-foreground">
        This is a local-first workspace: projects, notes, specs and tasks live in a database on this
        computer. Setup takes a minute — you can skip anything and change it later.
      </p>
      <ul className="space-y-1.5 text-sm text-muted-foreground">
        <li>1. Create your first project.</li>
        <li>2. Point it at the folder on this computer where the work lives.</li>
        <li>3. Optionally connect an AI provider.</li>
      </ul>
    </div>
  );
}

/* ── project ─────────────────────────────────────────────────────────────── */

export function ProjectStep({
  progress,
  update,
  setActiveProjectId,
}: {
  progress: WizardProgress;
  update: (p: Partial<WizardProgress>) => void;
  setActiveProjectId: (id: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const projects = useLiveQuery(() => projectsRepo.all(), []) ?? [];
  const pick = (p: Pick<Project, "id">): void => {
    setActiveProjectId(p.id);
    update({ projectReady: true });
  };
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Your first project</h2>
      <p className="text-sm text-muted-foreground">
        A project is a container for notes, specs, tasks and docs. You can create as many as you like later.
      </p>
      {projects.length > 0 ? (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span>{p.name}</span>
              <Button size="sm" variant="outline" onClick={() => pick(p)}>
                Use this project <ArrowRight className="ml-1 size-3" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button onClick={() => setCreating(true)}>{projects.length ? "Create another" : "Create a project"}</Button>
      <NewProjectDialog
        open={creating}
        mode="modal"
        onOpenChange={setCreating}
        onCreated={(id) => {
          setCreating(false);
          pick({ id });
        }}
      />
      {progress.projectReady ? <p className="text-xs text-emerald-500">Project ready.</p> : null}
    </div>
  );
}

/* ── folder ──────────────────────────────────────────────────────────────── */

export function FolderStep({
  projectId,
  progress,
  update,
}: {
  projectId: string | null;
  progress: WizardProgress;
  update: (p: Partial<WizardProgress>) => void;
}) {
  const desktop = getDesktop();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function choose(): Promise<void> {
    if (!desktop || !projectId) return;
    setBusy(true);
    setNote(null);
    try {
      // The native picker also registers the folder in roots.json (P2.T4).
      const picked = await desktop.dialog.chooseFolder();
      if (!picked) return;
      const result = await linkFolder({ projectId, path: picked });
      if (result.ok) {
        update({ folderLinked: true });
        setNote(`Linked ${basenameOf(picked) || picked}.`);
      } else setNote(result.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Link the folder on this computer</h2>
      <p className="text-sm text-muted-foreground">
        Point MasarFlow at the folder where the code actually lives. Only folders you pick here can be read
        or written by the app — everything else on the disk stays out of reach.
      </p>
      <Button disabled={!desktop || !projectId || busy} onClick={() => void choose()}>
        <FolderOpen className="mr-2 size-4" /> Choose a folder…
      </Button>
      {!desktop ? <p className="text-xs text-muted-foreground">Available in the desktop app.</p> : null}
      {!projectId ? <p className="text-xs text-muted-foreground">Create a project first.</p> : null}
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      {progress.folderLinked ? <p className="text-xs text-emerald-500">Folder linked.</p> : null}
    </div>
  );
}

/* ── provider ────────────────────────────────────────────────────────────── */

export function ProviderStep({
  progress,
  update,
}: {
  progress: WizardProgress;
  update: (p: Partial<WizardProgress>) => void;
}) {
  const [providers, setProviders] = useState<Array<{ id: string; name: string }>>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  // fetchCatalog() falls back to FALLBACK_CATALOG when models.dev is unreachable.
  useEffect(() => {
    let cancelled = false;
    void fetchCatalog().then((c) => {
      if (!cancelled) setProviders(flattenProviders(c).map((p) => ({ id: p.id, name: p.name })));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(withKey: boolean): Promise<void> {
    if (!chosen || busy) return;
    setBusy(true);
    try {
      // create() returns the persisted AiConnection row, not an id (src/lib/db/repos/chat.ts:19-31).
      const conn = await aiConnectionsRepo.create({ providerId: chosen, label: chosen, apiKey: "" });
      if (withKey && key.trim()) {
        const { setSecret } = await import("@/lib/secrets");
        await setSecret(aiKeySecret(conn.id), key.trim()); // key goes to the OS keychain, never Dexie
      }
      update({ providerChosen: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Choose an AI provider</h2>
      <p className="text-sm text-muted-foreground">
        A key is optional: you can start with local notes, tasks and files and add a provider later in
        Settings → AI Providers. Keys are stored in the Windows credential store, never in the workspace.
      </p>
      <div className="flex flex-wrap gap-2">
        {providers.slice(0, 8).map((p) => (
          <Button key={p.id} size="sm" variant={chosen === p.id ? "default" : "outline"} onClick={() => setChosen(p.id)}>
            {p.name}
          </Button>
        ))}
      </div>
      <label className="block space-y-1 text-xs text-muted-foreground">
        API key (optional)
        <Input value={key} onChange={(e) => setKey(e.target.value)} type="password" placeholder="sk-…" autoComplete="off" />
      </label>
      <div className="flex gap-2">
        <Button disabled={!chosen || busy} onClick={() => void save(true)}>
          <KeyRound className="mr-2 size-4" /> Save provider
        </Button>
        <Button variant="ghost" disabled={!chosen || busy} onClick={() => void save(false)}>
          No key needed yet — decide later
        </Button>
      </div>
      {progress.providerChosen ? <p className="text-xs text-emerald-500">Provider saved.</p> : null}
    </div>
  );
}

/* ── migrate ─────────────────────────────────────────────────────────────── */

export function MigrateStep({
  progress,
  update,
}: {
  progress: WizardProgress;
  update: (p: Partial<WizardProgress>) => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ text: string; rows: number } | null>(null);

  async function choose(file: File | undefined): Promise<void> {
    if (!file) return;
    setBusy(true);
    setNote(null);
    setPending(null);
    try {
      const text = await file.text();
      const result = readMigrationFile(text);
      if (!result.ok) {
        setNote(result.error);
        return;
      }
      setPending({ text, rows: result.rows });
      setNote(`${result.summary}. Import replaces this workspace's data.`);
    } finally {
      setBusy(false);
    }
  }

  async function apply(): Promise<void> {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const rows = await applyMigration(pending.text);
      update({ migrationSeen: true });
      setNote(`Imported ${rows} records.`);
      setPending(null);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "That file could not be imported.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Coming from an older MasarFlow?</h2>
      <p className="text-sm text-muted-foreground">
        Settings → Data exports a <code>.json</code> backup. Choose that file here to bring your projects,
        notes, tasks and specs into this install. Starting fresh is fine too.
      </p>
      <input
        type="file"
        accept=".json,application/json"
        disabled={busy}
        onChange={(e) => void choose(e.target.files?.[0])}
        className="block text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-transparent file:px-3 file:py-1.5 file:text-sm"
      />
      {pending ? (
        <Button disabled={busy} onClick={() => void apply()}>
          Import {pending.rows} records
        </Button>
      ) : null}
      <Button
        variant="ghost"
        onClick={() => {
          update({ migrationSeen: true });
          setNote("Starting fresh.");
        }}
      >
        Skip — I&apos;m starting fresh
      </Button>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      {progress.migrationSeen ? <p className="text-xs text-emerald-500">Migration step seen.</p> : null}
    </div>
  );
}

/* ── finish ──────────────────────────────────────────────────────────────── */

export function FinishStep() {
  const desktop = getDesktop();
  const [hideOnClose, setHideOnClose] = useState(false);
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">You&apos;re set</h2>
      <p className="text-sm text-muted-foreground">
        Data lives in <code>%APPDATA%\MasarFlow</code> and in this app&apos;s local database; a rolling backup is
        written automatically. Nothing leaves this computer except the requests you send to your AI provider.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={hideOnClose}
          onChange={(e) => {
            setHideOnClose(e.target.checked);
            if (desktop) void desktop.settings.set({ closeToTray: e.target.checked });
          }}
        />
        <span>Keep MasarFlow running in the notification area when I close the window (off by default)</span>
      </label>
      {desktop?.platform === "win32" ? (
        <p className="text-xs text-muted-foreground">
          This build is not code-signed, so Windows SmartScreen may warn on install: choose “More info” → “Run
          anyway”. See SECURITY.md.
        </p>
      ) : null}
    </div>
  );
}
