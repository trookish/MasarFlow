import type { EmbedderStatus } from "./embedder-core";

export interface WorkerLike {
  onmessage: ((e: { data: WorkerResponse }) => void) | null;
  postMessage(msg: WorkerRequest): void;
  terminate(): void;
}

export type WorkerRequest = { id: number; type: "embed"; texts: string[] } | { id: number; type: "status" };
export type WorkerResponse =
  | { id: number; ok: true; vectors?: Float32Array[]; status?: EmbedderStatus }
  | { id: number; ok: false; error: string };

export interface EmbedClient {
  embed(texts: string[]): Promise<Float32Array[]>;
  status(): Promise<EmbedderStatus>;
}

export function createEmbedClient(makeWorker: () => WorkerLike): EmbedClient {
  let worker: WorkerLike | null = null;
  let nextId = 1;
  type Ok = Extract<WorkerResponse, { ok: true }>;
  type CallArgs = { type: "embed"; texts: string[] } | { type: "status" };
  const pending = new Map<number, { resolve: (r: Ok) => void; reject: (e: Error) => void }>();

  const ensure = (): WorkerLike => {
    if (worker) return worker;
    worker = makeWorker();
    worker.onmessage = (e) => {
      const msg = e.data;
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg);
      else p.reject(new Error(msg.error));
    };
    return worker;
  };

  const call = (req: CallArgs): Promise<Ok> =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ensure().postMessage({ ...req, id } as WorkerRequest);
    });

  return {
    async embed(texts) {
      if (texts.length === 0) return [];
      return (await call({ type: "embed", texts })).vectors ?? [];
    },
    async status() {
      return (await call({ type: "status" })).status ?? { state: "idle", dimensions: 384 };
    },
  };
}

let shared: EmbedClient | null = null;

/** App-wide client backed by the real module worker (browser only). */
export function getEmbedClient(): EmbedClient {
  shared ??= createEmbedClient(
    () => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike,
  );
  return shared;
}
