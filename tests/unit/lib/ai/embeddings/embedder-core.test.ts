import { describe, it, expect, vi } from "vitest";
import { createEmbedderCore, EMBED_DIMENSIONS } from "@/lib/ai/embeddings/embedder-core";

/** Fake extractor: returns a row-major [n, 3] tensor where each row = [len, 1, 0]. */
const fakeExtractor = vi.fn(async (texts: string[]) => ({
  data: Float32Array.from(texts.flatMap((t) => [t.length, 1, 0])),
  dims: [texts.length, 3],
}));

describe("createEmbedderCore", () => {
  it("loads the model once and splits the tensor into one vector per text", async () => {
    const load = vi.fn(async () => fakeExtractor);
    const core = createEmbedderCore(load, { batchSize: 2 });
    const out = await core.embed(["a", "bb", "ccc"]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(out).toHaveLength(3);
    expect(Array.from(out[2])).toEqual([3, 1, 0]);
    await core.embed(["d"]);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("batches", async () => {
    fakeExtractor.mockClear();
    const core = createEmbedderCore(async () => fakeExtractor, { batchSize: 2 });
    await core.embed(["a", "b", "c", "d", "e"]);
    expect(fakeExtractor).toHaveBeenCalledTimes(3);
  });
  it("returns [] for no input without loading the model", async () => {
    const load = vi.fn(async () => fakeExtractor);
    expect(await createEmbedderCore(load).embed([])).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });
  it("reports status", async () => {
    const core = createEmbedderCore(async () => fakeExtractor);
    expect(core.status()).toEqual({ state: "idle", dimensions: EMBED_DIMENSIONS });
    await core.embed(["x"]);
    expect(core.status().state).toBe("ready");
  });
  it("surfaces a load failure as an error status and retries on the next call", async () => {
    let n = 0;
    const core = createEmbedderCore(async () => {
      if (++n === 1) throw new Error("model missing");
      return fakeExtractor;
    });
    await expect(core.embed(["x"])).rejects.toThrow("model missing");
    expect(core.status()).toMatchObject({ state: "error", error: "model missing" });
    await expect(core.embed(["x"])).resolves.toHaveLength(1);
  });
});
