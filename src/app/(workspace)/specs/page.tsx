"use client";

import { Suspense } from "react";
import { SpecsView } from "@/components/specs/specs-view";

export default function SpecsPage() {
  return (
    <Suspense fallback={null}>
      <SpecsView />
    </Suspense>
  );
}
