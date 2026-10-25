import type { EmbedderStatus } from "./embedder-core";

/**
 * What the search surface tells the user about its results (v0.3 P4 T7, fixes audit A9). Results
 * are never labelled semantic unless the vector index actually answered the query.
 */
export type SearchMode = "keyword" | "fuzzy" | "semantic" | "hybrid";

export interface SearchStatusInput {
  embedder: EmbedderStatus["state"];
  mode: SearchMode;
  /** chunks embedded so far in the current index run, and the run's total */
  progress?: { done: number; total: number } | null;
  /** the vector index answered the current query */
  semanticAnswered: boolean;
}

export interface SearchStatus {
  /** short line for the index state */
  index: string;
  /** heading for the result list */
  results: string;
  /** the result list comes from keyword matching although the user asked for semantic search */
  fallback: boolean;
}

export function searchStatus({
  embedder,
  mode,
  progress,
  semanticAnswered,
}: SearchStatusInput): SearchStatus {
  const building =
    progress && progress.total > 0 && progress.done < progress.total;
  const index =
    embedder === "error"
      ? "Semantic index unavailable"
      : building
        ? `Semantic index building (${progress.done} of ${progress.total})`
        : embedder === "ready"
          ? "Semantic index ready"
          : "Semantic model loading";

  const wantsSemantic = mode === "semantic" || mode === "hybrid";
  if (!wantsSemantic)
    return {
      index,
      results: mode === "keyword" ? "Keyword results" : "Fuzzy results",
      fallback: false,
    };
  if (!semanticAnswered)
    return { index, results: "Keyword results", fallback: true };
  return {
    index,
    results:
      mode === "hybrid" ? "Semantic and keyword results" : "Semantic results",
    fallback: false,
  };
}
