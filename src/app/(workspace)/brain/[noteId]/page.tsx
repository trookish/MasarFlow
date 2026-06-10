"use client";
import { useParams } from "next/navigation";
import { NoteEditor } from "@/components/brain/note-editor";

export default function NotePage() {
  const params = useParams<{ noteId: string }>();
  return <NoteEditor noteId={params.noteId} />;
}
