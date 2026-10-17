import { describe, it, expect } from "vitest";
import { createEmbedClient, type WorkerLike } from "@/lib/ai/embeddings/client";

/** A worker that echoes: vector = [text.length]. */
function fakeWorker(): WorkerLike {
  const w: WorkerLike = {
    onmessage: null,
    postMessage(msg: { id: number; type: string; texts?: string[] }) {
      queueMicrotask(() => {
        if (msg.type === "embed") w.onmessage?.({ data: { id: msg.id, ok: true, vectors: msg.texts!.map((t) => new Float32Array([t.length])) } });
        else w.onmessage?.({ data: { id: msg.id, ok: true, status: { state: "ready", dimensions: 384 } } });
      });
    },
    terminate() {},
  };
  return w;
}

describe("createEmbedClient", () => {
  it("resolves concurrent requests to the right callers", async () => {
    const c = createEmbedClient(() => fakeWorker());
    const [a, b] = await Promise.all([c.embed(["aa"]), c.embed(["bbbb", "c"])]);
    expect(Array.from(a[0])).toEqual([2]);
    expect(b.map((v) => v[0])).toEqual([4, 1]);
  });
  it("creates the worker lazily and only once", async () => {
    let created = 0;
    const c = createEmbedClient(() => (created++, fakeWorker()));
    expect(created).toBe(0);
    await c.embed(["x"]);
    await c.embed(["y"]);
    expect(created).toBe(1);
  });
  it("rejects when the worker reports an error", async () => {
    const bad: WorkerLike = {
      onmessage: null,
      postMessage(msg: { id: number }) {
        queueMicrotask(() => bad.onmessage?.({ data: { id: msg.id, ok: false, error: "boom" } }));
      },
      terminate() {},
    };
    await expect(createEmbedClient(() => bad).embed(["x"])).rejects.toThrow("boom");
  });
  it("exposes status", async () => {
    const c = createEmbedClient(() => fakeWorker());
    expect((await c.status()).state).toBe("ready");
  });
});
