import type { ChatMessage, ChatThread } from "@/lib/db/schema";

/** The link a side chat keeps to the main thread it branched from. */
export type SideLink = NonNullable<ChatThread["sideOf"]>;

export function isSideThread(
  thread: Pick<ChatThread, "sideOf"> | null | undefined,
): boolean {
  return Boolean(thread?.sideOf);
}

/** Link a new side chat to `message` in `main`. Side chats do not nest. */
export function sideLinkFor(
  main: Pick<ChatThread, "id" | "sideOf">,
  message: Pick<ChatMessage, "id" | "createdAt">,
): SideLink | null {
  if (main.sideOf) return null;
  return {
    threadId: main.id,
    messageId: message.id,
    messageCreatedAt: message.createdAt,
  };
}

/** Title for a new side chat, from the message it branches at. */
export function sideThreadTitle(
  message: Pick<ChatMessage, "content">,
  max = 40,
): string {
  const text = message.content.replace(/\s+/g, " ").trim();
  if (!text) return "Side chat";
  return `Side chat: ${text.length > max ? `${text.slice(0, max)}…` : text}`;
}

/**
 * The main thread's messages a side chat inherits: everything up to and
 * including the branch message. Falls back to the creation time when the
 * branch message has since been deleted.
 */
export function inheritedMessages(
  mainMessages: readonly ChatMessage[],
  link: SideLink,
): ChatMessage[] {
  const idx = mainMessages.findIndex((m) => m.id === link.messageId);
  if (idx >= 0) return mainMessages.slice(0, idx + 1);
  return mainMessages.filter((m) => m.createdAt <= link.messageCreatedAt);
}

/**
 * Messages sent to the model for a turn: for a side chat the inherited main
 * context followed by the side chat's own messages; otherwise the thread's own.
 * The inherited messages are read-only here — they are never written anywhere.
 */
export function turnContextMessages(
  thread: Pick<ChatThread, "sideOf"> | null,
  ownMessages: readonly ChatMessage[],
  mainMessages: readonly ChatMessage[],
): ChatMessage[] {
  if (!thread?.sideOf) return [...ownMessages];
  return [...inheritedMessages(mainMessages, thread.sideOf), ...ownMessages];
}
