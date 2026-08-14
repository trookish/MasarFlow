"use client";

import { Suspense } from "react";
import { KnowledgeGraph } from "@/components/brain/knowledge-graph";

export default function BrainGraphPage() {
  // KnowledgeGraph reads ?categories= via useSearchParams, which requires a
  // Suspense boundary during prerender. Notes are shown by default — the
  // category toggles expose specs, tasks, systems, and commits.
  return (
    <Suspense fallback={null}>
      <KnowledgeGraph initialCategories={["note"]} />
    </Suspense>
  );
}
