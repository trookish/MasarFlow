"use client";

import { Suspense } from "react";
import { ArchitectureView } from "@/components/architecture/architecture-view";

export default function ArchitecturePage() {
  return (
    <Suspense fallback={null}>
      <ArchitectureView />
    </Suspense>
  );
}
