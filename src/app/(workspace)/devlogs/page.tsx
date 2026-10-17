"use client";

import { Suspense } from "react";
import { DevLogsView } from "@/components/devlogs/devlogs-view";

export default function DevLogsPage() {
  // DevLogsView reads ?devlog= via useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <DevLogsView />
    </Suspense>
  );
}
