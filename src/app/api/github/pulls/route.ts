import { createGithubClient, githubErrorMessage } from "@/lib/server/github/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pull requests + latest check-run status for each (POST only, PAT in the body). */

interface PullsRequest {
  pat: string;
  owner: string;
  repo: string;
  action: "list";
  state?: "open" | "closed" | "all";
  perPage?: number;
  checkLimit?: number;
}

export async function POST(req: Request): Promise<Response> {
  let body: PullsRequest;
  try {
    body = (await req.json()) as PullsRequest;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { pat, owner, repo, action } = body;
  if (!pat) return Response.json({ error: "Missing personal access token" }, { status: 400 });
  if (!owner || !repo) return Response.json({ error: "Missing repository owner/name" }, { status: 400 });
  if (action !== "list") return Response.json({ error: `Unknown action '${String(action)}'` }, { status: 400 });

  try {
    const client = createGithubClient({ token: pat, owner, repo });
    const pulls = await client.listPulls({ state: body.state, perPage: body.perPage, checkLimit: body.checkLimit });
    return Response.json({ pulls });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 502;
    return Response.json({ error: githubErrorMessage(e, owner, repo) }, { status });
  }
}
