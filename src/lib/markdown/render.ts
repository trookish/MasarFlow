import { createLowlight } from "lowlight";
import { common } from "lowlight";
import katex from "katex";

const lowlight = createLowlight(common);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderKatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, { displayMode, throwOnError: false });
  } catch {
    return `<span class="text-[color:var(--danger)]">${escapeHtml(latex)}</span>`;
  }
}

function highlightCode(code: string, lang: string): string {
  try {
    const tree = lowlight.highlight(lang || "text", code);
    return treeToHtml(tree);
  } catch {
    return escapeHtml(code);
  }
}

function treeToHtml(tree: unknown): string {
  if (typeof tree === "string") return escapeHtml(tree);
  if (tree === null || typeof tree !== "object") return "";
  const node = tree as {
    type?: string;
    tagName?: string;
    properties?: Record<string, unknown>;
    children?: unknown[];
    value?: string;
  };
  if (node.type === "text") return escapeHtml(String(node.value ?? ""));
  if (node.type === "element" && node.tagName) {
    const props = Object.entries(node.properties ?? {})
      .map(([k, v]) => ` ${k}="${escapeHtml(String(v))}"`)
      .join("");
    const children = (node.children ?? []).map(treeToHtml).join("");
    return `<${node.tagName}${props}>${children}</${node.tagName}>`;
  }
  return "";
}

function processMath(text: string): string {
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, latex: string) => renderKatex(latex.trim(), true))
    .replace(/\$([^$\s][^$]*?)\$/g, (_, latex: string) => renderKatex(latex.trim(), false));
}

function inline(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">$1</code>',
  );
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  s = s.replace(
    /\[\[([^\[\]\n]+?)\]\]/g,
    (_m, title: string) =>
      `<a class="wikilink rounded px-1 text-primary underline-offset-2 hover:underline" data-wikilink="${escapeHtml(
        title.trim(),
      )}" href="#">${escapeHtml(title.trim())}</a>`,
  );
  s = s.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img alt="$1" src="$2" class="my-2 max-w-full rounded-md border border-border" />',
  );
  s = s.replace(
    /\[([^\]]+)\]\((https?:[^)]+)\)/g,
    '<a class="text-primary underline-offset-2 hover:underline" target="_blank" rel="noreferrer" href="$2">$1</a>',
  );
  s = processMath(s);
  return s;
}

function parseTable(lines: string[], startIndex: number): { html: string; nextIndex: number } {
  const rows: string[][] = [];
  let i = startIndex;
  while (i < lines.length && lines[i].trim().startsWith("|")) {
    const cells = lines[i]
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.some((c) => c.replace(/[-:\s]/g, "").length > 0)) {
      rows.push(cells);
    }
    i++;
  }
  if (rows.length < 2) return { html: "", nextIndex: startIndex };
  const headers = rows[0];
  const bodyRows = rows.slice(2);
  const headerHtml = `<tr>${headers.map((h) => `<th class="border-b border-border bg-accent/50 px-3 py-1.5 text-left text-xs font-semibold">${inline(h)}</th>`).join("")}</tr>`;
  const bodyHtml = bodyRows
    .map(
      (row) =>
        `<tr>${row.map((c) => `<td class="border-b border-border px-3 py-1.5 text-sm">${inline(c)}</td>`).join("")}</tr>`,
    )
    .join("");
  return {
    html: `<table class="my-3 w-full border-collapse overflow-hidden rounded-md border border-border"><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table>`,
    nextIndex: i,
  };
}

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let inCode = false;
  let codeBuf: string[] = [];
  let codeLang = "";
  let inList = false;
  let inOrdered = false;

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    if (inOrdered) {
      out.push("</ol>");
      inOrdered = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (!inCode) {
        closeList();
        inCode = true;
        codeLang = line.slice(3).trim();
        codeBuf = [];
      } else {
        const highlighted = highlightCode(codeBuf.join("\n"), codeLang);
        out.push(
          `<pre class="my-3 overflow-x-auto rounded-md border border-border bg-surface-2 p-3 text-xs leading-relaxed"><code class="language-${escapeHtml(codeLang)} font-mono">${highlighted}</code></pre>`,
        );
        inCode = false;
      }
      i++;
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      i++;
      continue;
    }

    if (line.trim().startsWith("|")) {
      closeList();
      const { html, nextIndex } = parseTable(lines, i);
      if (html) {
        out.push(html);
        i = nextIndex;
        continue;
      }
    }

    if (line.startsWith("# ")) {
      closeList();
      out.push(
        `<h1 class="mt-6 text-2xl font-semibold tracking-tight">${inline(line.slice(2))}</h1>`,
      );
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      closeList();
      out.push(
        `<h2 class="mt-5 text-lg font-semibold tracking-tight">${inline(line.slice(3))}</h2>`,
      );
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      closeList();
      out.push(`<h3 class="mt-4 text-base font-semibold">${inline(line.slice(4))}</h3>`);
      i++;
      continue;
    }

    const ul = line.match(/^[-*]\s+(.*)/);
    const ol = line.match(/^\d+\.\s+(.*)/);
    const task = line.match(/^[-*]\s+\[([ x])\]\s+(.*)/);
    if (task) {
      if (inOrdered) {
        out.push("</ol>");
        inOrdered = false;
      }
      if (!inList) {
        out.push('<ul class="my-2 ml-5 list-disc space-y-1">');
        inList = true;
      }
      const checked = task[1].toLowerCase() === "x";
      out.push(
        `<li class="flex items-start gap-2"><span class="mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border border-border ${checked ? "bg-primary text-primary-foreground" : ""}">${checked ? "✓" : ""}</span><span>${inline(task[2])}</span></li>`,
      );
      i++;
      continue;
    }
    if (ul) {
      if (inOrdered) {
        out.push("</ol>");
        inOrdered = false;
      }
      if (!inList) {
        out.push('<ul class="my-2 ml-5 list-disc space-y-1">');
        inList = true;
      }
      out.push(`<li>${inline(ul[1])}</li>`);
      i++;
      continue;
    }
    if (ol) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      if (!inOrdered) {
        out.push('<ol class="my-2 ml-5 list-decimal space-y-1">');
        inOrdered = true;
      }
      out.push(`<li>${inline(ol[1])}</li>`);
      i++;
      continue;
    }

    if (line.startsWith("> ")) {
      closeList();
      out.push(
        `<blockquote class="my-3 border-l-2 border-primary/60 bg-accent/30 px-3 py-2 text-sm italic text-muted-foreground">${inline(
          line.slice(2),
        )}</blockquote>`,
      );
      i++;
      continue;
    }

    if (/^---+$/.test(line)) {
      closeList();
      out.push('<hr class="my-4 border-border" />');
      i++;
      continue;
    }

    if (line.trim() === "") {
      closeList();
      i++;
      continue;
    }

    closeList();
    out.push(`<p class="my-2 text-sm leading-relaxed text-pretty">${inline(line)}</p>`);
    i++;
  }
  closeList();
  return out.join("\n");
}
