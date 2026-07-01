/**
 * Browser-side helpers for talking to the Obsidian Local REST API. Every call
 * goes through the /api/obsidian proxy (the plugin's self-signed cert and
 * loopback binding make direct browser requests impossible).
 */

export interface ObsidianConn {
  baseUrl: string;
  apiKey: string;
}

/**
 * MasarFlow confines all of its files to this vault subfolder so it never
 * touches the rest of the user's vault. Imported files preserve their
 * original vault path; new entities get a default subfolder.
 */
export const VAULT_SUBFOLDER = "MasarFlow";

interface ProxyResult {
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
}

async function proxy(
  conn: ObsidianConn,
  method: string,
  path: string,
  opts: { content?: string; contentType?: string; accept?: string; binary?: boolean } = {},
): Promise<ProxyResult> {
  try {
    const res = await fetch("/api/obsidian", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: conn.baseUrl,
        apiKey: conn.apiKey,
        method,
        path,
        content: opts.content,
        contentType: opts.contentType,
        accept: opts.accept,
        binary: opts.binary ?? false,
      }),
    });
    return (await res.json()) as ProxyResult;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Verify the base URL + API key reach a running, *authenticated* Obsidian REST
 * API. The root `/` returns 200 even without a valid key, reporting
 * `authenticated: false` — so we check that flag, not just the status code.
 */
export async function testObsidianConnection(
  conn: ObsidianConn,
): Promise<{ ok: boolean; message: string }> {
  if (!conn.baseUrl) return { ok: false, message: "Enter the server URL first." };
  if (!conn.apiKey) return { ok: false, message: "Enter your API key first." };
  const r = await proxy(conn, "GET", "/");
  if (r.error)
    return {
      ok: false,
      message: `Couldn't reach Obsidian (${r.error}). Is Obsidian open with the Local REST API plugin enabled?`,
    };
  if (r.status === 401)
    return { ok: false, message: "Unauthorized — double-check the API key." };
  if (!r.ok) return { ok: false, message: `Obsidian returned status ${r.status}.` };
  // 200: confirm the key was actually accepted.
  try {
    const info = JSON.parse(r.body ?? "{}") as { authenticated?: boolean };
    if (info.authenticated)
      return { ok: true, message: "Connected to your Obsidian vault." };
    return {
      ok: false,
      message: "Reached Obsidian, but the API key was rejected.",
    };
  } catch {
    return { ok: true, message: "Connected to your Obsidian vault." };
  }
}

/** Create or overwrite a text vault file at `path` (vault-relative). */
export async function pushFileToObsidian(
  conn: ObsidianConn,
  path: string,
  content: string,
  contentType = "text/markdown",
): Promise<ProxyResult> {
  return proxy(conn, "PUT", `/vault/${encodePath(path)}`, {
    content,
    contentType,
  });
}

/**
 * Push a binary file (image, audio, video, PDF) to the vault.
 * The data is transported as base64 through the JSON proxy.
 */
export async function pushBinaryToObsidian(
  conn: ObsidianConn,
  path: string,
  base64: string,
  contentType: string,
): Promise<ProxyResult> {
  return proxy(conn, "PUT", `/vault/${encodePath(path)}`, {
    content: base64,
    contentType,
    accept: "application/json",
    binary: true,
  } as Parameters<typeof proxy>[3] & { binary: boolean });
}

/**
 * Read a vault file's raw text content. `found` is false on 404 (file not in
 * the vault yet), distinct from a transport error (`ok: false`).
 */
export async function readFileFromObsidian(
  conn: ObsidianConn,
  path: string,
  accept = "text/markdown",
): Promise<{ ok: boolean; found: boolean; content: string; error?: string }> {
  const r = await proxy(conn, "GET", `/vault/${encodePath(path)}`, {
    accept,
  });
  if (r.status === 404) return { ok: true, found: false, content: "" };
  if (r.ok) return { ok: true, found: true, content: r.body ?? "" };
  return { ok: false, found: false, content: "", error: r.error ?? `status ${r.status}` };
}

/**
 * Read a binary vault file as base64. Returns null content on 404.
 */
export async function readBinaryFromObsidian(
  conn: ObsidianConn,
  path: string,
): Promise<{ ok: boolean; found: boolean; base64: string; error?: string }> {
  const r = await proxy(conn, "GET", `/vault/${encodePath(path)}`, {
    accept: "application/octet-stream",
    binary: true,
  } as Parameters<typeof proxy>[3] & { binary: boolean });
  if (r.status === 404) return { ok: true, found: false, base64: "" };
  if (r.ok) return { ok: true, found: true, base64: r.body ?? "" };
  return { ok: false, found: false, base64: "", error: r.error ?? `status ${r.status}` };
}

/**
 * Recursively list files under `root` (vault-relative, e.g. "MasarFlow/").
 * Folder entries end in "/". A missing root folder yields an empty list.
 */
export async function listVaultFiles(
  conn: ObsidianConn,
  root = "",
): Promise<{ ok: boolean; files: string[]; error?: string }> {
  const files: string[] = [];

  async function walk(dir: string): Promise<string | null> {
    const r = await proxy(conn, "GET", `/vault/${encodePath(dir)}`, {
      accept: "application/json",
    });
    if (!r.ok) {
      // A missing folder simply has no files to import.
      if (r.status === 404) return null;
      return r.error ?? `status ${r.status}`;
    }
    let data: { files?: string[] };
    try {
      data = JSON.parse(r.body ?? "{}") as { files?: string[] };
    } catch {
      return "Unexpected listing response from Obsidian.";
    }
    for (const name of data.files ?? []) {
      const full = `${dir}${name}`;
      if (name.endsWith("/")) {
        const err = await walk(full);
        if (err) return err;
      } else {
        files.push(full);
      }
    }
    return null;
  }

  const error = await walk(root);
  return { ok: error == null, files, error: error ?? undefined };
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}
