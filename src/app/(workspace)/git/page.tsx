"use client";

import { Suspense } from "react";
import { GitView } from "@/components/git/git-view";

export default function GitPage() {
  return (
    <Suspense fallback={null}>
      <GitView />
    </Suspense>
  );
}
