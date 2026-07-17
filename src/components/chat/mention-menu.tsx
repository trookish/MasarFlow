"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  PenTool,
  FileText,
  KanbanSquare,
  ShieldCheck,
  BrainCircuit,
  ScrollText,
  BookOpen,
  Boxes,
  Search,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ALL_NAV_ITEMS, type NavItem } from "@/lib/nav";
import {
  buildSearchItems,
  createSearchIndex,
  type SearchItem,
  type SearchKind,
} from "@/lib/utils/search";
import {
  SLASH_COMMANDS,
  type MenuResult,
  type MentionKind,
  type SlashCommand,
} from "@/lib/chat/mentions";
import { cn } from "@/lib/utils/cn";

/**
 * Inline mention/slash popover for the chat composer. Focus stays in the
 * textarea; the parent forwards keydown events here via the imperative handle.
 * On select it calls back with a `MenuResult`; the parent inserts the token,
 * pushes a mention chip, and re-focuses the textarea.
 */

export interface MentionMenuHandle {
  /** Returns true when the key was consumed (navigation / selection / escape). */
  handleKeyDown: (e: ReactKeyboardEvent<HTMLTextAreaElement>) => boolean;
}

interface BaseItem {
  key: string;
  icon: LucideIcon;
  label: string;
  subtitle: string;
  result: MenuResult;
}

export interface MentionMenuProps {
  kind: MentionKind;
  query: string;
  projectId: string | null;
  /** Caret coordinates relative to the textarea's top-left (for anchoring). */
  anchor: { top: number; left: number } | null;
  onSelect: (result: MenuResult) => void;
  onClose: () => void;
}

const RECORD_ICON: Record<SearchKind, LucideIcon> = {
  note: PenTool,
  spec: FileText,
  task: KanbanSquare,
  standard: ShieldCheck,
  memory: BrainCircuit,
  devlog: ScrollText,
  doc: BookOpen,
  system: Boxes,
};

export const MentionMenu = forwardRef<MentionMenuHandle, MentionMenuProps>(
  function MentionMenu({ kind, query, projectId, anchor, onSelect, onClose }, ref) {
    const [allRecords, setAllRecords] = useState<SearchItem[] | null>(null);
    const listRef = useRef<HTMLDivElement>(null);

    /* Load records once when entering `#` mode. */
    useEffect(() => {
      if (kind !== "record" || !projectId) return;
      let cancelled = false;
      buildSearchItems(projectId).then((items) => {
        if (!cancelled) setAllRecords(items);
      });
      return () => {
        cancelled = true;
      };
    }, [kind, projectId]);

    const index = useMemo(
      () => (allRecords ? createSearchIndex(allRecords) : null),
      [allRecords],
    );

    /* Build + filter the visible items for the current kind + query. */
    const items: BaseItem[] = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (kind === "slash") {
        return SLASH_COMMANDS.filter(
          (c) =>
            !q ||
            c.label.toLowerCase().includes(q) ||
            c.id.includes(q) ||
            c.description.toLowerCase().includes(q),
        ).map((c) => toCommandItem(c));
      }
      if (kind === "page") {
        return ALL_NAV_ITEMS.filter((it) => {
          const hay = [it.label, ...(it.keywords ?? [])].join(" ").toLowerCase();
          return !q || hay.includes(q);
        }).map((it) => toPageItem(it));
      }
      // record
      if (!allRecords || !index) return [];
      let results: SearchItem[];
      if (!q) {
        results = allRecords.slice(0, 50);
      } else {
        results = index.search(q).slice(0, 50).map((r) => r.item);
      }
      return results.map((it) => toRecordItem(it));
    }, [kind, query, allRecords, index]);

    const [active, setActive] = useState(0);
    useEffect(() => {
      setActive(0);
    }, [items]);

    /* Keep the active row scrolled into view. */
    useEffect(() => {
      const el = listRef.current?.querySelector<HTMLElement>(
        `[data-idx="${active}"]`,
      );
      el?.scrollIntoView({ block: "nearest" });
    }, [active]);

    function choose(idx: number) {
      const item = items[idx];
      if (item) onSelect(item.result);
    }

    useImperativeHandle(ref, () => ({
      handleKeyDown(e) {
        if (items.length === 0 && e.key !== "Escape") return false;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActive((i) => (i + 1) % Math.max(items.length, 1));
          return true;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setActive((i) =>
            (i - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1),
          );
          return true;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          if (items.length > 0) {
            e.preventDefault();
            choose(active);
            return true;
          }
          return false;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
          return true;
        }
        return false;
      },
    }));

    if (!anchor) return null;

    const loading = kind === "record" && allRecords === null;

    return (
      <div
        className="absolute z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-border bg-popover shadow-lg"
        style={{
          top: anchor.top,
          left: anchor.left,
          transform: "translateY(calc(-100% - 4px))",
        }}
      >
        <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">
          <Search className="h-3 w-3" />
          {kind === "slash"
            ? "Commands"
            : kind === "page"
              ? "Pages"
              : "Records"}
          <span className="ml-auto opacity-70">↑↓ select · ↵ insert · esc</span>
        </div>
        <div ref={listRef} className="max-h-64 overflow-y-auto p-1">
          {loading ? (
            <p className="px-2.5 py-3 text-center text-xs text-muted-foreground">
              Loading records…
            </p>
          ) : items.length === 0 ? (
            <p className="px-2.5 py-3 text-center text-xs text-muted-foreground">
              No matches.
            </p>
          ) : (
            items.map((it, i) => {
              const Icon = it.icon;
              return (
                <button
                  key={it.key}
                  type="button"
                  data-idx={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm",
                    i === active
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground hover:bg-accent/50",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.subtitle && (
                    <span className="shrink-0 truncate text-[11px] text-muted-foreground">
                      {it.subtitle}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  },
);

function toCommandItem(c: SlashCommand): BaseItem {
  return {
    key: `cmd-${c.id}`,
    icon: Sparkles,
    label: c.label,
    subtitle: c.description,
    result: { type: "command", command: c },
  };
}

function toPageItem(it: NavItem): BaseItem {
  return {
    key: `page-${it.href}`,
    icon: it.icon,
    label: it.label,
    subtitle: it.href,
    result: { type: "page", item: it },
  };
}

function toRecordItem(it: SearchItem): BaseItem {
  return {
    key: `rec-${it.kind}-${it.id}`,
    icon: RECORD_ICON[it.kind] ?? FileText,
    label: it.title,
    subtitle: it.subtitle,
    result: { type: "record", item: it },
  };
}

/* ── Caret coordinate helper (mirror-element technique) ─────────────── */

const _mirrorCache = new WeakMap<HTMLTextAreaElement, HTMLDivElement>();

function copyStyle(src: HTMLElement, dst: HTMLElement) {
  const cs = getComputedStyle(src);
  const props: Array<keyof CSSStyleDeclaration> = [
    "boxSizing",
    "width",
    "height",
    "overflowX",
    "overflowY",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "borderStyle",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "fontStyle",
    "fontVariant",
    "fontWeight",
    "fontStretch",
    "fontSize",
    "fontSizeAdjust",
    "lineHeight",
    "fontFamily",
    "textAlign",
    "textTransform",
    "textIndent",
    "textDecoration",
    "letterSpacing",
    "wordSpacing",
    "tabSize",
    "whiteSpace",
    "wordBreak",
  ];
  for (const p of props) {
    // @ts-expect-error CSSStyleDeclaration indices are stringly-typed
    dst.style[p] = cs[p];
  }
}

/**
 * Approximate the textarea caret's {top,left} relative to the textarea's
 * top-left, by cloning the textarea into a hidden mirror and placing a span
 * at the caret position. Good enough to anchor the mention popover.
 */
export function getCaretCoordinates(
  textarea: HTMLTextAreaElement,
  position: number,
): { top: number; left: number } {
  let mirror = _mirrorCache.get(textarea);
  if (!mirror) {
    mirror = document.createElement("div");
    _mirrorCache.set(textarea, mirror);
  }
  const m = mirror;
  m.id = "mention-caret-mirror";
  m.style.cssText =
    "position:absolute; top:-9999px; left:-9999px; visibility:hidden; white-space:pre-wrap; word-wrap:break-word;";
  copyStyle(textarea, m);
  if (textarea.parentNode) textarea.parentNode.appendChild(m);

  const before = textarea.value.slice(0, position);
  const after = textarea.value.slice(position);
  m.textContent = before;
  const span = document.createElement("span");
  span.textContent = after ? after[0] : " ";
  m.appendChild(span);

  const taRect = textarea.getBoundingClientRect();
  const mRect = m.getBoundingClientRect();
  const spanRect = span.getBoundingClientRect();
  const top = spanRect.top - mRect.top;
  const left = spanRect.left - mRect.left;

  // Account for scroll offset inside the textarea.
  const result = {
    top: top - textarea.scrollTop,
    left,
  };

  if (textarea.parentNode) textarea.parentNode.removeChild(m);
  void taRect;
  return result;
}
