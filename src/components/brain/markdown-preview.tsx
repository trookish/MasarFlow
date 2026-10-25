"use client";

import type { ComponentProps, ReactNode } from "react";
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { cn } from "@/lib/utils/cn";
import { usePlugin, settingStr } from "@/lib/plugins-runtime";
import { usePageSettings } from "@/lib/stores/page-settings";
import { MermaidBlock } from "./mermaid-block";
import { CodeBlock } from "@/components/chat/code-block";
import { useObsidianStore } from "@/lib/stores/obsidian";
import {
  OBSIDIAN_VIDEO_EXTENSIONS,
  OBSIDIAN_AUDIO_EXTENSIONS,
  OBSIDIAN_PDF_EXTENSIONS,
  fileExtension,
} from "@/lib/sync";
import { markdownUrlTransform } from "@/lib/utils/markdown-url";
import { parseEntityUri } from "@/lib/entities/registry";
import { EntityChip } from "@/components/entities/entity-chip";
import { useObsidianMediaUrl } from "@/lib/obsidian-media";

/** Rewrite `[[Target]]` / `[[Target|Alias]]` into links with a wikilink scheme. */
function preprocessWikilinks(markdown: string): string {
  return markdown.replace(/\[\[([^\]]+?)\]\]/g, (_match, inner: string) => {
    const pipe = inner.indexOf("|");
    const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
    const alias = pipe === -1 ? target : inner.slice(pipe + 1).trim();
    return `[${alias}](wikilink:${encodeURIComponent(target)})`;
  });
}

interface MarkdownPreviewProps {
  content: string;
  /** Invoked when a wikilink is clicked, with the target note title. */
  onWikilink?: (title: string) => void;
  /**
   * Returns true when a `[[title]]` matches no note. Unresolved links render as a "Create note"
   * action instead of a link (saving a note never creates notes; following the link does).
   */
  isUnresolved?: (title: string) => boolean;
  /** When provided, code blocks get a "save as note" action. */
  onSaveCodeAsNote?: (code: string, language: string) => void;
  className?: string;
}

/**
 * Memoized so that while a chat reply streams (new `content` every chunk),
 * only the streaming row re-parses — every other message in the thread keeps
 * its rendered output instead of re-running markdown + syntax highlighting.
 * Callbacks are ignored by the comparator: their behavior is stable across
 * renders, only their identity changes.
 */
export const MarkdownPreview = memo(
  function MarkdownPreview({
    content,
    onWikilink,
    isUnresolved,
    onSaveCodeAsNote,
    className,
  }: MarkdownPreviewProps) {
  const processed = preprocessWikilinks(content);
  const obsidian = useObsidianStore();
  const mermaid = usePlugin("mermaid-diagrams");
  // Syntax highlighting is user-configurable (Settings → Chat). It applies to
  // every markdown surface this component renders: chat replies, note previews,
  // dev logs, agent output.
  const codeHighlighting = usePageSettings((s) => s.chat.codeHighlighting);
  const rehypePlugins = (
    codeHighlighting
      ? [[rehypeHighlight, { detect: false, ignoreMissing: true }]]
      : []
  ) as ComponentProps<typeof ReactMarkdown>["rehypePlugins"];

  /** Extract raw text from a rendered <code> child tree. */
  function codeText(node: ReactNode): string {
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map(codeText).join("");
    if (node && typeof node === "object" && "props" in node) {
      return codeText((node.props as { children?: ReactNode }).children);
    }
    return "";
  }

  const mediaUrl = useObsidianMediaUrl(obsidian.baseUrl, obsidian.apiKey);
  const getMediaUrl = (path: string) => mediaUrl(path) ?? path;

  return (
    <div
      className={cn(
        "text-sm leading-relaxed text-foreground",
        "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-semibold",
        "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold",
        "[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-base [&_h3]:font-semibold",
        "[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_li]:my-0.5",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        "[&_hr]:my-4 [&_hr]:border-border",
        "[&_table]:my-3 [&_table]:w-full [&_table]:text-left [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={markdownUrlTransform}
        rehypePlugins={rehypePlugins}
        components={{
          pre({ children, ...props }) {
            const child = Array.isArray(children) ? children[0] : children;
            const cls =
              child && typeof child === "object" && "props" in child
                ? String(
                    (child.props as { className?: string }).className ?? "",
                  )
                : "";
            // Mermaid plugin: render ```mermaid blocks as live diagrams.
            if (mermaid.active && cls.includes("language-mermaid")) {
              return (
                <MermaidBlock
                  code={codeText(children).trim()}
                  theme={settingStr(mermaid.settings, "theme", "dark")}
                />
              );
            }
            const language = /language-([\w-]+)/.exec(cls)?.[1] ?? "text";
            return (
              <CodeBlock
                language={language}
                rawText={codeText(children).replace(/\n$/, "")}
                onSaveAsNote={onSaveCodeAsNote}
                {...props}
              >
                {children}
              </CodeBlock>
            );
          },
          img({ src, alt }) {
            if (typeof src === "string" && src.startsWith("wikilink:")) {
              const target = decodeURIComponent(src.slice("wikilink:".length));
              const ext = fileExtension(target);
              const mediaUrl = getMediaUrl(target);

              if (OBSIDIAN_VIDEO_EXTENSIONS.has(ext)) {
                return (
                  <video
                    controls
                    className="w-full max-w-2xl rounded-md border my-4"
                  >
                    <source src={mediaUrl} />
                    Your browser does not support the video tag.
                  </video>
                );
              }
              if (OBSIDIAN_AUDIO_EXTENSIONS.has(ext)) {
                return (
                  <audio controls className="w-full max-w-md my-4">
                    <source src={mediaUrl} />
                    Your browser does not support the audio element.
                  </audio>
                );
              }
              if (OBSIDIAN_PDF_EXTENSIONS.has(ext)) {
                return (
                  <iframe
                    src={mediaUrl}
                    className="w-full h-[600px] rounded-md border my-4"
                    title={alt || "PDF Document"}
                  />
                );
              }
              // Default to image
              return (
                <img
                  src={mediaUrl}
                  alt={alt}
                  className="max-w-full rounded-md border my-4"
                />
              );
            }
            return (
              <img
                src={src as string}
                alt={alt}
                className="max-w-full rounded-md border my-4"
              />
            );
          },
          a({ href, children, ...props }) {
            if (typeof href === "string" && href.startsWith("entity:")) {
              const ref = parseEntityUri(href);
              if (ref) return <EntityChip entity={ref} />;
            }
            if (typeof href === "string" && href.startsWith("wikilink:")) {
              const title = decodeURIComponent(href.slice("wikilink:".length));
              if (isUnresolved?.(title)) {
                return (
                  <button
                    type="button"
                    data-wikilink-unresolved=""
                    className="cursor-pointer font-medium text-muted-foreground underline decoration-dashed underline-offset-2 hover:text-foreground"
                    title={`No note named “${title}” yet. Select to create it.`}
                    aria-label={`Create note ${title}`}
                    onClick={() => onWikilink?.(title)}
                  >
                    {children}
                  </button>
                );
              }
              return (
                <button
                  type="button"
                  className="cursor-pointer font-medium text-primary underline underline-offset-2"
                  onClick={() => onWikilink?.(title)}
                >
                  {children}
                </button>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer" {...props}>
                {children}
              </a>
            );
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
  },
  (prev, next) =>
    prev.content === next.content &&
    prev.className === next.className &&
    // Identity changes only when the note set does (memoized by the caller).
    prev.isUnresolved === next.isUnresolved,
);
