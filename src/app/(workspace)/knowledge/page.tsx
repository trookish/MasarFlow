"use client";

import { Suspense } from "react";
import { KnowledgeGraph } from "@/components/brain/knowledge-graph";

export default function KnowledgePage() {
  // KnowledgeGraph reads ?categories= via useSearchParams, which requires a
  // Suspense boundary during prerender.
  return (
    <Suspense fallback={null}>
      <KnowledgeGraph />
    </Suspense>
  );
}
