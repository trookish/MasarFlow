"use client";

import { Suspense } from "react";
import { ChatView } from "@/components/chat/chat-view";

export default function ChatPage() {
  // ChatView reads ?thread= via useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <ChatView />
    </Suspense>
  );
}
