/**
 * Minimal Obsidian Local REST API stub for the packaged specs (P7 /files).
 *
 * The app talks to Obsidian through the real /api/obsidian proxy; pointing that
 * proxy at this loopback server exercises the real path (listing → binary read →
 * attachment rows → /files) without Obsidian installed. Deterministic and
 * offline, like _stub-provider.ts.
 *
 * Routes (the shapes listVaultFiles/readBinaryFromObsidian expect):
 *   GET /                       → { authenticated: true }
 *   GET /vault/                 → { files: ["attachments/"] }
 *   GET /vault/attachments/     → { files: ["diagram.png", "screen-shot.png"] }
 *   GET /vault/attachments/*.png → raw PNG bytes
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface ObsidianStub {
  /** Pass as the Server URL in the sync view (loopback, as the proxy requires). */
  baseUrl: string;
  /** Any non-empty string works: the proxy forwards it as a Bearer token. */
  apiKey: string;
  /** Every path the stub has been asked for, in arrival order. */
  paths: string[];
  stop(): Promise<void>;
}

/** A 1×1 transparent PNG — real bytes so the binary read path is exercised. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const live = new Set<Server>();

export async function startObsidianStub(): Promise<ObsidianStub> {
  const paths: string[] = [];
  const server = createServer((req, res) => {
    req.resume(); // no request bodies here; drain so keep-alive sockets stay usable
    const path = decodeURI((req.url ?? "").split("?")[0]);
    paths.push(path);
    const json = (body: unknown): void => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (path === "/" || path === "") return json({ authenticated: true, service: "stub" });
    if (path === "/vault/") return json({ files: ["attachments/"] });
    if (path === "/vault/attachments/") {
      return json({ files: ["diagram.png", "screen-shot.png"] });
    }
    if (path.startsWith("/vault/attachments/") && path.endsWith(".png")) {
      res.writeHead(200, { "content-type": "image/png", "content-length": String(PNG.length) });
      res.end(PNG);
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `stub obsidian: no route ${path}` }));
  });
  server.on("clientError", (_err, socket) => socket.destroy());

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  live.add(server);
  const port = (server.address() as AddressInfo).port;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    apiKey: "stub-obsidian-key",
    paths,
    stop: async () => {
      if (!live.delete(server)) return;
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** Closes every stub still listening — call from `test.afterAll`. */
export async function stopAllObsidianStubs(): Promise<void> {
  for (const server of [...live]) {
    live.delete(server);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
