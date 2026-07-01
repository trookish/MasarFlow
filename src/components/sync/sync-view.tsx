"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import {
  RefreshCw,
  UploadCloud,
  DownloadCloud,
  FileText,
  PenTool,
  BookOpen,
  ArrowUpRight,
  HardDrive,
  Plug,
  Check,
  X,
  Loader2,
  ChevronDown,
  ExternalLink,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";
import {
  notesRepo,
  docsRepo,
  syncRepo,
  foldersRepo,
  noteTemplatesRepo,
} from "@/lib/db/repos";
import { NOTE_TYPES, type EntityKind, type NoteType, type SyncFile } from "@/lib/db/schema";
import {
  buildDesiredFiles,
  reconcile,
  summarize,
  serializeNote,
  serializeDoc,
  noteFilePath,
  docFilePath,
  hashContent,
  normalizeMd,
  parseFrontmatter,
  classifyRemoteStatus,
  SYNC_STATUS_LABEL,
  isObsidianFile,
  isBinaryFile,
  getMimeType,
  type SyncStatus,
  type SyncFileState,
} from "@/lib/sync";
import {
  testObsidianConnection,
  pushFileToObsidian,
  readFileFromObsidian,
  readBinaryFromObsidian,
  listVaultFiles,
} from "@/lib/obsidian-client";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { usePageSettings } from "@/lib/stores/page-settings";
import { useObsidianStore } from "@/lib/stores/obsidian";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";

const AUTO_SYNC_MS: Record<string, number> = {
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "6h": 6 * 60 * 60_000,
};

// Status → pill colors (themeable node tokens).
const STATUS_STYLE: Record<SyncStatus, string> = {
  new: "bg-node-spec/15 text-node-spec",
  local_modified: "bg-node-idea/15 text-node-idea",
  remote_modified: "bg-node-system/15 text-node-system",
  conflict: "bg-node-decision/15 text-node-decision",
  synced: "bg-node-lore/15 text-node-lore",
};

// Filter bar order.
const FILTER_ORDER: SyncStatus[] = [
  "new",
  "local_modified",
  "remote_modified",
  "synced",
  "conflict",
];

const ENTITY_ICON: Partial<Record<EntityKind, LucideIcon>> = {
  note: PenTool,
  doc: BookOpen,
};

function entityHref(type: EntityKind, id: string): string | null {
  if (type === "note") return `/brain?note=${id}`;
  if (type === "doc") return `/docs?doc=${id}`;
  return null;
}

function relTime(ts: number | null): string {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function SyncView() {
  const projectId = useActiveProjectId();
  const { mode, autoSyncInterval, conflictResolution, templatesFolder } =
    usePageSettings((s) => s.sync);
  const update = usePageSettings((s) => s.update);
  const obsidian = useObsidianStore();

  const [filter, setFilter] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const files = useLiveQuery(
    () => syncRepo.listByProject(projectId),
    [projectId],
  );
  const rows = useMemo(() => files ?? [], [files]);
  const counts = useMemo(() => summarize(rows), [rows]);
  const pending = counts.new + counts.local_modified;

  const visible = useMemo(
    () => (filter ? rows.filter((f) => f.status === filter) : rows),
    [rows, filter],
  );

  /** Build the desired vault from the live entities. */
  async function desiredStates(): Promise<SyncFileState[]> {
    const [notes, docs, existing] = await Promise.all([
      notesRepo.listByProject(projectId),
      docsRepo.listByProject(projectId),
      syncRepo.listByProject(projectId),
    ]);
    // Pass existing sync records so imported vault paths are preserved.
    const desired = buildDesiredFiles(notes, docs, existing);
    return reconcile(desired, existing);
  }

  async function handleScan() {
    if (!projectId || busy) return;
    setBusy(true);
    try {
      const states = await desiredStates();
      await syncRepo.replaceAll(projectId, states);
    } finally {
      setBusy(false);
    }
  }

  /** Local mode: mark the in-browser vault index as committed. */
  async function handleSyncLocal() {
    if (!projectId || busy) return;
    setBusy(true);
    try {
      const states = await desiredStates();
      const ts = Date.now();
      await syncRepo.replaceAll(
        projectId,
        states.map((s) =>
          s.status === "conflict" && conflictResolution === "ask"
            ? s
            : { ...s, status: "synced", lastSyncedAt: ts },
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  /**
   * Live entities serialized to their vault files. A previously-synced path
   * (e.g. from an import, or before a title change) is reused so renames and
   * imported-from-anywhere files don't orphan/duplicate the vault file. New
   * MasarFlow notes default to notes/<slug>.md, docs to docs/<cat>/<slug>.md.
   */
  async function gatherEntries() {
    const [notes, docs, existing] = await Promise.all([
      notesRepo.listByProject(projectId),
      docsRepo.listByProject(projectId),
      syncRepo.listByProject(projectId),
    ]);
    const pathByEntity = new Map(
      existing
        .filter((e) => e.entityId != null)
        .map((e) => [e.entityId, e.path]),
    );
    const entries = [
      ...notes.map((n) => ({
        path: pathByEntity.get(n.id) ?? noteFilePath(n),
        content: serializeNote(n),
        entityType: "note" as EntityKind,
        entityId: n.id,
      })),
      ...docs.map((d) => ({
        path: pathByEntity.get(d.id) ?? docFilePath(d),
        content: serializeDoc(d),
        entityType: "doc" as EntityKind,
        entityId: d.id,
      })),
    ];
    return { notes, docs, entries };
  }

  /** Obsidian scan: read each remote file and 3-way classify against the vault. */
  async function handleScanObsidian() {
    if (!projectId || busy) return;
    if (!obsidian.apiKey) {
      setPushMsg({ ok: false, text: "Add your API key below first." });
      return;
    }
    setBusy(true);
    setPushMsg(null);
    try {
      const { entries } = await gatherEntries();
      const existing = await syncRepo.listByProject(projectId);
      const byEntity = new Map(existing.map((e) => [e.entityId, e]));
      const states: SyncFileState[] = [];
      let transportError = "";
      for (const e of entries) {
        const localHash = hashContent(normalizeMd(e.content));
        const remote = await readFileFromObsidian(obsidian, e.path);
        if (!remote.ok && !transportError) transportError = remote.error ?? "read failed";
        const remoteHash = remote.found
          ? hashContent(normalizeMd(remote.content))
          : null;
        const ex = byEntity.get(e.entityId);
        const status = classifyRemoteStatus(
          localHash,
          remoteHash,
          ex?.hash ?? null,
          ex?.lastSyncedAt != null,
        );
        states.push({
          path: e.path,
          hash: localHash,
          status,
          entityType: e.entityType,
          entityId: e.entityId,
          lastSyncedAt:
            status === "synced" ? (ex?.lastSyncedAt ?? Date.now()) : (ex?.lastSyncedAt ?? null),
        });
      }
      await syncRepo.replaceAll(projectId, states);
      setPushMsg(
        transportError
          ? { ok: false, text: `Some files couldn't be read (${transportError}).` }
          : states.length === 0
            ? {
                ok: false,
                text: "This project has no notes or docs yet. Click Pull to import your whole Obsidian vault, or create notes here and Push them.",
              }
            : { ok: true, text: `Compared ${states.length} file(s) with your vault.` },
      );
    } catch (e) {
      setPushMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  /** Obsidian push: write local notes/docs to the vault (respecting conflicts). */
  async function handleSyncObsidian() {
    if (!projectId || busy) return;
    if (!obsidian.apiKey) {
      setPushMsg({ ok: false, text: "Add your API key below first." });
      return;
    }
    setBusy(true);
    setPushMsg(null);
    try {
      const { entries } = await gatherEntries();
      const existing = await syncRepo.listByProject(projectId);
      const byEntity = new Map(existing.map((e) => [e.entityId, e]));
      const ts = Date.now();
      let pushed = 0;
      let failed = 0;
      let firstError = "";
      const states: SyncFileState[] = [];

      for (const e of entries) {
        const localHash = hashContent(normalizeMd(e.content));
        const ex = byEntity.get(e.entityId);
        const status = (ex?.status as SyncStatus) ?? "new";
        const shouldPush =
          !ex ||
          status === "new" ||
          status === "local_modified" ||
          ((status === "conflict" || status === "remote_modified") &&
            conflictResolution === "prefer-local");

        let newStatus = status;
        let hash = ex?.hash ?? localHash;
        let lastSyncedAt = ex?.lastSyncedAt ?? null;

        if (shouldPush) {
          const r = await pushFileToObsidian(obsidian, e.path, e.content, getMimeType(e.path));
          if (r.ok) {
            pushed += 1;
            newStatus = "synced";
            hash = localHash;
            lastSyncedAt = ts;
          } else {
            failed += 1;
            if (!firstError) firstError = r.error ?? `status ${r.status}`;
          }
        }

        states.push({
          path: e.path,
          hash,
          status: newStatus,
          entityType: e.entityType,
          entityId: e.entityId,
          lastSyncedAt,
        });
      }

      await syncRepo.replaceAll(projectId, states);
      setPushMsg(
        failed > 0
          ? { ok: false, text: `${failed} file(s) failed (${firstError}).` }
          : {
              ok: true,
              text:
                pushed === 0
                  ? "Already up to date — nothing to push."
                  : `Pushed ${pushed} file${pushed === 1 ? "" : "s"} to your vault.`,
            },
      );
    } catch (e) {
      setPushMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  /**
   * Create a new MasarFlow entity from a remote vault file. Files under docs/
   * become docs; everything else becomes a note (preserving its vault path).
   */
  async function importRemoteFile(
    pid: string,
    path: string,
    content: string,
    folderId: string | null,
  ): Promise<SyncFileState | null> {
    const { fields, body } = parseFrontmatter(content);
    const fileName = path.split("/").pop() ?? path;
    const baseTitle = fileName.replace(/\.md$/i, "");
    const hash = hashContent(normalizeMd(content));

    if (path.startsWith("docs/")) {
      const parts = path.split("/"); // docs/<category>/<slug>.md
      const category = fields.category || (parts.length >= 3 ? parts[1] : "general");
      const d = await docsRepo.create({
        projectId: pid,
        title: fields.title || baseTitle,
        category,
        body,
      });
      return { path, hash, status: "synced", entityType: "doc", entityId: d.id, lastSyncedAt: Date.now() };
    }

    const type = (NOTE_TYPES as readonly string[]).includes(fields.type)
      ? (fields.type as NoteType)
      : "note";
    const tags = fields.tags
      ? fields.tags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];
    const n = await notesRepo.create({
      projectId: pid,
      title: fields.title || baseTitle,
      type,
      tags,
      body,
      folderId,
    });
    return { path, hash, status: "synced", entityType: "note", entityId: n.id, lastSyncedAt: Date.now() };
  }

  /**
   * Vault files worth importing — accepts all Obsidian-native file types
   * (.md, .canvas, images, audio, video, PDF). Skips Excalidraw drawings
   * and dot-directories (.obsidian, .trash, .git, …) but allows dotfiles
   * in regular directories.
   */
  function isImportableFile(path: string): boolean {
    if (/\.excalidraw\.md$/i.test(path)) return false; // Excalidraw drawings
    if (!isObsidianFile(path)) return false;
    // Skip dot-directories (.obsidian, .trash, .git, .makemd, .space, …)
    // but allow dotfiles in regular folders (only directory segments matter).
    const segments = path.split("/");
    const dirs = segments.slice(0, -1); // all except the filename
    if (dirs.some((seg) => seg.startsWith("."))) return false;
    return true;
  }

  /** Overwrite an existing MasarFlow entity with a remote vault file's content. */
  async function applyRemoteToEntity(
    entityType: EntityKind,
    entityId: string,
    content: string,
  ) {
    const { fields, body } = parseFrontmatter(content);
    if (entityType === "note") {
      const type = (NOTE_TYPES as readonly string[]).includes(fields.type)
        ? (fields.type as NoteType)
        : undefined;
      const tags = fields.tags
        ? fields.tags.split(",").map((t) => t.trim()).filter(Boolean)
        : undefined;
      await notesRepo.update(entityId, {
        ...(fields.title ? { title: fields.title } : {}),
        ...(type ? { type } : {}),
        ...(tags ? { tags } : {}),
        body,
      });
    } else if (entityType === "doc") {
      await docsRepo.update(entityId, {
        ...(fields.title ? { title: fields.title } : {}),
        ...(fields.category ? { category: fields.category } : {}),
        body,
      });
    }
  }

  /**
   * Obsidian pull: bring the vault's MasarFlow/ folder into MasarFlow — import
   * files that don't exist here yet, and apply edits made in Obsidian to ones
   * that do. New MasarFlow notes not yet in the vault keep their push status.
   */
  async function handlePullObsidian() {
    if (!projectId || busy) return;
    if (!obsidian.apiKey) {
      setPushMsg({ ok: false, text: "Add your API key below first." });
      return;
    }
    const pid = projectId;
    setBusy(true);
    setPushMsg(null);
    try {
      const listing = await listVaultFiles(obsidian);
      if (!listing.ok) {
        setPushMsg({ ok: false, text: `Couldn't list the vault (${listing.error}).` });
        return;
      }
      const { entries } = await gatherEntries();
      const existingIdx = await syncRepo.listByProject(pid);
      const idxByEntity = new Map(
        existingIdx.filter((e) => e.entityId != null).map((e) => [e.entityId, e]),
      );
      const knownPaths = new Set(entries.map((e) => e.path));
      const ts = Date.now();
      let imported = 0;
      let pulled = 0;
      let failed = 0;
      let firstError = "";
      const states: SyncFileState[] = [];

      // 1) Existing MasarFlow entities: read remote, classify, apply edits.
      for (const e of entries) {
        const localHash = hashContent(normalizeMd(e.content));
        const ex = idxByEntity.get(e.entityId);
        const base = { path: e.path, entityType: e.entityType, entityId: e.entityId };
        const remote = await readFileFromObsidian(obsidian, e.path);
        if (!remote.ok) {
          failed += 1;
          if (!firstError) firstError = remote.error ?? "read failed";
          states.push({ ...base, hash: ex?.hash ?? localHash, status: (ex?.status as SyncStatus) ?? "new", lastSyncedAt: ex?.lastSyncedAt ?? null });
          continue;
        }
        if (!remote.found) {
          // Not in the vault yet — still needs a push.
          states.push({ ...base, hash: localHash, status: "new", lastSyncedAt: ex?.lastSyncedAt ?? null });
          continue;
        }
        const remoteHash = hashContent(normalizeMd(remote.content));
        const status = classifyRemoteStatus(localHash, remoteHash, ex?.hash ?? null, ex?.lastSyncedAt != null);
        const shouldPull =
          status === "remote_modified" ||
          (status === "conflict" && conflictResolution === "prefer-remote");
        if (shouldPull) {
          await applyRemoteToEntity(e.entityType, e.entityId, remote.content);
          pulled += 1;
          states.push({ ...base, hash: remoteHash, status: "synced", lastSyncedAt: ts });
        } else {
          states.push({
            ...base,
            hash: status === "synced" ? remoteHash : (ex?.hash ?? localHash),
            status,
            lastSyncedAt: status === "synced" ? (ex?.lastSyncedAt ?? ts) : (ex?.lastSyncedAt ?? null),
          });
        }
      }

      // 2) Vault files with no MasarFlow entity yet: import as new notes/docs,
      //    recreating the vault's folder hierarchy in the Brain.
      const folders = await foldersRepo.listByProject(pid);
      const folderKey = (parentId: string | null, name: string) =>
        `${parentId ?? ""}/${name}`;
      const folderCache = new Map<string, string>(
        folders.map((f) => [folderKey(f.parentId, f.name), f.id]),
      );
      // Walk/create the nested folder chain for a list of segments → deepest id.
      async function ensureFolderPath(segments: string[]): Promise<string | null> {
        let parentId: string | null = null;
        for (const name of segments) {
          const key = folderKey(parentId, name);
          let id = folderCache.get(key);
          if (!id) {
            const f = await foldersRepo.create({ projectId: pid, name, parentId });
            id = f.id;
            folderCache.set(key, id);
          }
          parentId = id;
        }
        return parentId;
      }

      // Files under the configured templates folder import as note templates.
      const tplPrefix = templatesFolder.replace(/\/+$/, "");
      const isTemplatePath = (p: string) =>
        tplPrefix !== "" && (p === tplPrefix || p.startsWith(`${tplPrefix}/`));
      const existingTemplateNames = new Set(
        (await noteTemplatesRepo.listByProject(pid)).map((t) => t.name),
      );

      const newFiles = listing.files.filter(
        (p) => isImportableFile(p) && !knownPaths.has(p),
      );
      let importedTemplates = 0;
      for (const path of newFiles) {
        // Binary files (images, audio, video, PDF): track in sync index only.
        if (isBinaryFile(path)) {
          const remote = await readBinaryFromObsidian(obsidian, path);
          if (!remote.ok || !remote.found) {
            failed += 1;
            if (!firstError) firstError = remote.error ?? "read failed";
            continue;
          }
          const hash = hashContent(remote.base64);
          states.push({
            path,
            hash,
            status: "synced",
            entityType: "note",
            entityId: `attachment:${path}`,
            lastSyncedAt: Date.now(),
          });
          imported += 1;
          continue;
        }

        // Text files: .md and .canvas — read as text.
        const acceptType = path.endsWith(".canvas") ? "application/json" : "text/markdown";
        const remote = await readFileFromObsidian(obsidian, path, acceptType);
        if (!remote.ok || !remote.found) {
          failed += 1;
          if (!firstError) firstError = remote.error ?? "read failed";
          continue;
        }

        // .canvas files: track in sync index (not imported as notes).
        if (path.endsWith(".canvas")) {
          const hash = hashContent(normalizeMd(remote.content));
          states.push({
            path,
            hash,
            status: "synced",
            entityType: "note",
            entityId: `canvas:${path}`,
            lastSyncedAt: Date.now(),
          });
          imported += 1;
          continue;
        }

        if (isTemplatePath(path)) {
          const { fields, body } = parseFrontmatter(remote.content);
          const name = fields.title || (path.split("/").pop() ?? path).replace(/\.md$/i, "");
          if (!existingTemplateNames.has(name)) {
            const type = (NOTE_TYPES as readonly string[]).includes(fields.type)
              ? (fields.type as NoteType)
              : "note";
            const tags = fields.tags
              ? fields.tags.split(",").map((t) => t.trim()).filter(Boolean)
              : [];
            await noteTemplatesRepo.create({ projectId: pid, name, type, tags, body });
            existingTemplateNames.add(name);
            importedTemplates += 1;
          }
          continue; // templates aren't tracked in the sync index
        }

        // Notes mirror their vault folders; docs use categories instead.
        const dir = path.split("/").slice(0, -1);
        const folderId = path.startsWith("docs/")
          ? null
          : await ensureFolderPath(dir);
        const created = await importRemoteFile(pid, path, remote.content, folderId);
        if (created) {
          states.push(created);
          imported += 1;
        }
      }

      await syncRepo.replaceAll(pid, states);

      const parts: string[] = [];
      if (imported) parts.push(`imported ${imported}`);
      if (importedTemplates)
        parts.push(`${importedTemplates} template${importedTemplates === 1 ? "" : "s"}`);
      if (pulled) parts.push(`updated ${pulled}`);
      setPushMsg(
        failed > 0
          ? { ok: false, text: `${failed} file(s) failed (${firstError}).` }
          : parts.length === 0
            ? { ok: true, text: "Nothing new in the vault to pull." }
            : { ok: true, text: `Pull complete — ${parts.join(", ")} from your vault.` },
      );
    } catch (e) {
      setPushMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const handleSync = mode === "obsidian" ? handleSyncObsidian : handleSyncLocal;
  const handleScanAction = mode === "obsidian" ? handleScanObsidian : handleScan;

  // Background auto-sync on the configured interval.
  const syncRef = useRef(handleSync);
  useEffect(() => {
    syncRef.current = handleSync;
  });
  useEffect(() => {
    if (autoSyncInterval === "off" || !projectId) return;
    const ms = AUTO_SYNC_MS[autoSyncInterval];
    if (!ms) return;
    const h = setInterval(() => void syncRef.current(), ms);
    return () => clearInterval(h);
  }, [autoSyncInterval, projectId]);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <RefreshCw className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Vault sync</span>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          <ModeButton
            icon={HardDrive}
            label="Local"
            active={mode === "local"}
            onClick={() => update("sync", { mode: "local" })}
          />
          <ModeButton
            icon={Plug}
            label="Obsidian"
            active={mode === "obsidian"}
            onClick={() => update("sync", { mode: "obsidian" })}
          />
        </div>

        <span className="text-xs text-muted-foreground">
          {rows.length} file{rows.length === 1 ? "" : "s"}
          {pending > 0 ? ` · ${pending} pending` : ""}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleScanAction}
            disabled={!projectId || busy}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
            {mode === "obsidian" ? "Scan vault" : "Scan workspace"}
          </Button>
          {mode === "obsidian" ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePullObsidian}
                disabled={!projectId || busy || !obsidian.apiKey}
                title="Bring the vault's MasarFlow/ folder in — new files become notes, edits update existing ones"
              >
                <DownloadCloud className="h-3.5 w-3.5" />
                Pull
                {counts.remote_modified > 0 ? ` (${counts.remote_modified})` : ""}
              </Button>
              <Button
                size="sm"
                onClick={handleSyncObsidian}
                disabled={!projectId || busy || !obsidian.apiKey}
              >
                <UploadCloud className="h-3.5 w-3.5" />
                Push
                {pending > 0 ? ` (${pending})` : ""}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={handleSyncLocal}
              disabled={!projectId || busy || pending === 0}
            >
              <UploadCloud className="h-3.5 w-3.5" />
              Sync now{pending > 0 ? ` (${pending})` : ""}
            </Button>
          )}
        </div>
      </div>

      {/* Obsidian connection + setup guide */}
      {mode === "obsidian" && <ObsidianPanel pushMsg={pushMsg} />}

      {rows.length === 0 ? (
        <EmptyState
          icon={RefreshCw}
          title="Nothing scanned yet"
          description={
            mode === "obsidian"
              ? "Connect your vault above, then Scan the workspace to build the file index. Sync to Obsidian writes your notes and docs into the vault under notes/ and docs/."
              : "Scan the workspace to build a Markdown vault index from your notes and docs. Each scan detects which files are new or modified; Sync commits them in the browser."
          }
          action={
            <Button onClick={handleScan} disabled={!projectId || busy}>
              <RefreshCw className="h-4 w-4" /> Scan workspace
            </Button>
          }
        />
      ) : (
        <>
          {/* Status filter chips */}
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
            <FilterChip
              label="All"
              count={rows.length}
              active={filter === null}
              onClick={() => setFilter(null)}
            />
            {FILTER_ORDER.filter((s) => counts[s] > 0).map((s) => (
              <FilterChip
                key={s}
                label={SYNC_STATUS_LABEL[s]}
                count={counts[s]}
                active={filter === s}
                dotClass={STATUS_STYLE[s]}
                onClick={() => setFilter(filter === s ? null : s)}
              />
            ))}
          </div>

          <ScrollArea className="flex-1">
            <ul className="divide-y divide-border">
              {visible.map((f) => (
                <FileRow key={f.id} file={f} />
              ))}
            </ul>
          </ScrollArea>
        </>
      )}
    </div>
  );
}

function ModeButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

// ── Obsidian connection + guide ──────────────────────────────────────────────

function ObsidianPanel({
  pushMsg,
}: {
  pushMsg: { ok: boolean; text: string } | null;
}) {
  const { baseUrl, apiKey, setBaseUrl, setApiKey } = useObsidianStore();
  const templatesFolder = usePageSettings((s) => s.sync.templatesFolder);
  const update = usePageSettings((s) => s.update);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const [showGuide, setShowGuide] = useState(false);
  const [folderOptions, setFolderOptions] = useState<string[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);

  async function test() {
    setTesting(true);
    setResult(null);
    const r = await testObsidianConnection({ baseUrl, apiKey });
    setResult(r);
    setTesting(false);
  }

  // Lazily derive the vault's folder list (for the templates-folder picker).
  async function loadFolders() {
    if (loadingFolders || folderOptions.length > 0 || !apiKey) return;
    setLoadingFolders(true);
    const listing = await listVaultFiles({ baseUrl, apiKey });
    const dirs = new Set<string>();
    for (const f of listing.files) {
      const parts = f.split("/");
      for (let i = 1; i < parts.length; i++) {
        const dir = parts.slice(0, i).join("/");
        if (!dir.split("/").some((seg) => seg.startsWith("."))) dirs.add(dir);
      }
    }
    setFolderOptions([...dirs].sort((a, b) => a.localeCompare(b)));
    setLoadingFolders(false);
  }

  const status = pushMsg
    ? { ok: pushMsg.ok, message: pushMsg.text }
    : result;

  return (
    <div className="shrink-0 space-y-3 border-b border-border bg-muted/20 px-4 py-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            Server URL
          </span>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://127.0.0.1:27124"
            className="h-8 w-56 font-mono text-xs"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            API key
          </span>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste from the plugin settings"
            className="h-8 w-64 font-mono text-xs"
          />
        </label>
        <Button variant="outline" size="sm" onClick={test} disabled={testing}>
          {testing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plug className="h-3.5 w-3.5" />
          )}
          Test connection
        </Button>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            Templates folder
          </span>
          <Input
            value={templatesFolder}
            list="obsidian-folder-options"
            onFocus={loadFolders}
            onChange={(e) => update("sync", { templatesFolder: e.target.value })}
            placeholder={loadingFolders ? "Loading folders…" : "e.g. 06. Templates"}
            className="h-8 w-48 text-xs"
          />
          <datalist id="obsidian-folder-options">
            {folderOptions.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </label>
        <button
          type="button"
          onClick={() => setShowGuide((v) => !v)}
          className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <BookOpen className="h-3.5 w-3.5" />
          How to connect
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              showGuide && "rotate-180",
            )}
          />
        </button>
      </div>

      {status && (
        <div
          className={cn(
            "flex items-center gap-1.5 text-xs",
            status.ok ? "text-success" : "text-destructive",
          )}
        >
          {status.ok ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5" />
          )}
          {status.message}
        </div>
      )}

      {showGuide && <ObsidianGuide onClose={() => setShowGuide(false)} />}
    </div>
  );
}

function ObsidianGuide({ onClose }: { onClose: () => void }) {
  const steps = [
    'In Obsidian, open Settings → Community plugins and turn off "Restricted mode" if it\'s on.',
    'Click Browse, search for "Local REST API", then Install and Enable it.',
    "Open the plugin’s settings (Settings → Local REST API) and copy the API Key.",
    "Paste the API key above (the server URL defaults to https://127.0.0.1:27124, but use whatever port the plugin shows) and click Test connection.",
    "Pull brings your whole vault in: every markdown file becomes a MasarFlow note (skipping drawings and config folders), and later Obsidian edits update existing ones. Push writes MasarFlow notes back to their original vault path (new notes go to notes/<title>.md).",
    "Optional: set a Templates folder above (e.g. 06. Templates) — files in it import as MasarFlow note templates instead of notes.",
  ];
  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">Connect MasarFlow to your Obsidian vault</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close guide"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
              {i + 1}
            </span>
            <span className="text-muted-foreground">{s}</span>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-2 text-muted-foreground">
        <a
          href="https://github.com/coddingtonbear/obsidian-local-rest-api"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          Plugin on GitHub <ExternalLink className="h-3 w-3" />
        </a>
        <span>
          Obsidian must stay open while syncing — the server runs inside the app.
        </span>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  dotClass,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  dotClass?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-border bg-accent text-foreground"
          : "border-transparent text-muted-foreground hover:bg-accent/50",
      )}
    >
      {dotClass && (
        <span className={cn("h-2 w-2 rounded-full", dotClass.split(" ")[0])} />
      )}
      {label}
      <span className="text-muted-foreground">{count}</span>
    </button>
  );
}

function FileRow({ file }: { file: SyncFile }) {
  const Icon = ENTITY_ICON[file.entityType ?? "note"] ?? FileText;
  const href =
    file.entityType && file.entityId
      ? entityHref(file.entityType, file.entityId)
      : null;
  const status = file.status as SyncStatus;

  return (
    <li className="group flex items-center gap-3 px-4 py-2.5 hover:bg-accent/30">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-mono text-sm">
        {file.path}
      </span>
      <span className="hidden text-xs text-muted-foreground sm:inline">
        {relTime(file.lastSyncedAt)}
      </span>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[11px] font-medium",
          STATUS_STYLE[status],
        )}
      >
        {SYNC_STATUS_LABEL[status]}
      </span>
      {href && (
        <Link
          href={href}
          className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-primary"
          aria-label="Open entity"
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </li>
  );
}
