"use client";

import { memo, useState, useEffect, useCallback } from "react";
import {
  Handle,
  Position,
  NodeResizer,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import { Globe, Play, GitBranch, FileText, Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { usePageSettings } from "@/lib/stores/page-settings";
import type { WebNodeData } from "./types";
import { nodeColorStyle, detectWebKind, youtubeId } from "./types";
import { useIsLowDetail } from "../use-lod";

export type WebNodeType = Node<WebNodeData, "webNode">;

const KIND_ICON = {
  youtube: Play,
  video: Play,
  article: FileText,
  github: GitBranch,
  generic: Globe,
} as const;

interface EmbedMetadata {
  title?: string;
  description?: string;
  favicon?: string | null;
  thumbnail?: string | null;
  readerText?: string;
  siteName?: string;
}

function WebNodeComponent({
  id,
  data,
  selected,
}: NodeProps<WebNodeType>) {
  const [meta, setMeta] = useState<EmbedMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kind = data.kind ?? detectWebKind(data.url);
  const Icon = KIND_ICON[kind ?? "generic"] ?? Globe;
  const shadow = data.shadow !== false;
  const ytId = kind === "youtube" ? youtubeId(data.url) : null;
  const lodThreshold = usePageSettings((s) => s.canvas.lodThreshold);
  const lowDetail = useIsLowDetail(lodThreshold);

  const title = meta?.title ?? data.title ?? data.url;
  const description = meta?.description ?? data.description ?? "";
  const thumbnail = meta?.thumbnail ?? data.thumbnail ?? null;
  const favicon = meta?.favicon ?? data.favicon ?? null;
  const readerText = meta?.readerText ?? data.readerText ?? "";

  // For article/github/generic: fetch metadata via the server proxy.
  const fetchMeta = useCallback(async () => {
    if (kind === "youtube" || kind === "video") return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/canvas/embed?url=${encodeURIComponent(data.url)}`,
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as EmbedMetadata;
      setMeta(j);
      // Cache the metadata into the node data so it persists.
      data.onDataChange?.(id, {
        ...data,
        title: j.title ?? data.title,
        description: j.description ?? "",
        favicon: j.favicon ?? undefined,
        thumbnail: j.thumbnail ?? undefined,
        readerText: j.readerText ?? "",
        kind,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load embed");
    } finally {
      setLoading(false);
    }
  }, [data, id, kind]);

  // Auto-fetch metadata for article/github on first render if not cached.
  // fetchMeta's setState calls are inside an async function (after await), so
  // they run as microtasks, not synchronously in the effect body.
  useEffect(() => {
    if (
      (kind === "article" || kind === "github" || kind === "generic") &&
      !meta &&
      !data.readerText &&
      !loading &&
      !error
    ) {
      let cancelled = false;
      (async () => {
        if (!cancelled) await fetchMeta();
      })();
      return () => { cancelled = true; };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  // LOD: title + icon only when zoomed out — no iframe, no metadata fetch.
  if (lowDetail) {
    return (
      <div
        style={nodeColorStyle(data.color)}
        className={
          "flex h-full w-full items-center gap-1.5 overflow-hidden rounded-lg border border-border bg-card px-2 " +
          (shadow ? "shadow-sm " : "") +
          (selected ? "ring-2 ring-primary/40 " : "")
        }
      >
        <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5" />
        <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5" />
        <Icon className="h-3 w-3 shrink-0 text-primary" />
        <span className="truncate text-[10px]">{title}</span>
      </div>
    );
  }

  return (
    <>
      <NodeResizer
        isVisible={!!selected}
        minWidth={200}
        minHeight={120}
        lineClassName="!border-primary/40"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !border !border-primary !bg-background"
      />
      <div
        style={nodeColorStyle(data.color)}
        className={
          "flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow " +
          (shadow ? "shadow-sm " : "") +
          (selected ? "ring-2 ring-primary/40 " : "")
        }
      >
        <Handle type="target" position={Position.Left} className="!h-2 !w-2" />
        <Handle type="source" position={Position.Right} className="!h-2 !w-2" />
        <Handle type="target" position={Position.Top} className="!h-2 !w-2" />
        <Handle type="source" position={Position.Bottom} className="!h-2 !w-2" />

        {/* Header */}
        <div className="flex items-center gap-1.5 border-b border-border/50 px-2.5 py-1.5">
          <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
          {favicon && (
            <img src={favicon} alt="" className="h-3.5 w-3.5 rounded-sm" />
          )}
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{title}</span>
          <button
            type="button"
            onClick={() => void fetchMeta()}
            disabled={loading}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            title="Refresh metadata"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </button>
          <a
            href={data.url}
            target="_blank"
            rel="noreferrer"
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Open externally"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Body: kind-dependent */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {kind === "youtube" && ytId ? (
            <iframe
              src={`https://www.youtube.com/embed/${ytId}`}
              className="h-full w-full border-0"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={title}
            />
          ) : kind === "video" ? (
            <iframe
              src={data.url}
              className="h-full w-full border-0"
              allowFullScreen
              title={title}
            />
          ) : thumbnail ? (
            <div className="flex h-full flex-col">
              {thumbnail && (
                <img
                  src={thumbnail}
                  alt={title}
                  className="max-h-[60%] w-full object-cover"
                  loading="lazy"
                />
              )}
              <div className="min-h-0 flex-1 overflow-auto px-2.5 py-2 text-xs text-muted-foreground">
                {description || readerText.slice(0, 300) + (readerText.length > 300 ? "…" : "")}
              </div>
            </div>
          ) : loading ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading embed…
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground">
              <Globe className="h-6 w-6" />
              <span>Couldn&apos;t load: {error}</span>
              <a href={data.url} target="_blank" rel="noreferrer" className="text-primary underline">
                Open externally
              </a>
            </div>
          ) : readerText ? (
            <div className="h-full overflow-auto px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
              {readerText.slice(0, 1200)}
              {readerText.length > 1200 ? "…" : ""}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground">
              <Globe className="h-6 w-6" />
              <span className="truncate">{data.url}</span>
              <button
                type="button"
                onClick={() => void fetchMeta()}
                className="text-primary underline"
              >
                Load preview
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const WebNode = memo(WebNodeComponent);
