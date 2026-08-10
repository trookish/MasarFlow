import type { WireMessage } from "@/lib/ai/chat-client";

/**
 * Context-window guard for the conversation history fed to the LLM.
 *
 * A thread grows with every turn; without a cap, a long conversation
 * eventually exceeds the model's context window and every subsequent request
 * fails with a 400 — the "works fine until some chatting, then stops
 * responding" failure. This trims the OLDEST turns so the current request
 * and the most recent context always fit.
 *
 * Contract kept intact: a leading assistant tool-call message is never left
 * without its tool results (and orphan tool results are never kept), and the
 * final user message is always preserved.
 */

const CHARS_PER_TOKEN = 3.5;

/** Rough message size in chars, including tool-call argument JSON. */
function messageLength(m: WireMessage): number {
  let len = m.content.length;
  if ("toolCalls" in m && m.toolCalls?.length) {
    for (const c of m.toolCalls) {
      len += c.name.length + JSON.stringify(c.arguments ?? {}).length + 40;
    }
  }
  return len;
}

export interface TrimHistoryOptions {
  /** Model context window in tokens. No limit when absent. */
  contextLimit?: number;
  /** System prompt (includes the workspace briefing) — counts against the window. */
  system?: string;
  /** Tokens reserved for the model's answer + tool-result headroom. */
  reserveTokens?: number;
}

export interface TrimHistoryResult {
  messages: WireMessage[];
  /** True when at least one turn was dropped. */
  trimmed: boolean;
  /** Number of messages dropped. */
  dropped: number;
}

export function trimHistoryForContext(
  messages: WireMessage[],
  opts: TrimHistoryOptions = {},
): TrimHistoryResult {
  if (!opts.contextLimit || messages.length <= 1) {
    return { messages, trimmed: false, dropped: 0 };
  }

  const systemTokens = Math.ceil((opts.system?.length ?? 0) / CHARS_PER_TOKEN);
  const reserveTokens = opts.reserveTokens ?? 8000;
  const budgetTokens = opts.contextLimit - systemTokens - reserveTokens;

  if (budgetTokens <= 0) {
    // Nothing left for history: keep only the current user turn.
    const last = messages[messages.length - 1];
    return {
      messages: [last],
      trimmed: messages.length > 1,
      dropped: messages.length - 1,
    };
  }

  const budgetChars = Math.floor(budgetTokens * CHARS_PER_TOKEN);
  const kept: WireMessage[] = [];
  let total = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const len = messageLength(m);
    // Always keep the last message, even when it alone exceeds the budget.
    if (total + len > budgetChars && kept.length > 0) break;
    total += len;
    kept.unshift(m);
  }

  // Fix the cut point: never leave an orphan tool result at the head (its
  // assistant tool-call was dropped). Dropping it can expose an assistant
  // tool-call message whose results survive — that pairing is valid.
  let firstKept = 0;
  while (firstKept < kept.length && kept[firstKept].role === "tool") {
    firstKept++;
  }
  const dropped = messages.length - (kept.length - firstKept);
  return {
    messages: firstKept > 0 ? kept.slice(firstKept) : kept,
    trimmed: dropped > 0,
    dropped,
  };
}
