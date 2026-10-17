import type { SyncFile } from "@/lib/db/schema";
import { docsRepo } from "@/lib/db/repos/docs";
import { foldersRepo } from "@/lib/db/repos/folders";
import { notesRepo } from "@/lib/db/repos/notes";
import { specsRepo } from "@/lib/db/repos/specs";
import { syncRepo } from "@/lib/db/repos/sync";
import { tasksRepo } from "@/lib/db/repos/tasks";
import { hashContent, normalizeMd } from "@/lib/sync";
import type { VaultIO } from "./io";
import { claimOf, fileSegment, isMirroredPath, type MirrorKind } from "./paths";
import {
  collectLocal, indexRowFor, mirrorKey, planVaultSync, resolveNextRow,
  type MirrorEntity, type MirrorFile, type VaultAction,
} from "./plan";
import { applyVaultDoc, parseVaultDoc } from "./serialize";
import type { SyncFileInput } from "@/lib/db/repos/sync";

export interface VaultDeps {
  io: VaultIO;
  /** absolute folder the user picked (an allowed root) */
  root: string;
  /** mirror subfolder inside it, e.g. `MasarFlow/my-project` */
  folder: string;
  projectId: string;
  projectSlug: string;
  /** import file edits automatically, or only when the user asks */
  autoImport: boolean;
  now: () => number;
  /** safety valve for a folder full of foreign files */
  maxExternalPerRun?: number;
}

export interface VaultRunSummary {
  written: number;
  imported: number;
  conflicts: number;
  missing: number;
  external: number;
  blocked: number;
  skipped: number;
  errors: string[];
}

interface Ctx {
  entities: MirrorEntity[];
  contentByKey: Map<string, string>;
  rows: SyncFileInput[];
  index: SyncFile[];
}

const emptySummary = (): VaultRunSummary => ({
  written: 0, imported: 0, conflicts: 0, missing: 0, external: 0, blocked: 0, skipped: 0, errors: [],
});

/** Read every mirrored .md and describe it (hash null = unreadable). */
async function scanMirror(deps: VaultDeps): Promise<{ files: MirrorFile[]; errors: string[] }> {
  const listed = await deps.io.list(deps.root, deps.folder);
  if (!listed.ok) return { files: [], errors: [listed.error ?? "vault list failed"] };
  const files: MirrorFile[] = [];
  const errors: string[] = [];
  for (const entry of listed.files) {
    if (!isMirroredPath(entry.path)) {
      files.push({ path: entry.path, hash: null, msfId: null });
      continue;
    }
    const read = await deps.io.read(deps.root, `${deps.folder}/${entry.path}`);
    if (!read.ok || !read.found) {
      errors.push(`unreadable: ${entry.path}`);
      files.push({ path: entry.path, hash: null, msfId: null });
      continue;
    }
    if (read.truncated) {
      errors.push(`too large to verify, left untouched: ${entry.path}`);
      files.push({ path: entry.path, hash: null, msfId: null });
      continue;
    }
    files.push({ path: entry.path, hash: hashContent(normalizeMd(read.content)), msfId: parseVaultDoc(read.content).id });
  }
  return { files, errors };
}

async function importEntity(deps: VaultDeps, action: Extract<VaultAction, { action: "import" }>, fileHash: string | null): Promise<boolean> {
  const read = await deps.io.read(deps.root, `${deps.folder}/${action.path}`);
  if (!read.ok || !read.found || read.truncated) return false;
  const patch = applyVaultDoc(action.kind, parseVaultDoc(read.content));
  switch (patch.kind) {
    case "note":
      await notesRepo.update(action.entityId, patch.patch);
      break;
    case "doc":
      await docsRepo.update(action.entityId, patch.patch);
      break;
    case "spec":
      await specsRepo.update(action.entityId, patch.patch);
      break;
    case "task":
      await tasksRepo.update(action.entityId, patch.patch);
      break;
  }
  return fileHash != null;
}

/** Create an entity for a file no row claims (see D-P7-1 for the kinds). */
async function adoptExternal(deps: VaultDeps, path: string): Promise<{ kind: MirrorKind; id: string } | null> {
  const kind = claimOf(path);
  if (!kind) return null;
  const read = await deps.io.read(deps.root, `${deps.folder}/${path}`);
  if (!read.ok || !read.found || read.truncated) return null;
  const doc = parseVaultDoc(read.content);
  const title = doc.title || fileSegment(path.split("/").pop()!.replace(/\.md$/i, ""), "untitled");
  const folderPath = path.split("/").slice(1, -1).join("/");
  if (kind === "note" || kind === "doc") {
    const created =
      kind === "note"
        ? await notesRepo.create({ projectId: deps.projectId, title, body: doc.body, tags: doc.tags })
        : await docsRepo.create({ projectId: deps.projectId, title, body: doc.body, category: folderPath || "general" });
    if (Object.keys(doc.props).length) {
      const patch = { props: doc.props };
      if (kind === "note") await notesRepo.update(created.id, patch);
      else await docsRepo.update(created.id, patch);
    }
    return { kind, id: created.id };
  }
  if (kind === "spec") {
    const rawNumber = doc.fields.number;
    const created = await specsRepo.create({
      projectId: deps.projectId,
      title,
      number: typeof rawNumber === "string" && rawNumber ? rawNumber : "RFC-000",
    });
    return { kind, id: created.id };
  }
  const created = await tasksRepo.create({ projectId: deps.projectId, title, description: doc.body, tags: doc.tags });
  return { kind, id: created.id };
}

export async function runVaultSync(deps: VaultDeps): Promise<VaultRunSummary> {
  const summary = emptySummary();
  const [notes, docs, specs, tasks, folders, index] = await Promise.all([
    notesRepo.listByProject(deps.projectId),
    docsRepo.listByProject(deps.projectId),
    specsRepo.listByProject(deps.projectId),
    tasksRepo.listByProject(deps.projectId),
    foldersRepo.listByProject(deps.projectId),
    syncRepo.listByProject(deps.projectId),
  ]);

  const { entities, contentByKey } = collectLocal({ notes, docs, specs, tasks, folders, index, projectSlug: deps.projectSlug });
  const ctx: Ctx = { entities, contentByKey, rows: [], index };
  const byId = new Map(entities.map((e) => [e.id, e]));
  const { files, errors } = await scanMirror(deps);
  summary.errors.push(...errors);

  const actions = planVaultSync({ entities, files, autoImport: deps.autoImport });
  const fileHashes = new Map(files.map((f) => [f.path, f.hash]));
  const externalLimit = deps.maxExternalPerRun ?? 200;
  let adopted = 0;

  for (const action of actions) {
    switch (action.action) {
      case "write": {
        const content = contentByKey.get(mirrorKey(action.kind, action.entityId));
        if (content === undefined) {
          summary.errors.push(`no content for ${action.entityId}`);
          break;
        }
        const res = await deps.io.write(deps.root, `${deps.folder}/${action.path}`, content);
        if (!res.ok) {
          summary.errors.push(res.error ?? `write failed: ${action.path}`);
          break;
        }
        summary.written += 1;
        break;
      }
      case "import": {
        const ok = await importEntity(deps, action, fileHashes.get(action.path) ?? null);
        if (ok) summary.imported += 1;
        else summary.errors.push(`import failed: ${action.path}`);
        break;
      }
      case "repath":
        break; // the row below carries the new path; content decisions are separate actions
      case "external": {
        if (adopted >= externalLimit) {
          summary.errors.push(`adopt limit reached (${externalLimit}), skipped ${action.path}`);
          break;
        }
        adopted += 1;
        const created = await adoptExternal(deps, action.path);
        if (created) {
          summary.external += 1;
          summary.errors.push(`imported ${action.path} as a new ${created.kind}`);
        } else {
          summary.errors.push(`could not adopt ${action.path}`);
        }
        break;
      }
      case "conflict":
        summary.conflicts += 1;
        break;
      case "blocked":
        summary.blocked += 1;
        break;
      case "missing":
        summary.missing += 1;
        break;
      case "ignore":
        break;
      case "skip":
        summary.skipped += 1;
        break;
    }
    const entityId = "entityId" in action ? action.entityId ?? "" : "";
    const actionPath = "path" in action ? action.path : action.to;
    const row = indexRowFor(action, byId.get(entityId), fileHashes.get(actionPath) ?? null, deps.now());
    if (row) ctx.rows.push(row);
  }

  // Rows for entities whose file we adopted/created stay accurate: rewrite them
  // from what we know now (an import may have changed the entity's own hash).
  if (ctx.rows.length) await syncRepo.replaceAll(deps.projectId, ctx.rows);
  return summary;
}

/** The user's answer to a conflict / deletion. */
export async function resolveVaultConflict(
  deps: VaultDeps,
  entityId: string,
  choice: "app" | "file" | "recreate",
): Promise<boolean> {
  const index = await syncRepo.listByProject(deps.projectId);
  const row = index.find((r) => r.entityId === entityId);
  if (!row) return false;
  const read = await deps.io.read(deps.root, `${deps.folder}/${row.path}`);
  const fileHash = read.ok && read.found && !read.truncated ? hashContent(normalizeMd(read.content)) : null;

  if (choice === "file") {
    if (fileHash == null) return false;
    const kind = claimOf(row.path) ?? (row.entityType as MirrorKind | null);
    if (!kind) return false;
    const patch = applyVaultDoc(kind, parseVaultDoc(read.content));
    if (patch.kind === "note") await notesRepo.update(entityId, patch.patch);
    if (patch.kind === "doc") await docsRepo.update(entityId, patch.patch);
    if (patch.kind === "spec") await specsRepo.update(entityId, patch.patch);
    if (patch.kind === "task") await tasksRepo.update(entityId, patch.patch);
  }

  const next = resolveNextRow(row, fileHash, choice, deps.now());
  await syncRepo.replaceAll(
    deps.projectId,
    index.map((r) => (r.id === row.id ? next : { path: r.path, hash: r.hash, status: r.status, entityType: r.entityType, entityId: r.entityId, lastSyncedAt: r.lastSyncedAt })),
  );
  return true;
}
