import type { SearchItem, SearchKind } from "@/lib/utils/search";
import type { NavItem } from "@/lib/nav";

/**
 * Composer mention engine for the chat input — PURE module (no Dexie imports)
 * so it is unit-testable in the node vitest environment. The repo-dependent
 * resolver lives in `mention-resolve.ts`.
 *
 * Three trigger kinds:
 *  `/`  — slash commands: prompt scaffolds the AI then executes via tools.
 *  `@`  — pages: references a workspace page (Brain, Tasks, Specs, …).
 *  `#`  — records: references a specific note/spec/task/doc/standard/system/
 *         memory/dev-log; its body is inlined as context on send.
 */

export type MentionKind = "slash" | "page" | "record";

/** Label per record kind (mirrors utils/search KIND_LABEL to stay import-free). */
const RECORD_KIND_LABEL: Record<SearchKind, string> = {
  note: "Note",
  spec: "Spec",
  task: "Task",
  standard: "Standard",
  memory: "Memory",
  devlog: "Dev Log",
  doc: "Doc",
  system: "System",
};

/** The kinds of concrete records that a `#` mention can target. */
export const RECORD_KINDS: SearchKind[] = [
  "note",
  "spec",
  "task",
  "doc",
  "standard",
  "system",
  "memory",
  "devlog",
];

/** A selected mention carried alongside the composer text. */
export interface Mention {
  /** Stable unique id for this mention instance (chip key + strip targeting). */
  uid: string;
  kind: "page" | "record";
  /** The exact inline token inserted into the textarea (used for stripping). */
  token: string;
  // page-only:
  label?: string;
  href?: string;
  // record-only:
  recordKind?: SearchKind;
  recordId?: string;
  title?: string;
}

/* ── Trigger detection ──────────────────────────────────────────────── */

export interface TriggerState {
  kind: MentionKind;
  /** The text typed after the trigger char (no whitespace inside). */
  query: string;
  /** Index of the trigger char in the textarea value. */
  start: number;
  /** Caret index (end of the trigger span). */
  end: number;
}

const TRIGGER_CHAR: Record<string, MentionKind> = {
  "/": "slash",
  "@": "page",
  "#": "record",
};

/**
 * Walk back from the caret to find an active trigger char. A trigger is only
 * active when it sits at the start of the input or right after whitespace, so
 * we don't fire on URLs (`https://`), emails, or mid-sentence markdown. Returns
 * null if whitespace is hit first (so the query can never contain a space).
 */
export function detectTrigger(text: string, caret: number): TriggerState | null {
  if (caret < 1) return null;
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (/\s/.test(ch)) return null;
    const kind = TRIGGER_CHAR[ch];
    if (kind) {
      const prev = i > 0 ? text[i - 1] : "";
      if (i > 0 && !/\s/.test(prev)) return null;
      return {
        kind,
        query: text.slice(i + 1, caret),
        start: i,
        end: caret,
      };
    }
    i--;
  }
  return null;
}

/* ── Token builders ─────────────────────────────────────────────────── */

/** Inline token for a page mention, e.g. `@Brain`. */
export function pageToken(label: string): string {
  return `@${label}`;
}

/** Inline token for a record mention, e.g. `#Note: Project goals`. */
export function recordToken(recordKind: SearchKind, title: string): string {
  return `#${RECORD_KIND_LABEL[recordKind]}: ${title}`;
}

/** Remove a mention's token (and one following space) from the text. */
export function stripMentionToken(text: string, token: string): string {
  const idx = text.indexOf(token);
  if (idx === -1) return text;
  const after = idx + token.length;
  const hasTrailingSpace = text[after] === " ";
  return text.slice(0, idx) + text.slice(hasTrailingSpace ? after + 1 : after);
}

/* ── Slash commands ─────────────────────────────────────────────────── */

export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  /** Scaffold text inserted in place of the `/token`. Uses `__` placeholders. */
  insert: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "create-note",
    label: "Create note",
    description: "Scaffold a note for the AI to create via tools",
    insert: 'Create a note titled "__" with this body:\n\n__',
  },
  {
    id: "create-task",
    label: "Create task",
    description: "Scaffold a task for the AI to create",
    insert: 'Create a task: "__" — __',
  },
  {
    id: "create-spec",
    label: "Create spec",
    description: "Scaffold an RFC specification",
    insert: 'Create a specification (RFC) titled "__". Purpose: __',
  },
  {
    id: "create-doc",
    label: "Create doc",
    description: "Scaffold a documentation page",
    insert: 'Create a documentation page titled "__" with body:\n\n__',
  },
  {
    id: "create-sprint",
    label: "Create sprint",
    description: "Scaffold a sprint",
    insert: 'Create a sprint named "__" with goal: __',
  },
  {
    id: "create-standard",
    label: "Create standard",
    description: "Scaffold a coding standard",
    insert: 'Create a coding standard: "__". Rule: __',
  },
  {
    id: "create-system",
    label: "Create system",
    description: "Scaffold an architecture system",
    insert: 'Create an architecture system named "__". Description: __',
  },
  {
    id: "create-canvas",
    label: "Create canvas",
    description: "Scaffold a new canvas",
    insert: 'Create a canvas named "__".',
  },
  {
    id: "create-memory",
    label: "Save memory",
    description: "Save a long-term memory",
    insert: "Remember this for future sessions: __",
  },
  {
    id: "create-devlog",
    label: "Write dev log",
    description: "Write a dev-log entry",
    insert: "Write a dev-log entry: __",
  },
  {
    id: "summarize-workspace",
    label: "Summarize workspace",
    description: "Ask the AI to summarize the workspace state",
    insert: "Summarize the current state of my workspace.",
  },
  {
    id: "list-tasks",
    label: "List tasks",
    description: "Ask the AI to list open tasks",
    insert: "List my open tasks and what's in progress.",
  },
  {
    id: "review-specs",
    label: "Review specs",
    description: "Review specs for missing acceptance criteria",
    insert:
      "Review my specs and flag any that are missing acceptance criteria or are still in draft.",
  },
  {
    id: "next-steps",
    label: "Next steps",
    description: "Suggest what to work on next",
    insert: "What should I work on next? Check my open tasks, specs, and sprints.",
  },
];

/** Range of the first `__` placeholder in `text` (for caret selection). */
export function firstPlaceholderRange(
  text: string,
  from = 0,
): { start: number; end: number } | null {
  const idx = text.indexOf("__", from);
  if (idx === -1) return null;
  return { start: idx, end: idx + 2 };
}

/* ── Menu result (discriminated union passed on select) ─────────────── */

export type MenuResult =
  | { type: "command"; command: SlashCommand }
  | { type: "page"; item: NavItem }
  | { type: "record"; item: SearchItem };

let _uid = 0;
/** Generate a unique id for a mention instance. */
export function newMentionUid(): string {
  _uid += 1;
  return `m${Date.now().toString(36)}-${_uid}`;
}
