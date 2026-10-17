"use client";

import { Suspense } from "react";
import { AgentsView } from "@/components/agents/agents-view";

export default function AgentsPage() {
  // AgentsView reads ?agent= via useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <AgentsView />
    </Suspense>
  );
}
