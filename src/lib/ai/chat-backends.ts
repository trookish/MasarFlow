/**
 * Shared plumbing for the non-OpenCode chat backends — saved API connections
 * and local Ollama. Both run the in-browser Agent Loop (AgentController via
 * /api/chat); this module resolves the backend context from a thread, rebuilds
 * the wire history from the stored messages, and converts attachments.
 * Kept pure and unit-testable.
 */

import type { ChatAttachment, ChatMessage } from "@/lib/db/schema";
import type { WireImage, WireMessage } from "./chat-client";
import type { AiProvider, Catalog } from "./catalog";

export type ChatBackend = "opencode" | "api" | "ollama";

export const BACKEND_LABELS: Record<ChatBackend, string> = {
  opencode: "OpenCode",
  api: "API",
  ollama: "Local (Ollama)",
};

/** A data URL like "data:image/png;base64,…" → raw base64 wire image. */
export function dataUrlToWireImage(
  dataUrl: string,
  fallbackMime: string,
): WireImage | null {
  const m = /^data:([^;,]*);base64,([\s\S]*)$/.exec(dataUrl);
  if (!m) return null;
  return { mimeType: m[1] || fallbackMime || "image/png", data: m[2] };
}

/** Split attachments into inline text (files) and image blocks (images). */
export function attachmentsToWire(attachments: ChatAttachment[]): {
  text: string;
  images: WireImage[];
} {
  let text = "";
  const images: WireImage[] = [];
  for (const a of attachments) {
    if (a.kind === "image" && a.dataUrl) {
      const img = dataUrlToWireImage(a.dataUrl, a.mimeType);
      if (img) images.push(img);
    } else if (a.textContent.trim()) {
      text += `\n\n--- ${a.name} ---\n${a.textContent}`;
    }
  }
  return { text: text.trim(), images };
}

/**
 * Rebuild the wire message history for a browser-Agent-Loop turn from the
 * stored thread messages. Tool results from earlier turns are not replayed —
 * the AgentController rebuilds them per turn; prior user turns and assistant
 * text (with any reasoning) are enough to continue the conversation.
 */
export function buildLegacyMessages(
  threadMessages: ChatMessage[],
): WireMessage[] {
  const out: WireMessage[] = [];
  for (const m of threadMessages) {
    if (m.role === "user") {
      const { text, images } = attachmentsToWire(m.attachments ?? []);
      const content = text ? `${m.content}\n\n${text}` : m.content;
      if (!content.trim()) continue;
      out.push({
        role: "user",
        content,
        images: images.length ? images : undefined,
      });
    } else if (m.role === "assistant") {
      const parts = [
        m.reasoning?.trim()
          ? `[thinking]\n${m.reasoning.trim()}\n[/thinking]`
          : "",
        m.content,
      ].filter(Boolean);
      if (parts.length === 0) continue;
      out.push({ role: "assistant", content: parts.join("\n\n") });
    }
  }
  return out;
}

/** The provider for an "api" thread, resolved from its saved connection. */
export function providerForConnection(
  catalog: Catalog,
  connection: { providerId: string } | null | undefined,
): AiProvider | null {
  if (!connection) return null;
  return catalog[connection.providerId] ?? null;
}
