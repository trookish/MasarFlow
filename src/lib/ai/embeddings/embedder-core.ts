export const EMBED_MODEL_ID = "Xenova/all-MiniLM-L6-v2";
export const EMBED_DIMENSIONS = 384;

export type Extractor = (
  texts: string[],
  opts: { pooling: "mean"; normalize: true },
) => Promise<{ data: Float32Array; dims: number[] }>;

export interface EmbedderStatus {
  state: "idle" | "loading" | "ready" | "error";
  dimensions: number;
  error?: string;
}

export interface EmbedderCore {
  embed(texts: string[]): Promise<Float32Array[]>;
  status(): EmbedderStatus;
}

/** Pure orchestration around a lazily-loaded extractor; the worker supplies the real one. */
export function createEmbedderCore(load: () => Promise<Extractor>, opts: { batchSize?: number } = {}): EmbedderCore {
  const batchSize = opts.batchSize ?? 16;
  let extractor: Promise<Extractor> | null = null;
  let status: EmbedderStatus = { state: "idle", dimensions: EMBED_DIMENSIONS };

  const ensure = (): Promise<Extractor> => {
    if (!extractor) {
      status = { state: "loading", dimensions: EMBED_DIMENSIONS };
      extractor = load().then(
        (ex) => {
          status = { state: "ready", dimensions: EMBED_DIMENSIONS };
          return ex;
        },
        (err) => {
          extractor = null;
          status = { state: "error", dimensions: EMBED_DIMENSIONS, error: err instanceof Error ? err.message : String(err) };
          throw err;
        },
      );
    }
    return extractor;
  };

  return {
    status: () => status,
    async embed(texts) {
      if (texts.length === 0) return [];
      const ex = await ensure();
      const out: Float32Array[] = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const tensor = await ex(batch, { pooling: "mean", normalize: true });
        const dim = tensor.dims[1];
        for (let r = 0; r < batch.length; r++) out.push(tensor.data.slice(r * dim, (r + 1) * dim));
      }
      return out;
    },
  };
}
