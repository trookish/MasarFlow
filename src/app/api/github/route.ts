import { Octokit } from "octokit";

export async function POST(req: Request) {
  try {
    const { pat, owner, repo } = await req.json();

    if (!owner || !repo) {
      return new Response("Owner and repo required", { status: 400 });
    }

    const octokit = new Octokit({ auth: pat || undefined });

    const response = await octokit.rest.repos.listCommits({
      owner,
      repo,
      per_page: 30,
    });

    const commits = response.data.map((c) => ({
      hash: c.sha,
      message: c.commit.message,
      author: c.commit.author?.name || "Unknown",
      date: c.commit.author?.date ? new Date(c.commit.author.date).getTime() : Date.now(),
    }));

    return Response.json({ commits });
  } catch (error: unknown) {
    console.error("GitHub API Error:", error);
    return new Response(error instanceof Error ? error.message : "Internal Server Error", { status: 500 });
  }
}
