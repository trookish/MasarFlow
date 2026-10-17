/// <reference lib="webworker" />
import { env, pipeline } from "@huggingface/transformers";
import { EMBED_MODEL_ID, createEmbedderCore, type Extractor } from "./embedder-core";
import type { WorkerRequest, WorkerResponse } from "./client";

// Fully offline: the model and the ONNX WASM runtime are served from /public (copied into the app
// bundle by `pnpm assets:embeddings`). Spike S3 measured this exact configuration under the app
// CSP: zero violations, ~83 ms per 840-char chunk.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "/models/";
if (env.backends.onnx.wasm) {
  // A string (not the object form) so ORT never uses the blob: worker preload, which the CSP blocks.
  env.backends.onnx.wasm.wasmPaths = "/ort/";
  env.backends.onnx.wasm.numThreads = 1; // no cross-origin isolation => no SharedArrayBuffer
}

const core = createEmbedderCore(
  async () => (await pipeline("feature-extraction", EMBED_MODEL_ID, { dtype: "q8", device: "wasm" })) as unknown as Extractor,
);

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(msg: WorkerResponse, transfer?: Transferable[]): void;
};

ctx.onmessage = async (e) => {
  const req = e.data;
  try {
    if (req.type === "embed") {
      const vectors = await core.embed(req.texts);
      ctx.postMessage({ id: req.id, ok: true, vectors }, vectors.map((v) => v.buffer));
    } else {
      ctx.postMessage({ id: req.id, ok: true, status: core.status() });
    }
  } catch (err) {
    ctx.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
