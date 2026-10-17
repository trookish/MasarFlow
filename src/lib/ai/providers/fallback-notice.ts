import type { FallbackTarget } from "./fallback";

/**
 * Fallback switches are written into the assistant message's persisted
 * `notices` array (plain strings). A "Keep using this model" offer rides
 * along as a unit-separator suffix marker — invisible when rendered, parsed
 * by the message row to show the confirm button, and harmless for every
 * other consumer of `notices`. The thread is only repointed when the user
 * accepts the offer.
 */

const KEEP_MARK = "\u001fkeep\u001f";
const FIELD_SEP = "\u001f";

/** The notice line for a switch to `target`, with its keep-offer attached. */
export function fallbackNoticeText(
  label: string,
  target: FallbackTarget,
  reason: string,
): string {
  return `Switched to ${label}:${target.modelId} — ${reason}${KEEP_MARK}${target.connectionId}${FIELD_SEP}${target.modelId}`;
}

export interface ParsedFallbackNotice {
  /** The human-readable notice line (no marker). */
  text: string;
  /** The target to persist if the user accepts the switch; null for plain notices. */
  keep: FallbackTarget | null;
}

export function parseFallbackNotice(notice: string): ParsedFallbackNotice {
  const i = notice.indexOf(KEEP_MARK);
  if (i < 0) return { text: notice, keep: null };
  const [connectionId, modelId] = notice
    .slice(i + KEEP_MARK.length)
    .split(FIELD_SEP);
  return {
    text: notice.slice(0, i),
    keep:
      connectionId !== undefined && modelId !== undefined
        ? { connectionId, modelId }
        : null,
  };
}
