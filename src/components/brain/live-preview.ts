import {
  StateField,
  type EditorState,
  type Extension,
  type Range,
} from "@codemirror/state";
import {
  EditorView,
  WidgetType,
  Decoration,
  type DecorationSet,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { type MarkdownConfig } from "@lezer/markdown";

// ── ==Highlight== inline parser ───────────────────────────────────────────────
// CommonMark/GFM has no highlight syntax, so teach the parser the `==text==`
// delimiter (mirrors Obsidian).
const HighlightDelim = { resolve: "Highlight", mark: "HighlightMark" };

export const HighlightExtension: MarkdownConfig = {
  defineNodes: ["Highlight", "HighlightMark"],
  parseInline: [
    {
      name: "Highlight",
      parse(cx, next, pos) {
        if (next !== 61 /* = */ || cx.char(pos + 1) !== 61) return -1;
        return cx.addDelimiter(HighlightDelim, pos, pos + 2, true, true);
      },
      after: "Emphasis",
    },
  ],
};

// ── Widgets ───────────────────────────────────────────────────────────────────

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-bullet";
    span.textContent = "•";
    return span;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.from === this.from;
  }
  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    box.className = "cm-task-checkbox";
    box.addEventListener("mousedown", (e) => e.preventDefault());
    box.addEventListener("click", (e) => {
      e.preventDefault();
      view.dispatch({
        changes: {
          from: this.from,
          to: this.to,
          insert: this.checked ? "[ ]" : "[x]",
        },
      });
    });
    return box;
  }
  ignoreEvent() {
    return false;
  }
}

class HrWidget extends WidgetType {
  constructor(readonly from: number) {
    super();
  }
  eq() {
    return true;
  }
  toDOM(view: EditorView) {
    const hr = document.createElement("div");
    hr.className = "cm-hr";
    hr.addEventListener("mousedown", (e) => {
      e.preventDefault();
      view.dispatch({ selection: { anchor: this.from } });
      view.focus();
    });
    return hr;
  }
}

class TableWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
  ) {
    super();
  }
  eq(other: TableWidget) {
    return other.source === this.source;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-table-wrap";
    wrap.appendChild(renderTable(this.source));
    // Click the rendered table to drop the caret into the source for editing.
    wrap.addEventListener("mousedown", (e) => {
      e.preventDefault();
      view.dispatch({ selection: { anchor: this.from } });
      view.focus();
    });
    return wrap;
  }
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

function renderTable(source: string): HTMLTableElement {
  const lines = source.split("\n").filter((l) => l.trim().length > 0);
  const table = document.createElement("table");
  if (lines.length === 0) return table;

  const headers = splitRow(lines[0]);
  const aligns = (lines[1] ? splitRow(lines[1]) : []).map((c) => {
    const left = c.startsWith(":");
    const right = c.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return "";
  });

  const thead = document.createElement("thead");
  const htr = document.createElement("tr");
  headers.forEach((h, i) => {
    const th = document.createElement("th");
    th.textContent = h;
    if (aligns[i]) th.style.textAlign = aligns[i];
    htr.appendChild(th);
  });
  thead.appendChild(htr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const line of lines.slice(2)) {
    const cells = splitRow(line);
    const tr = document.createElement("tr");
    headers.forEach((_, i) => {
      const td = document.createElement("td");
      td.textContent = cells[i] ?? "";
      if (aligns[i]) td.style.textAlign = aligns[i];
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

// ── Decoration engine ─────────────────────────────────────────────────────────

// Inline marker leaves concealed when the caret is outside their span.
const INLINE_MARKS = new Set([
  "EmphasisMark", // ** * _
  "StrikethroughMark", // ~~
  "HighlightMark", // ==
  "CodeMark", // ` (inline only — parent guard below)
  "HeaderMark", // # ## …
]);

const linkMark = Decoration.mark({ class: "cm-md-link" });
const highlightMark = Decoration.mark({ class: "cm-highlight" });
const quoteLine = Decoration.line({ class: "cm-quote-line" });

function selectionTouches(state: EditorState, from: number, to: number): boolean {
  for (const r of state.selection.ranges) {
    if (r.from <= to && r.to >= from) return true;
  }
  return false;
}

interface Built {
  deco: DecorationSet;
  atomic: DecorationSet;
}

function buildDecorations(state: EditorState): Built {
  const all: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];
  const doc = state.doc;

  // Hidden text / widgets — counted as atomic so the caret skips them cleanly.
  const hide = (from: number, to: number, spec = {}) => {
    if (from >= to && !("widget" in spec)) return;
    const d = Decoration.replace(spec).range(from, to);
    all.push(d);
    atomic.push(d);
  };
  const mark = (from: number, to: number, d: Decoration) => {
    if (from < to) all.push(d.range(from, to));
  };
  const line = (pos: number, d: Decoration) => all.push(d.range(pos));

  syntaxTree(state).iterate({
    enter: (node) => {
      const name = node.name;

      // ── Block: tables ────────────────────────────────────────────────
      if (name === "Table") {
        if (selectionTouches(state, node.from, node.to)) return;
        hide(node.from, node.to, {
          widget: new TableWidget(doc.sliceString(node.from, node.to), node.from),
          block: true,
        });
        return false;
      }

      // ── Block: horizontal rule ───────────────────────────────────────
      if (name === "HorizontalRule") {
        if (selectionTouches(state, node.from, node.to)) return;
        hide(node.from, node.to, { widget: new HrWidget(node.from), block: true });
        return false;
      }

      // ── Links: [text](url) → styled text, url concealed ──────────────
      if (name === "Link") {
        if (selectionTouches(state, node.from, node.to)) return;
        mark(node.from, node.to, linkMark);
        for (let c = node.node.firstChild; c; c = c.nextSibling) {
          if (c.name === "LinkMark" || c.name === "URL" || c.name === "LinkTitle") {
            hide(c.from, c.to);
          }
        }
        return false;
      }

      // ── Highlight span styling (markers handled by INLINE_MARKS) ─────
      if (name === "Highlight") {
        mark(node.from, node.to, highlightMark);
        return;
      }

      // ── Lists: bullets + task checkboxes ─────────────────────────────
      if (name === "ListMark") {
        const item = node.node.parent; // ListItem
        const list = item?.parent; // BulletList | OrderedList
        if (list?.name !== "BulletList") return; // leave ordered numbers
        // Detect a task item straight from the line text so we don't depend
        // on the optional TaskMarker grammar node.
        const ln = doc.lineAt(node.from);
        const task = ln.text.match(/^(\s*[-*+]\s+)(\[[ xX]\])/);
        if (task) {
          const bFrom = ln.from + task[1].length;
          const bTo = bFrom + task[2].length;
          const checked = /[xX]/.test(task[2]);
          hide(node.from, bFrom); // swallow "- "
          hide(bFrom, bTo, { widget: new CheckboxWidget(checked, bFrom, bTo) });
        } else {
          hide(node.from, node.to, { widget: new BulletWidget() });
        }
        return;
      }

      // ── Blockquotes: conceal `>` per line, add left-border styling ───
      if (name === "QuoteMark") {
        const ln = doc.lineAt(node.from);
        line(ln.from, quoteLine);
        if (selectionTouches(state, ln.from, ln.to)) return;
        let to = node.to;
        if (doc.sliceString(to, to + 1) === " ") to += 1;
        hide(node.from, to);
        return;
      }

      // ── Inline marker leaves (bold/italic/strike/highlight/code/#) ───
      if (INLINE_MARKS.has(name)) {
        const parent = node.node.parent;
        if (name === "CodeMark" && parent?.name !== "InlineCode") return;
        const regionFrom = parent ? parent.from : node.from;
        const regionTo = parent ? parent.to : node.to;
        if (selectionTouches(state, regionFrom, regionTo)) return;
        let to = node.to;
        if (name === "HeaderMark") {
          while (to < regionTo && doc.sliceString(to, to + 1) === " ") to += 1;
        }
        hide(node.from, to);
        return;
      }
    },
  });

  return {
    deco: Decoration.set(all, true),
    atomic: Decoration.set(atomic, true),
  };
}

// Block decorations (tables, rules) must be provided by a StateField, not a
// ViewPlugin — and a field also has clean access to the selection for the
// reveal-on-caret behaviour.
const liveField = StateField.define<Built>({
  create: (state) => buildDecorations(state),
  update(value, tr) {
    if (tr.docChanged || tr.selection) return buildDecorations(tr.state);
    return value;
  },
  provide: (f) => [
    EditorView.decorations.from(f, (v) => v.deco),
    EditorView.atomicRanges.of((view) => view.state.field(f).atomic),
  ],
});

export const livePreview: Extension = [liveField];
