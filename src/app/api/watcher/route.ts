import chokidar from "chokidar";
import path from "path";

// Keep a global watcher so we don't spawn multiple instances on fast refreshes
let watcher: ReturnType<typeof chokidar.watch> | null = null;

export async function GET(req: Request) {
  const encoder = new TextEncoder();
  const targetDir = path.resolve(process.cwd(), "Assets");

  const stream = new ReadableStream({
    start(controller) {
      if (!watcher) {
        // Watch the local 'Assets' directory
        watcher = chokidar.watch(targetDir, {
          ignored: /(^|[\/\\])\../, // ignore dotfiles
          persistent: true,
          ignoreInitial: false,
        });
      }

      const sendEvent = (event: string, filePath: string) => {
        // We only care about unity files and scripts for the dashboard
        if (!/\.(unity|cs|prefab|asset|mat)$/i.test(filePath)) return;

        const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
        const fileName = path.basename(filePath);
        
        let type = "other";
        if (fileName.endsWith(".unity")) type = "scene";
        else if (fileName.endsWith(".prefab")) type = "prefab";
        else if (fileName.endsWith(".cs")) type = "script";
        else if (fileName.endsWith(".asset")) type = "so";
        else if (fileName.endsWith(".mat")) type = "material";

        const payload = {
          event,
          asset: {
            id: Buffer.from(relativePath).toString("base64"),
            name: fileName,
            path: relativePath,
            type,
            modifiedAt: Date.now(),
          }
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      const onChange = (p: string) => sendEvent("change", p);
      const onAdd = (p: string) => sendEvent("add", p);

      watcher.on("change", onChange);
      watcher.on("add", onAdd);

      // Clean up when the client disconnects
      req.signal.addEventListener("abort", () => {
        if (watcher) {
          watcher.off("change", onChange);
          watcher.off("add", onAdd);
        }
      });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
