/**
 * Some models restate the user's message before answering (e.g. they open a
 * reply to "What can you see?" with "What can you see? …"). That echo is
 * noise in the chat. `createEchoStripper` builds a stateful stripper that
 * removes a leading verbatim copy of the user's message from a streaming
 * reply, tolerating case, punctuation, and whitespace differences, and chunk
 * boundaries (a delta can end mid-word). Once the echo is fully consumed (or
 * provably diverged), all later text passes through untouched. `reset()`
 * re-arms it for a fresh stream (e.g. a resume replaying a snapshot).
 */

export interface EchoStripper {
  strip: (delta: string) => string;
  reset: () => void;
}

/** Lowercase, collapse whitespace, drop punctuation — for echo comparison. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    // Letters and digits from every script (Arabic, CJK, Cyrillic, …) are
    // echo content; only punctuation and symbols are dropped. ASCII-only \w
    // would normalize a whole Arabic message to "" and disable the stripper.
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

/** Chars skipped after the echo completes: whitespace + echo punctuation. */
const BOUNDARY_SKIP = /[\s.,!?;:…'"`)\]}>؟،؛]/;

export function createEchoStripper(userText: string): EchoStripper {
  const target = norm(userText);
  let pos = 0;
  // Set the first time matching provably diverges. From then on the echo
  // either never existed or is already over — every later delta is real
  // content and must pass through untouched (otherwise a later delta whose
  // start happens to continue the stale target loses characters).
  let dead = false;

  return {
    strip: (delta: string) => {
      if (!target || dead) return delta;
      let out = "";
      let i = 0;

      // Matching phase: consume the echo, skipping whitespace on both sides
      // and any punctuation the model may add or drop ("what can you see"
      // matches "What can you see?" and "whatcanyousee").
      while (i < delta.length && pos < target.length) {
        const c = delta[i];
        if (/\s/.test(c)) {
          i++;
          continue;
        }
        if (/\s/.test(target[pos])) {
          pos++;
          continue;
        }
        if (!/[\p{L}\p{N}]/u.test(c)) {
          i++;
          continue;
        }
        if (c.toLowerCase() === target[pos]) {
          pos++;
          i++;
          continue;
        }
        dead = true;
        break;
      }

      // Boundary phase: the echo is consumed. Skip whitespace and the echo's
      // trailing punctuation (the "?" in "What can you see?") so the answer
      // starts clean; anything else is real content.
      while (i < delta.length && pos >= target.length) {
        if (BOUNDARY_SKIP.test(delta[i])) {
          i++;
          continue;
        }
        break;
      }

      if (pos >= target.length && i < delta.length) {
        out += delta.slice(i);
      } else if (pos < target.length) {
        // Diverged mid-echo — keep everything from the mismatch onward.
        out += delta.slice(i);
      }
      return out;
    },
    reset: () => {
      pos = 0;
      dead = false;
    },
  };
}
