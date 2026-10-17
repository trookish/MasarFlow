"use client";

import { Suspense } from "react";
import { SprintsView } from "@/components/sprints/sprints-view";

export default function SprintsPage() {
  // SprintsView reads ?sprint= via useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <SprintsView />
    </Suspense>
  );
}
