"use client";

import { useEffect, useRef } from "react";
import { EditorState, RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  EditorView,
  ViewPlugin,
  Decoration,
  type DecorationSet,
  type ViewUpdate,
  keymap,
  drawSelection,
  placeholder,
} from "@codemirror/view";
import {
  history,
  historyKeymap,
  defaultKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
  type Completion,
} from "@codemirror/autocomplete";
import { slashCommandSource } from "./slash-commands";
import { livePreview, HighlightExtension } from "./live-preview";

export interface WikilinkSuggestion {
  id: string;
  title: string;
}

// ── Markdown highlight style ──────────────────────────────────────────────────
const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.6em", fontWeight: "700", lineHeight: "1.3" },
  { tag: tags.heading2, fontSize: "1.4em", fontWeight: "700", lineHeight: "1.3" },
  { tag: tags.heading3, fontSize: "1.2em", fontWeight: "600", lineHeight: "1.4" },
  { tag: tags.heading4, fontWeight: "600" },
  { tag: tags.heading5, fontWeight: "600" },
  { tag: tags.heading6, fontWeight: "600" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, textDecoration: "underline" },
  { tag: tags.monospace, fontFamily: "'JetBrains Mono', 'Fira Code', monospace" },
]);

// ── [[Wikilink]] decoration ───────────────────────────────────────────────────
class WikilinkPlugin {
  decorations: DecorationSet;
  constructor(view: EditorView) {
    this.decorations = buildWikilinkDecorations(view);
  }
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = buildWikilinkDecorations(update.view);
    }
  }
}

function buildWikilinkDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const deco = Decoration.mark({ class: "cm-wikilink" });
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    const re = /\[\[[^\]\n]+\]\]/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      builder.add(from + m.index, from + m.index + m[0].length, deco);
    }
  }
  return builder.finish();
}

const wikilinkPlugin = ViewPlugin.fromClass(WikilinkPlugin, {
  decorations: (v) => v.decorations,
});

// ── Theme ─────────────────────────────────────────────────────────────────────
function buildTheme(): Extension {
  return EditorView.theme({
    "&": {
      height: "100%",
      background: "transparent",
      color: "var(--foreground)",
      fontSize: "14px",
    },
    ".cm-content": {
      padding: "16px 20px",
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      lineHeight: "1.75",
      caretColor: "var(--foreground)",
    },
    ".cm-scroller": { overflow: "auto" },
    ".cm-focused": { outline: "none !important" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
    ".cm-selectionBackground, ::selection": {
      background: "color-mix(in srgb, var(--primary) 30%, transparent) !important",
    },
    ".cm-gutters": { display: "none" },
    ".cm-wikilink": { color: "var(--primary)", cursor: "pointer" },
    ".tok-meta, .tok-processingInstruction": {
      color: "var(--muted-foreground)",
      opacity: "0.6",
    },
    ".tok-monospace": {
      background: "color-mix(in srgb, var(--muted) 70%, transparent)",
      padding: "1px 4px",
      borderRadius: "3px",
    },
    ".cm-placeholder": { color: "var(--muted-foreground)" },

    // ── Live-preview rendered elements ────────────────────────────────────
    ".cm-bullet": {
      color: "var(--primary)",
      fontWeight: "700",
    },
    ".cm-task-checkbox": {
      accentColor: "var(--primary)",
      width: "15px",
      height: "15px",
      margin: "0 6px 0 0",
      verticalAlign: "-2px",
      cursor: "pointer",
    },
    ".cm-md-link": {
      color: "var(--primary)",
      textDecoration: "underline",
      textUnderlineOffset: "2px",
      cursor: "pointer",
    },
    ".cm-highlight": {
      background: "color-mix(in srgb, #facc15 45%, transparent)",
      borderRadius: "2px",
      padding: "0 1px",
    },
    ".cm-quote-line": {
      borderLeft: "3px solid var(--border)",
      paddingLeft: "12px",
      color: "var(--muted-foreground)",
      fontStyle: "italic",
    },
    ".cm-hr": {
      borderTop: "2px solid var(--border)",
      margin: "8px 0",
    },
    ".cm-table-wrap": {
      margin: "6px 0",
      overflowX: "auto",
      cursor: "pointer",
    },
    ".cm-table-wrap table": {
      borderCollapse: "collapse",
      fontSize: "13px",
      width: "auto",
    },
    ".cm-table-wrap th, .cm-table-wrap td": {
      border: "1px solid var(--border)",
      padding: "5px 11px",
      textAlign: "left",
    },
    ".cm-table-wrap th": {
      background: "color-mix(in srgb, var(--muted) 60%, transparent)",
      fontWeight: "600",
    },

    // ── Autocomplete / slash-command popup ────────────────────────────────
    ".cm-tooltip.cm-tooltip-autocomplete": {
      border: "1px solid var(--border)",
      borderRadius: "8px",
      background: "var(--popover)",
      color: "var(--popover-foreground)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.15)",
      overflow: "hidden",
      padding: "0",
    },
    ".cm-tooltip-autocomplete > ul": {
      padding: "4px",
      maxHeight: "320px",
      overflowY: "auto",
      fontFamily: 'ui-sans-serif, system-ui, "Segoe UI", sans-serif',
    },
    ".cm-tooltip-autocomplete > ul > li": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "6px 10px",
      borderRadius: "5px",
      fontSize: "13px",
      cursor: "pointer",
      lineHeight: "1.4",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      background: "var(--accent) !important",
      color: "var(--foreground) !important",
    },
    // Completion label (left side)
    ".cm-completionLabel": { flex: "1", fontWeight: "500" },
    // Detail / shorthand (right side, muted)
    ".cm-completionDetail": {
      fontSize: "11px",
      color: "var(--muted-foreground)",
      fontFamily: "'JetBrains Mono', monospace",
      marginLeft: "auto",
      flexShrink: "0",
    },
    // Section headers
    ".cm-completionSectionHeader": {
      padding: "8px 10px 3px",
      fontSize: "10px",
      fontWeight: "700",
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "var(--muted-foreground)",
      borderTop: "1px solid var(--border)",
      marginTop: "2px",
      cursor: "default",
      pointerEvents: "none",
    },
    // Hide icons (we don't use them)
    ".cm-completionIcon": { display: "none" },
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

interface RichMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: WikilinkSuggestion[];
  placeholderText?: string;
  className?: string;
}

export function RichMarkdownEditor({
  value,
  onChange,
  suggestions,
  placeholderText = "Write in Markdown… type / for commands, [[ to link notes",
  className,
}: RichMarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const suggestionsRef = useRef(suggestions);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { suggestionsRef.current = suggestions; }, [suggestions]);

  // Mount once.
  useEffect(() => {
    if (!containerRef.current) return;

    function wikilinkCompletionSource(
      context: CompletionContext,
    ): CompletionResult | null {
      const line = context.state.doc.lineAt(context.pos);
      const before = line.text.slice(0, context.pos - line.from);
      const openIdx = before.lastIndexOf("[[");
      if (openIdx === -1) return null;
      const afterOpen = before.slice(openIdx + 2);
      if (afterOpen.includes("]]") || afterOpen.includes("[[")) return null;

      const q = afterOpen.toLowerCase();
      const options: Completion[] = suggestionsRef.current
        .filter((n) => !q || n.title.toLowerCase().includes(q))
        .slice(0, 8)
        .map((n) => ({
          label: n.title,
          apply(view: EditorView, _c: Completion, from: number, to: number) {
            view.dispatch({ changes: { from, to, insert: n.title + "]]" } });
          },
        }));

      return { from: line.from + openIdx + 2, options, validFor: /^[^\]\n]*$/ };
    }

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        markdown({ base: markdownLanguage, extensions: [HighlightExtension] }),
        syntaxHighlighting(markdownHighlight),
        EditorView.lineWrapping,
        buildTheme(),
        livePreview,
        wikilinkPlugin,
        autocompletion({
          override: [slashCommandSource, wikilinkCompletionSource],
          activateOnTyping: true,
          icons: false,
          maxRenderedOptions: 50,
        }),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        drawSelection(),
        placeholder(placeholderText),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (e.g. template applied).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: { anchor: Math.min(view.state.selection.main.anchor, value.length) },
    });
  }, [value]);

  return <div ref={containerRef} className={className} />;
}
