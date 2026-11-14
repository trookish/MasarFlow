/**
 * P9.T18 — matrix sweep for /git on the PACKAGED app (6 titles).
 *
 * Every title is the exact string in tests/e2e/feature-matrix.json.
 *
 * The repository is real: a temp git repo built by this spec (one commit, one
 * unstaged edit, one untracked file), linked to the project through the real UI
 * (harness `linkFolder`). Assertions read git back from disk, so "the panel
 * said so" is never the evidence.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test as base, type Locator } from "@playwright/test";
import { expect, launchApp, linkFolder, navigateTo, type AppHandle } from "./_harness";

const test = base.extend<object, { desktop: AppHandle }>({
  desktop: [
    async ({}, provide) => {
      const handle = await launchApp({ seed: "demo" });
      await provide(handle);
      await handle.close();
    },
    { scope: "worker" },
  ],
});

const STATUS_TITLE = "/git: status groups render staged and unstaged files";
const STAGE_TITLE = "/git: stage and unstage a file";
const EMPTY_COMMIT_TITLE = "/git: commit box rejects an empty message";
const LOG_TITLE = "/git: commit log lists commits with detail";
const BRANCH_TITLE = "/git: branch menu creates a branch";
const GITHUB_TITLE = "/git: GitHub section shows the not-configured notice";

/** A real repository: one commit, one modified file, one untracked file. */
const REPO = mkdtempSync(path.join(os.tmpdir(), "msf-git-repo-"));

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
}

git(["init"]);
git(["config", "user.email", "e2e@masarflow.test"]);
git(["config", "user.name", "MasarFlow E2E"]);
writeFileSync(path.join(REPO, "README.md"), "# e2e repo\n");
git(["add", "README.md"]);
git(["commit", "-m", "chore: initial commit"]);
writeFileSync(path.join(REPO, "README.md"), "# e2e repo\n\nsecond line\n");
writeFileSync(path.join(REPO, "notes.txt"), "scratch\n");

const BRANCH = git(["rev-parse", "--abbrev-ref", "HEAD"]);
const PANEL = '[data-testid="dock-panel"]:is([data-dock-url="/system"],[data-dock-url^="/system?"])';

/**
 * `git status --porcelain`, as a lookup of path -> code pair.
 *
 * Reads the raw output: porcelain's first column is a space for an unstaged
 * change, and trimming the whole string would eat it — the first row's path
 * would lose its first letter (" M README.md" -> key "EADME.md").
 */
function porcelain(): Map<string, string> {
  const raw = execFileSync("git", ["status", "--porcelain"], { cwd: REPO, encoding: "utf8" });
  const rows = raw.split("\n").filter((row) => row.trim() !== "");
  return new Map(rows.map((r) => [r.slice(3).trim(), r.slice(0, 2)]));
}

/**
 * Activate a control from the keyboard.
 *
 * Kept from the old docked shell: a centre click could be intercepted by an
 * overlay, so keyboard activation exercises the same control through the path
 * a keyboard-first user takes. In the 0.2 tabs shell nothing overlays the
 * content, but the path is still the honest one for these controls.
 */
async function activate(button: Locator): Promise<void> {
  await button.press("Enter");
}

test.beforeEach(async ({ desktop }) => {
  await linkFolder(desktop.page, desktop, REPO);
});

/**
 * Reset the index between tests. EMPTY_COMMIT stages the fixture's changes and
 * leaves them staged; without this the next test starts with an empty
 * "Changes" group (whose "Stage all" button is legitimately absent), not the
 * fixture state: README.md modified+unstaged, notes.txt untracked.
 */
test.afterEach(() => {
  git(["reset", "-q"]);
});

test(STATUS_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Git");
  const panel = page.locator(PANEL);

  // The header names the real folder and branch.
  await expect(panel.getByText(REPO).first()).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByRole("button", { name: BRANCH })).toBeVisible();

  // Groups come from `git status`, not from a fixture.
  await expect(panel.getByRole("heading", { name: "Staged (0)" })).toBeVisible();
  const changes = panel.locator("section").filter({ has: page.getByRole("heading", { name: "Changes (1)" }) });
  await expect(changes.getByText("README.md")).toBeVisible();
  const untracked = panel.locator("section").filter({ has: page.getByRole("heading", { name: /Untracked \(1\)/ }) });
  await expect(untracked.getByText("notes.txt")).toBeVisible();
  await expect(panel.getByText(/1 modified/)).toBeVisible();
  await expect(panel.getByText(/1 untracked/)).toBeVisible();

  // ...and the same status on disk.
  const rows = porcelain();
  expect(rows.get("README.md")).toBe(" M");
  expect(rows.get("notes.txt")).toBe("??");
});

test(STAGE_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Git");
  const panel = page.locator(PANEL);
  const changes = panel.locator("section").filter({ has: page.getByRole("heading", { name: /^Changes \(/ }) });

  await changes.getByTitle("Stage").click();
  await expect(panel.getByRole("heading", { name: "Staged (1)" })).toBeVisible({ timeout: 15_000 });
  const staged = panel.locator("section").filter({ has: page.getByRole("heading", { name: /^Staged \(/ }) });
  await expect(staged.getByText("README.md")).toBeVisible();
  expect(porcelain().get("README.md")).toBe("M "); // staged, per git itself

  await staged.getByTitle("Unstage").click();
  await expect(panel.getByRole("heading", { name: "Changes (1)" })).toBeVisible({ timeout: 15_000 });
  expect(porcelain().get("README.md")).toBe(" M");
});

test(EMPTY_COMMIT_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Git");
  const panel = page.locator(PANEL);
  const commitButton = panel.getByRole("button", { name: /^Commit \d+ file/ });

  // Nothing staged: the box refuses to even try, and says why.
  await expect(commitButton).toBeDisabled();
  await expect(panel.getByText("Stage something first.")).toBeVisible();

  const changes = panel.locator("section").filter({ has: page.getByRole("heading", { name: /^Changes \(/ }) });
  await changes.getByRole("button", { name: "Stage all" }).click();
  await expect(commitButton).toBeEnabled({ timeout: 15_000 });

  const before = git(["rev-list", "--count", "HEAD"]);
  await activate(commitButton);
  await expect(panel.getByText("Write a commit message first.")).toBeVisible();
  expect(git(["rev-list", "--count", "HEAD"])).toBe(before); // nothing was committed

  // Leave the fixture as the next test expects to find it: README.md modified
  // and unstaged. Unstaging through the UI (not just `git reset`) keeps the
  // panel's status fresh for the tests that follow.
  const staged = panel.locator("section").filter({ has: page.getByRole("heading", { name: /^Staged \(/ }) });
  await staged.getByRole("button", { name: "Unstage all" }).click();
  await expect(panel.getByRole("heading", { name: "Changes (1)" })).toBeVisible({ timeout: 15_000 });
});

test(LOG_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Git");
  const panel = page.locator(PANEL);
  const message = "test(e2e): commit from the panel";

  await expect(panel.getByRole("heading", { name: "History" })).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByText("chore: initial commit")).toBeVisible();

  const changes = panel.locator("section").filter({ has: page.getByRole("heading", { name: /^Changes \(/ }) });
  await changes.getByRole("button", { name: "Stage all" }).click();
  await panel.getByPlaceholder(/feat\(scope\): summary/).fill(message);
  await activate(panel.getByRole("button", { name: /^Commit 1 file/ }));

  await expect(panel.getByText(/committed [0-9a-f]{7} — link it to a task from the log/)).toBeVisible({
    timeout: 20_000,
  });
  // The commit is real, and the log lists it with its detail.
  expect(git(["log", "-1", "--pretty=%s"])).toBe(message);
  const sha = git(["rev-parse", "HEAD"]);
  const entry = panel.getByRole("button", { name: new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
  await expect(entry).toBeVisible({ timeout: 20_000 });
  await entry.click();
  await expect(panel.getByText(sha)).toBeVisible();
  await expect(panel.getByText("Link to task…")).toBeVisible();
});

test(BRANCH_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Git");
  const panel = page.locator(PANEL);

  await panel.getByRole("button", { name: BRANCH }).click();
  const name = panel.getByPlaceholder("feat/new-branch");
  await expect(name).toBeVisible({ timeout: 15_000 });
  await name.fill("feat/e2e-branch");
  await panel.getByRole("button", { name: "Create branch" }).click();

  await expect(panel.getByRole("button", { name: "feat/e2e-branch" })).toBeVisible({ timeout: 20_000 });
  expect(git(["branch", "--show-current"])).toBe("feat/e2e-branch");
  // Both branches are listed, with the new one checked out.
  await panel.getByRole("button", { name: "feat/e2e-branch" }).click();
  await expect(panel.getByText(BRANCH, { exact: true })).toBeVisible();
});

test(GITHUB_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Git");
  const panel = page.locator(PANEL);
  // With no token/owner/repo saved the section shows the recovery notice
  // instead of its controls (the "GitHub" heading only renders once configured).
  await expect(
    panel.getByText("GitHub is not configured. Add a token, owner and repository in Settings."),
  ).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByRole("button", { name: "Sync to tasks" })).toHaveCount(0);
});
