"use client";

import { Suspense } from "react";
import { StandardsView } from "@/components/standards/standards-view";

export default function StandardsPage() {
  return (
    <Suspense fallback={null}>
      <StandardsView />
    </Suspense>
  );
}
