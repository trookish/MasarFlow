import type { GraphKind } from "@/lib/colors";

/** The entity categories the graph can show. */
export type EntityCategory = "note" | "spec" | "task" | "system" | "commit";

export const ALL_CATEGORIES: readonly EntityCategory[] = ["note", "spec", "task", "system", "commit"];

export interface GraphNode {
  /** Unique across categories: `<category>:<id>`. */
  key: string;
  kind: GraphKind;
  category: EntityCategory;
  /** The entity's database id. */
  refId: string;
  label: string;
  tags: string[];
  /** Only notes live in folders. */
  folderId: string | null;
  /** Number of distinct neighbours in the whole project graph. */
  degree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  /** Best-effort relation name derived from the endpoint categories. */
  relation: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
