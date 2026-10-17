export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface Scored<T> {
  row: T;
  score: number;
}

/** Brute-force nearest neighbours: fine up to ~50k chunks (a few ms per 10k). */
export function topK<T extends { vector: Float32Array }>(
  query: Float32Array,
  rows: T[],
  k: number,
  minScore: number,
): Scored<T>[] {
  if (k <= 0) return [];
  const scored: Scored<T>[] = [];
  for (const row of rows) {
    const score = cosine(query, row.vector);
    if (score >= minScore) scored.push({ row, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, k);
}
