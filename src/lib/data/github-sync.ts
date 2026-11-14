import { getDb } from "../db/schema";
import { useGithub } from "../stores/github";

export async function syncGithubCommits(projectId: string) {
  const { pat, repoOwner, repoName } = useGithub.getState();
  
  if (!repoOwner || !repoName) {
    throw new Error("GitHub repository not configured in Settings.");
  }

  const res = await fetch("/api/github", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pat, owner: repoOwner, repo: repoName }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API Error: ${text}`);
  }

  const { commits } = await res.json();
  const db = getDb();

  let newCount = 0;
  for (const c of commits) {
    const existing = await db.commits.where("hash").equals(c.hash).first();
    if (!existing) {
      await db.commits.add({
        id: crypto.randomUUID(),
        projectId,
        hash: c.hash,
        message: c.message,
        author: c.author,
        date: c.date,
        files: [],
        aiSummary: null,
      });
      newCount++;
    }
  }

  return newCount;
}
