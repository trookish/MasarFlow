/**
 * P9.T18 — the on-disk markdown mirror (/sync → "Markdown vault") on the
 * PACKAGED app.
 *
 *   "/sync: vault mirror writes markdown files"
 *   "/sync: file edits import without touching the file"
 *   "/sync: conflicting edits are never overwritten"
 *   "/sync: a deleted file is reported, not re-created"
 *
 * Every test binds a real temp folder through the app's own folder picker (the
 * stub only replaces the native dialog; the IPC still records the root and the
 * P2 guard still checks it), then reads the .md files back with node:fs. The
 * claims are about bytes on disk — writing, not overwriting, not re-creating —
 * never about the panel merely rendering.
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import {
  expect,
  launchApp,
  navigateTo,
  readTable,
  stubFolderPicker,
  surfacePanel,
  test,
  type AppHandle,
} from "./_harness";

const WRITE_TITLE = "/sync: vault mirror writes markdown files";
const IMPORT_TITLE = "/sync: file edits import without touching the file";
const CONFLICT_TITLE = "/sync: conflicting edits are never overwritten";
const DELETED_TITLE = "/sync: a deleted file is reported, not re-created";

interface NoteRow {
  id: string;
  projectId: string;
  title: string;
  body: string;
}

function syncPanel(page: Page): Locator {
  // /sync is a section of the System surface; the panel is the System tab.
  return surfacePanel(page, "Sync Panel");
}

/** The "Markdown vault" section (its own <section>), not the Obsidian panel. */
function vaultSection(page: Page): Locator {
  return syncPanel(page).locator("section").filter({ hasText: "Markdown vault" });
}

function notesPanel(page: Page): Locator {
  // Notes is the first section of the Capture surface.
  return surfacePanel(page, "Notes");
}

/** Every .md file under `dir`, recursively. */
function mdFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...mdFiles(full));
    else if (entry.name.toLowerCase().endsWith(".md")) out.push(full);
  }
  return out;
}

/** The body of a mirrored file (everything after the frontmatter block). */
function bodyOfFile(file: string): string {
  const lines = readFileSync(file, "utf8").split("\n");
  expect(lines[0]).toBe("---");
  const close = lines.indexOf("---", 1);
  expect(close).toBeGreaterThan(0);
  return lines.slice(close + 1).join("\n").trim();
}

/**
 * Rewrite a mirrored file's BODY (keeping its frontmatter), the way an editor
 * or Obsidian would. Returns the exact content written.
 */
function editBodyOnDisk(file: string, line: string): string {
  const original = readFileSync(file, "utf8");
  const lines = original.split("\n");
  expect(lines[0]).toBe("---");
  const close = lines.indexOf("---", 1);
  expect(close).toBeGreaterThan(0);
  const edited = [
    ...lines.slice(0, close + 1),
    "",
    line,
    lines.slice(close + 1).join("\n"),
  ].join("\n");
  writeFileSync(file, edited, "utf8");
  return edited;
}

/** The mirrored file of a note, found by the id the app wrote into it. */
function findFileForNote(mirrorDir: string, noteId: string): string | undefined {
  return mdFiles(mirrorDir).find((f) => readFileSync(f, "utf8").includes(`msf_id: ${noteId}`));
}

function fileForNote(mirrorDir: string, noteId: string): string {
  const match = findFileForNote(mirrorDir, noteId);
  expect(match, `no mirrored file carries msf_id: ${noteId}`).toBeTruthy();
  return match!;
}

/** Binds `dir` through the real folder picker and returns the mirror folder. */
async function bindVault(
  handle: AppHandle,
  dir: string,
): Promise<{ vault: Locator; mirrorDir: string }> {
  const { page } = handle;
  await stubFolderPicker(handle, dir);
  await navigateTo(page, "Sync Panel");
  const vault = vaultSection(page);
  await vault.getByRole("button", { name: "Choose folder…" }).click();

  const code = vault.locator("code").first();
  await expect(code).toContainText("MasarFlow/", { timeout: 20_000 });
  const mirrorDir = (await code.innerText()).trim();
  expect(mirrorDir.startsWith(dir)).toBe(true);

  // Binding enables continuous watching and kicks its own run; let it settle,
  // then switch watching off so each test owns its own runs.
  const syncNow = vault.getByRole("button", { name: "Sync now" });
  await expect(syncNow).toBeEnabled({ timeout: 90_000 });
  await expect.poll(() => mdFiles(mirrorDir).length, { timeout: 60_000 }).toBeGreaterThan(0);
  await vault.getByRole("checkbox", { name: "Watch continuously" }).uncheck();
  return { vault, mirrorDir };
}

/** Clicks "Sync now" and waits for the run to stop (the button re-enables). */
async function runSync(vault: Locator): Promise<void> {
  const button = vault.getByRole("button", { name: "Sync now" });
  await button.click();
  await expect(button).toBeDisabled({ timeout: 10_000 }).catch(() => undefined);
  await expect(button).toBeEnabled({ timeout: 120_000 });
}

async function noteById(page: Page, id: string): Promise<NoteRow | undefined> {
  return (await readTable<NoteRow>(page, "notes")).find((n) => n.id === id);
}

/** A seeded note that has both a body and a mirrored file. */
async function noteToEdit(page: Page, mirrorDir: string): Promise<{ note: NoteRow; file: string }> {
  const notes = await readTable<NoteRow>(page, "notes");
  const note =
    notes.find((n) => n.body.trim().length > 0 && findFileForNote(mirrorDir, n.id)) ?? notes[0];
  return { note, file: fileForNote(mirrorDir, note.id) };
}

function tempRoot(): string {
  return mkdtempSync(path.join(os.tmpdir(), "msf-vault-"));
}

test(WRITE_TITLE, async () => {
  test.setTimeout(240_000);
  const dir = tempRoot();
  const app = await launchApp({ seed: "demo" });
  const { page } = app;
  try {
    // The folder is a fresh temp dir, so every file in it was written by the
    // run that binding kicks off. (Deleting the mirror and syncing again is
    // NOT a rewrite: the app reports those files as deleted on disk and never
    // re-creates them, which the deleted-file test below relies on.)
    const { vault, mirrorDir } = await bindVault(app, dir);
    await runSync(vault);
    // Nothing to resolve: no conflict or deleted-file row offers a choice.
    await expect(vault.getByRole("button", { name: /Keep file|Re-create file/ })).toHaveCount(0);

    const files = mdFiles(mirrorDir);
    expect(files.length).toBeGreaterThan(5);
    // The mirror keeps its documented layout: a directory per entity kind.
    const dirs = new Set(files.map((f) => path.relative(mirrorDir, f).split(path.sep)[0]));
    expect([...dirs].sort()).toEqual(expect.arrayContaining(["notes", "tasks"]));

    // A real note landed as markdown: frontmatter links it back to its row and
    // the body is the note's own text.
    // The mirror is per project and the demo seeds several, so take the
    // project from what was mirrored, then require ALL of its notes on disk.
    const allNotes = await readTable<NoteRow>(page, "notes");
    const mirrored = allNotes.filter((n) => findFileForNote(mirrorDir, n.id));
    expect(mirrored.length).toBeGreaterThan(0);
    const projectId = mirrored[0].projectId;
    const notes = allNotes.filter((n) => n.projectId === projectId);
    expect(mirrored.map((n) => n.id).sort()).toEqual(notes.map((n) => n.id).sort());
    const note = notes.find((n) => n.body.trim().length > 0) ?? notes[0];
    const file = fileForNote(mirrorDir, note.id);
    // Notes live under notes/, inside their folder chain (notes/Engineering/…).
    expect(path.relative(mirrorDir, file).split(path.sep)[0]).toBe("notes");
    const raw = readFileSync(file, "utf8");
    expect(raw).toContain(`msf_id: ${note.id}`);
    expect(raw).toContain("msf_kind: note");
    expect(raw).toContain(note.title);
    expect(bodyOfFile(file)).toBe(note.body.trim());

    // The file name comes from the title (path-safe), not from the id.
    expect(path.basename(file, ".md")).not.toBe(note.id);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test(IMPORT_TITLE, async () => {
  test.setTimeout(240_000);
  const dir = tempRoot();
  const app = await launchApp({ seed: "demo" });
  const { page } = app;
  try {
    const { vault, mirrorDir } = await bindVault(app, dir);
    const { note, file } = await noteToEdit(page, mirrorDir);

    // An edit made in Obsidian: the body changes, the frontmatter (and so the
    // entity identity and the path) does not.
    const marker = `DISK-EDIT-${Date.now()}`;
    const edited = editBodyOnDisk(file, `Edited in Obsidian — ${marker}`);
    const before = statSync(file).mtimeMs;

    await vault.getByRole("button", { name: "Import from folder" }).click();

    // The app took the file's body...
    await expect
      .poll(async () => (await noteById(page, note.id))?.body, { timeout: 90_000 })
      .toContain(marker);

    // ...and never wrote the file: byte-identical, same mtime.
    expect(readFileSync(file, "utf8")).toBe(edited);
    expect(statSync(file).mtimeMs).toBe(before);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test(CONFLICT_TITLE, async () => {
  test.setTimeout(300_000);
  const dir = tempRoot();
  const app = await launchApp({ seed: "demo" });
  const { page } = app;
  try {
    const { vault, mirrorDir } = await bindVault(app, dir);
    const { note, file } = await noteToEdit(page, mirrorDir);

    // 1) The app-side edit, through the real note editor.
    const appMarker = `APP-EDIT-${Date.now()}`;
    await navigateTo(page, "Brain");
    const brain = notesPanel(page);
    await brain.getByText(note.title, { exact: true }).first().click();
    await expect(brain.getByPlaceholder("Untitled note")).toHaveValue(note.title, {
      timeout: 20_000,
    });
    await brain.locator(".cm-content").first().click();
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText(`\n${appMarker}`);
    await expect
      .poll(async () => (await noteById(page, note.id))?.body, { timeout: 60_000 })
      .toContain(appMarker);

    // 2) The disk-side edit of the same note.
    const diskMarker = `DISK-CONFLICT-${Date.now()}`;
    const edited = editBodyOnDisk(file, diskMarker);

    // 3) One run with both sides changed.
    await navigateTo(page, "Sync Panel");
    await runSync(vault);

    const problem = vault.locator("li").filter({ hasText: "changed in the app AND on disk" });
    await expect(problem).toBeVisible({ timeout: 60_000 });
    await expect(problem).toContainText(path.basename(file));

    // Nothing was overwritten on either side.
    const onDisk = readFileSync(file, "utf8");
    expect(onDisk).toBe(edited);
    expect(onDisk).not.toContain(appMarker);
    const inApp = await noteById(page, note.id);
    expect(inApp?.body).toContain(appMarker);
    expect(inApp?.body).not.toContain(diskMarker);

    // The resolution is the user's call: keeping the app version rewrites the
    // file with the app's text.
    await problem.getByRole("button", { name: "Keep app version" }).click();
    await expect.poll(() => readFileSync(file, "utf8"), { timeout: 90_000 }).toContain(appMarker);
    expect(readFileSync(file, "utf8")).not.toContain(diskMarker);
    await expect(
      vault.locator("li").filter({ hasText: "changed in the app AND on disk" }),
    ).toHaveCount(0, { timeout: 60_000 });
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test(DELETED_TITLE, async () => {
  test.setTimeout(240_000);
  const dir = tempRoot();
  const app = await launchApp({ seed: "demo" });
  const { page } = app;
  try {
    const { vault, mirrorDir } = await bindVault(app, dir);
    const { note, file } = await noteToEdit(page, mirrorDir);

    // The user removed the file outside the app.
    rmSync(file, { force: true });
    expect(existsSync(file)).toBe(false);

    await runSync(vault);

    const problem = vault.locator("li").filter({ hasText: "deleted on disk" });
    await expect(problem).toBeVisible({ timeout: 60_000 });
    await expect(problem).toContainText(path.basename(file));

    // Reported, NOT re-created behind the user's back.
    expect(existsSync(file)).toBe(false);

    // Re-creating is the explicit answer, and it restores the entity's content.
    await problem.getByRole("button", { name: "Re-create file" }).click();
    await expect.poll(() => existsSync(file), { timeout: 90_000 }).toBe(true);
    expect(readFileSync(file, "utf8")).toContain(`msf_id: ${note.id}`);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
