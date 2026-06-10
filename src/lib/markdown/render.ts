function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inline(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  s = s.replace(
    /\[\[([^\[\]\n]+?)\]\]/g,
    (_m, title: string) =>
      `<a class="wikilink rounded px-1 text-primary underline-offset-2 hover:underline" data-wikilink="${escapeHtml(
        title.trim(),
      )}" href="#">${escapeHtml(title.trim())}</a>`,
  );
  s = s.replace(
    /\[([^\]]+)\]\((https?:[^)]+)\)/g,
    '<a class="text-primary underline-offset-2 hover:underline" target="_blank" rel="noreferrer" href="$2">$1</a>',
  );
  return s;
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
  let listBuf: string[] = [];

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    if (inOrdered) {
      out.push("</ol>");
      inOrdered = false;
    }
    listBuf = [];
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
        out.push(
          `<pre class="my-3 overflow-x-auto rounded-md border border-border bg-surface-2 p-3 text-xs leading-relaxed"><code class="language-${escapeHtml(
            codeLang,
          )} font-mono">${escapeHtml(codeBuf.join("\n"))}</code></pre>`,
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

    if (line.startsWith("# ")) {
      closeList();
      out.push(`<h1 class="mt-6 text-2xl font-semibold tracking-tight">${inline(line.slice(2))}</h1>`);
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      closeList();
      out.push(`<h2 class="mt-5 text-lg font-semibold tracking-tight">${inline(line.slice(3))}</h2>`);
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
