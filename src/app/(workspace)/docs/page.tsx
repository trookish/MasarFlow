"use client";

import { Suspense } from "react";
import { DocsView } from "@/components/docs/docs-view";

export default function DocsPage() {
  // DocsView reads ?doc= via useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <DocsView />
    </Suspense>
  );
}
