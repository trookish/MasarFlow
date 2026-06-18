"use client";

import { Suspense } from "react";
import { NotesView } from "@/components/brain/notes-view";

export default function BrainNotesPage() {
  return (
    <Suspense fallback={null}>
      <NotesView />
    </Suspense>
  );
}
