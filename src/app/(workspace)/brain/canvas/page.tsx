"use client";

import { Suspense } from "react";
import { CanvasBoard } from "@/components/canvas/canvas-board";

export default function BrainCanvasPage() {
  return (
    <Suspense fallback={null}>
      <CanvasBoard />
    </Suspense>
  );
}
