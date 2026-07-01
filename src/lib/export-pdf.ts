import { createElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Export to PDF plugin: renders markdown to a print-styled window and invokes
 * the browser's print dialog (Save as PDF). No server round-trip — the
 * document is produced entirely from the real note/doc content.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const PRINT_CSS = `
  * { box-sizing: border-box; }
  body {
    font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;
    color: #1a1a1a; max-width: 760px; margin: 0 auto; padding: 40px 32px;
    line-height: 1.6; font-size: 14px;
  }
  h1.doc-title { font-size: 26px; margin: 0 0 4px; }
  .doc-meta { color: #777; font-size: 12px; margin-bottom: 24px; }
  h1 { font-size: 22px; margin: 24px 0 8px; }
  h2 { font-size: 18px; margin: 20px 0 8px; }
  h3 { font-size: 15px; margin: 16px 0 6px; }
  p, ul, ol { margin: 8px 0; }
  li { margin: 3px 0; }
  code { background: #f2f2f2; border-radius: 3px; padding: 1px 4px; font-size: 12px; font-family: ui-monospace, Consolas, monospace; }
  pre { background: #f6f6f6; border: 1px solid #e2e2e2; border-radius: 6px; padding: 12px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #ddd; margin: 12px 0; padding-left: 12px; color: #555; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  img { max-width: 100%; }
  a { color: #4338ca; }
  @media print { body { padding: 0; } }
`;

/** Render markdown into a new window and open the print (Save as PDF) dialog. */
export async function exportMarkdownToPdf(
  title: string,
  markdown: string,
  meta = "",
): Promise<void> {
  // react-dom/server is only needed here — load it on demand.
  const { renderToStaticMarkup } = await import("react-dom/server");
  const body = renderToStaticMarkup(
    createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, markdown),
  );

  const win = window.open("", "_blank", "width=840,height=1000");
  if (!win) {
    throw new Error("Could not open the print window — allow popups for this site.");
  }
  win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
  <h1 class="doc-title">${escapeHtml(title)}</h1>
  ${meta ? `<div class="doc-meta">${escapeHtml(meta)}</div>` : ""}
  ${body}
  <script>window.addEventListener("load", () => setTimeout(() => window.print(), 150));</script>
</body>
</html>`);
  win.document.close();
  win.focus();
}
