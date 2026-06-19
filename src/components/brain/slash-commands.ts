import type { EditorView } from "@codemirror/view";
import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";

/** Marks where the cursor lands after a slash command is applied. */
const CUR = "\x01";

export interface SlashCommandDef {
  label: string;
  section: string;
  detail: string;
  keywords: string[];
  /** Template with \x01 marking cursor position. Can be a fn for dynamic values. */
  insert: string | (() => string);
}

// ── Command definitions ───────────────────────────────────────────────────────

export const SLASH_COMMANDS: SlashCommandDef[] = [
  // TEXT FORMATTING
  { label: "Bold",          section: "Text Formatting", detail: "**bold**",          keywords: ["b","strong"],                             insert: `**${CUR}**` },
  { label: "Italic",        section: "Text Formatting", detail: "*italic*",          keywords: ["i","em","emphasis"],                       insert: `*${CUR}*` },
  { label: "Strikethrough", section: "Text Formatting", detail: "~~text~~",          keywords: ["strike","del","s"],                        insert: `~~${CUR}~~` },
  { label: "Highlight",     section: "Text Formatting", detail: "==highlight==",     keywords: ["mark","hl","yellow","bg"],                 insert: `==${CUR}==` },
  { label: "Inline Code",   section: "Text Formatting", detail: "`code`",            keywords: ["code","mono","backtick"],                  insert: `\`${CUR}\`` },
  { label: "Comment",       section: "Text Formatting", detail: "<!-- hidden -->",   keywords: ["comment","hidden","annotate","hide"],      insert: `<!-- ${CUR} -->` },
  { label: "Superscript",   section: "Text Formatting", detail: "x^2^",             keywords: ["sup","superscript","power","exponent"],    insert: `^${CUR}^` },
  { label: "Subscript",     section: "Text Formatting", detail: "H~2~O",            keywords: ["sub","subscript"],                         insert: `~${CUR}~` },
  { label: "Keyboard",      section: "Text Formatting", detail: "<kbd>key</kbd>",   keywords: ["key","shortcut","kbd","hotkey"],           insert: `<kbd>${CUR}</kbd>` },

  // HEADINGS
  { label: "Heading 1", section: "Headings", detail: "# H1",      keywords: ["h1","title","header 1"],  insert: `# ${CUR}` },
  { label: "Heading 2", section: "Headings", detail: "## H2",     keywords: ["h2","header 2"],          insert: `## ${CUR}` },
  { label: "Heading 3", section: "Headings", detail: "### H3",    keywords: ["h3","header 3"],          insert: `### ${CUR}` },
  { label: "Heading 4", section: "Headings", detail: "#### H4",   keywords: ["h4","header 4"],          insert: `#### ${CUR}` },
  { label: "Heading 5", section: "Headings", detail: "##### H5",  keywords: ["h5","header 5"],          insert: `##### ${CUR}` },
  { label: "Heading 6", section: "Headings", detail: "###### H6", keywords: ["h6","header 6"],          insert: `###### ${CUR}` },

  // LISTS
  { label: "Bullet List",   section: "Lists", detail: "- item",        keywords: ["ul","unordered","bullet","dash","point"],         insert: `- ${CUR}` },
  { label: "Numbered List", section: "Lists", detail: "1. item",       keywords: ["ol","ordered","numbered","number","enumerate"],   insert: `1. ${CUR}` },
  { label: "Task List",     section: "Lists", detail: "- [ ] task",    keywords: ["todo","check","checkbox","task","checklist"],     insert: `- [ ] ${CUR}` },
  { label: "Quote",         section: "Lists", detail: "> text",        keywords: ["blockquote","cite","bq"],                        insert: `> ${CUR}` },

  // BLOCKS / STRUCTURE
  { label: "Code Block",        section: "Blocks", detail: "```lang...```",   keywords: ["pre","snippet","fence","fenced","codeblock"],      insert: `\`\`\`\n${CUR}\n\`\`\`` },
  { label: "Note Callout",      section: "Blocks", detail: "> [!NOTE]",       keywords: ["note","info","callout","admonition","alert"],      insert: `> [!NOTE]\n> ${CUR}` },
  { label: "Warning Callout",   section: "Blocks", detail: "> [!WARNING]",    keywords: ["warn","warning","caution","danger"],               insert: `> [!WARNING]\n> ${CUR}` },
  { label: "Tip Callout",       section: "Blocks", detail: "> [!TIP]",        keywords: ["tip","hint","suggestion","idea"],                  insert: `> [!TIP]\n> ${CUR}` },
  { label: "Important Callout", section: "Blocks", detail: "> [!IMPORTANT]",  keywords: ["important","critical","key","notice"],             insert: `> [!IMPORTANT]\n> ${CUR}` },
  { label: "Table",             section: "Blocks", detail: "| A | B |...",    keywords: ["table","grid","spreadsheet","matrix","rows"],      insert: `| ${CUR}Col 1 | Col 2 |\n|---|---|\n| | |\n` },
  { label: "Horizontal Rule",   section: "Blocks", detail: "---",             keywords: ["hr","rule","divider","separator","line","break"],  insert: `\n---\n${CUR}` },
  { label: "Details Block",     section: "Blocks", detail: "<details>…</details>", keywords: ["collapse","toggle","accordion","fold","expand"], insert: `<details>\n<summary>${CUR}</summary>\n\n</details>` },
  { label: "Math Block",        section: "Blocks", detail: "$$...$$",         keywords: ["math","equation","latex","formula","katex","mathjax"], insert: `$$\n${CUR}\n$$` },
  { label: "Math Inline",       section: "Blocks", detail: "$...$",           keywords: ["inline math","imath","$"],                        insert: `$${CUR}$` },

  // LINKS & REFERENCES
  { label: "Link",      section: "Links & References", detail: "[text](url)",    keywords: ["link","url","href","anchor","a","hyperlink"],   insert: `[${CUR}](url)` },
  { label: "Image",     section: "Links & References", detail: "![alt](url)",    keywords: ["img","image","photo","picture","embed","media"], insert: `![${CUR}](url)` },
  { label: "Wikilink",  section: "Links & References", detail: "[[note]]",       keywords: ["internal","wikilink","ref","note link","backlink","bracket"], insert: `[[${CUR}]]` },
  { label: "Footnote",  section: "Links & References", detail: "[^1]: note",     keywords: ["footnote","citation","endnote"],                insert: `[^1]\n\n[^1]: ${CUR}` },

  // INSERTS
  { label: "Date",       section: "Inserts", detail: "Today's date (YYYY-MM-DD)", keywords: ["today","date","day","calendar"],       insert: () => new Date().toISOString().split("T")[0] },
  { label: "Time",       section: "Inserts", detail: "Current time (HH:MM)",      keywords: ["time","now","clock","hour"],           insert: () => new Date().toTimeString().slice(0, 5) },
  { label: "Date & Time",section: "Inserts", detail: "Full timestamp",            keywords: ["datetime","timestamp","full date"],    insert: () => `${new Date().toISOString().split("T")[0]} ${new Date().toTimeString().slice(0, 5)}` },
];

// ── Apply helper ──────────────────────────────────────────────────────────────

export function applySlashCommand(
  view: EditorView,
  cmd: SlashCommandDef,
  from: number,
  to: number,
): void {
  const raw = typeof cmd.insert === "function" ? cmd.insert() : cmd.insert;
  const idx = raw.indexOf(CUR);
  const insert = raw.replaceAll(CUR, "");
  const anchor = from + (idx === -1 ? insert.length : idx);
  view.dispatch({ changes: { from, to, insert }, selection: { anchor } });
  view.focus();
}

// ── Completion source ─────────────────────────────────────────────────────────

export function slashCommandSource(
  context: CompletionContext,
): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  const slashIdx = before.lastIndexOf("/");
  if (slashIdx === -1) return null;

  const query = before.slice(slashIdx + 1).toLowerCase();

  const options = SLASH_COMMANDS.filter((cmd) => {
    if (!query) return true;
    return (
      cmd.label.toLowerCase().includes(query) ||
      cmd.section.toLowerCase().includes(query) ||
      cmd.keywords.some((k) => k.includes(query))
    );
  }).map(
    (cmd): Completion => ({
      label: cmd.label,
      detail: cmd.detail,
      section: cmd.section,
      apply(view: EditorView, _: Completion, from: number, to: number) {
        applySlashCommand(view, cmd, from, to);
      },
    }),
  );

  if (options.length === 0) return null;

  return {
    from: line.from + slashIdx,
    options,
    filter: false,
    validFor: /^\/[a-zA-Z0-9& ]*$/,
  };
}
