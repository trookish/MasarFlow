import { createGithubClient, githubErrorMessage } from "@/lib/server/github/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Issues proxy (POST only, like /api/github). The request body carries the PAT
 * the renderer already holds — the same local-only pattern as the commits
 * route — and P2's launch-token guard in src/proxy.ts protects the endpoint in
 * the packaged app.
 */

interface IssuesRequest {
  pat: string;
  owner: string;
  repo: string;
  action: "list" | "create" | "close";
  state?: "open" | "closed" | "all";
  labels?: string;
  perPage?: number;
  number?: number;
  title?: string;
  body?: string;
  comment?: string;
}

export async function POST(req: Request): Promise<Response> {
  let body: IssuesRequest;
  try {
    body = (await req.json()) as IssuesRequest;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { pat, owner, repo, action } = body;
  if (!pat) return Response.json({ error: "Missing personal access token" }, { status: 400 });
  if (!owner || !repo) return Response.json({ error: "Missing repository owner/name" }, { status: 400 });
  if (action !== "list" && action !== "create" && action !== "close") {
    return Response.json({ error: `Unknown action '${String(action)}'` }, { status: 400 });
  }

  const client = createGithubClient({ token: pat, owner, repo });
  try {
    if (action === "list") {
      const result = await client.listIssues({ state: body.state, labels: body.labels, perPage: body.perPage });
      return Response.json(result);
    }
    if (action === "create") {
      if (!body.title?.trim()) return Response.json({ error: "Missing issue title" }, { status: 400 });
      const issue = await client.createIssue({ title: body.title, body: body.body, labels: body.labels ? [body.labels] : undefined });
      return Response.json({ issue });
    }
    if (!body.number) return Response.json({ error: "Missing issue number" }, { status: 400 });
    const issue = await client.closeIssue(body.number, body.comment);
    return Response.json({ issue });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 502;
    return Response.json({ error: githubErrorMessage(e, owner, repo) }, { status });
  }
}
