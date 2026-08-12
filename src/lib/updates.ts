import pkg from "../../package.json";

/** The installed app version (kept in sync with package.json). */
export const APP_VERSION: string = pkg.version;

/** The GitHub repository the update check targets. */
export const UPDATE_REPO = "trookish/MasarFlow";

/** Latest commit on the MasarFlow repo's default branch. */
export interface UpdateCommitInfo {
  sha: string;
  message: string;
  date: string;
}

/** Result of a GitHub update check (releases + commits). */
export interface UpdateInfo {
  currentVersion: string;
  /** Latest published release version (tag without the v prefix). */
  latestVersion: string;
  latestTag: string;
  updateAvailable: boolean;
  releaseUrl: string;
  releaseName: string;
  releaseNotes: string;
  publishedAt: string | null;
  latestCommit: UpdateCommitInfo | null;
  error?: string;
}

/** Parse "v0.1.3.1" / "0.1.3-1" into comparable numeric segments. */
export function normalizeVersion(v: string): number[] {
  return v
    .trim()
    .replace(/^v/i, "")
    .replace(/-/g, ".")
    .split(".")
    .map((s) => parseInt(s, 10) || 0);
}

/** True when version `a` is newer than `b` (segment-wise, zero-padded). */
export function isNewerVersion(a: string, b: string): boolean {
  const A = normalizeVersion(a);
  const B = normalizeVersion(b);
  const len = Math.max(A.length, B.length);
  for (let i = 0; i < len; i++) {
    const x = A[i] ?? 0;
    const y = B[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GitHub API responded ${res.status}`);
  return res.json();
}

/** Compare the installed version against GitHub releases and commits. */
export async function fetchUpdateInfo(): Promise<UpdateInfo> {
  try {
    const [release, commits] = (await Promise.all([
      fetchJson(
        `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`,
      ),
      fetchJson(`https://api.github.com/repos/${UPDATE_REPO}/commits?per_page=1`),
    ])) as [
      {
        tag_name?: string;
        name?: string;
        body?: string;
        html_url?: string;
        published_at?: string;
      },
      Array<{
        sha?: string;
        commit?: { message?: string; author?: { date?: string } };
      }>,
    ];

    const latestTag = String(release.tag_name ?? "");
    const latestVersion = latestTag.replace(/^v/i, "");
    const head = commits[0];
    const latestCommit = head
      ? {
          sha: String(head.sha ?? "").slice(0, 7),
          message: String(head.commit?.message ?? "").split("\n")[0],
          date: String(head.commit?.author?.date ?? ""),
        }
      : null;

    return {
      currentVersion: APP_VERSION,
      latestVersion,
      latestTag,
      updateAvailable: isNewerVersion(latestVersion, APP_VERSION),
      releaseUrl:
        String(release.html_url ?? "") ||
        `https://github.com/${UPDATE_REPO}/releases`,
      releaseName: String(release.name ?? (latestTag || "Latest release")),
      releaseNotes: String(release.body ?? ""),
      publishedAt: release.published_at ?? null,
      latestCommit,
    };
  } catch (e) {
    return {
      currentVersion: APP_VERSION,
      latestVersion: "",
      latestTag: "",
      updateAvailable: false,
      releaseUrl: "",
      releaseName: "",
      releaseNotes: "",
      publishedAt: null,
      latestCommit: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
