"use client";

import { memo, useState, useEffect, useCallback } from "react";
import { Handle, Position, NodeResizer, type NodeProps, type Node } from "@xyflow/react";
import { FileImage, FileVideo, FileAudio, FileText, FileIcon, ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { uuid } from "@/lib/utils/ids";
import { usePageSettings } from "@/lib/stores/page-settings";
import type { MediaNodeData } from "./types";
import { nodeColorStyle } from "./types";
import { useIsLowDetail } from "../use-lod";
import {
  OBSIDIAN_IMAGE_EXTENSIONS,
  OBSIDIAN_VIDEO_EXTENSIONS,
  OBSIDIAN_AUDIO_EXTENSIONS,
  OBSIDIAN_PDF_EXTENSIONS,
  fileExtension,
} from "@/lib/sync";

export type MediaNodeType = Node<MediaNodeData, "mediaNode">;

function mediaKind(mimeType?: string, name?: string): "image" | "video" | "audio" | "pdf" | "file" {
  const ext = name ? fileExtension(name) : "";
  if (mimeType?.startsWith("image/") || OBSIDIAN_IMAGE_EXTENSIONS.has(ext)) return "image";
  if (mimeType?.startsWith("video/") || OBSIDIAN_VIDEO_EXTENSIONS.has(ext)) return "video";
  if (mimeType?.startsWith("audio/") || OBSIDIAN_AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (mimeType === "application/pdf" || OBSIDIAN_PDF_EXTENSIONS.has(ext)) return "pdf";
  return "file";
}

const KIND_ICON = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  pdf: FileText,
  file: FileIcon,
} as const;

function MediaNodeComponent({
  data,
  selected,
}: NodeProps<MediaNodeType>) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const kind = mediaKind(data.mimeType, data.name);
  const Icon = KIND_ICON[kind];
  const shadow = data.shadow !== false;
  const lodThreshold = usePageSettings((s) => s.canvas.lodThreshold);
  const lowDetail = useIsLowDetail(lodThreshold);

  // Lazily load the attachment blob from IndexedDB (only when the card is
  // visible — we don't want to pull 100 PDFs into memory at once).
  const loadBlob = useCallback(async () => {
    if (!data.attachmentId || blobUrl) return;
    setLoading(true);
    try {
      const att = await db.attachments.get(data.attachmentId);
      if (att?.blob) {
        const url = URL.createObjectURL(att.blob);
        setBlobUrl(url);
      }
    } finally {
      setLoading(false);
    }
  }, [data.attachmentId, blobUrl]);

  // Auto-load images (small, instant). Other media loads on click.
  // loadBlob's first setState (setLoading) is inside an async function, so it
  // runs as a microtask — not synchronously in the effect body.
  useEffect(() => {
    if (kind === "image") {
      let cancelled = false;
      (async () => {
        if (cancelled) return;
        await loadBlob();
      })();
      return () => { cancelled = true; };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  // Revoke blob URL on unmount.
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  // LOD: icon + name only when zoomed out — no blob loading, no media rendering.
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
        <span className="truncate text-[10px]">{data.name}</span>
      </div>
    );
  }

  return (
    <>
      <NodeResizer
        isVisible={!!selected}
        minWidth={140}
        minHeight={100}
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

        {/* Header */}
        <div className="flex items-center gap-1.5 border-b border-border/50 px-2.5 py-1.5">
          <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{data.name}</span>
          {blobUrl && (
            <a
              href={blobUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Open in new tab"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {/* Media body */}
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/20">
          {data.dataUrl && kind === "image" ? (
            <img
              src={data.dataUrl}
              alt={data.name}
              className="h-full w-full object-contain"
              loading="lazy"
            />
          ) : blobUrl ? (
            kind === "image" ? (
              <img src={blobUrl} alt={data.name} className="h-full w-full object-contain" loading="lazy" />
            ) : kind === "video" ? (
              <video src={blobUrl} controls className="h-full w-full object-contain" preload="metadata" />
            ) : kind === "audio" ? (
              <div className="flex w-full flex-col items-center gap-2 p-3">
                <FileAudio className="h-8 w-8 text-muted-foreground" />
                <audio src={blobUrl} controls className="w-full" />
              </div>
            ) : kind === "pdf" ? (
              <iframe src={blobUrl} className="h-full w-full border-0" title={data.name} />
            ) : (
              <div className="flex flex-col items-center gap-2 p-4 text-xs text-muted-foreground">
                <FileIcon className="h-8 w-8" />
                <span>{data.name}</span>
                <a href={blobUrl} download={data.name} className="text-primary underline">Download</a>
              </div>
            )
          ) : loading ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : (
            <button
              type="button"
              onClick={() => void loadBlob()}
              className="flex flex-col items-center gap-2 p-4 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Icon className="h-8 w-8" />
              <span>Click to load {data.name}</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export const MediaNode = memo(MediaNodeComponent);

/* ── Attachment creation helper (OS drag-drop + files page) ───────────────── */

/**
 * Create an Attachment record from an OS-dropped File, then return the data
 * payload for a media canvas node.
 */
export async function fileToMediaNodeData(file: File): Promise<{
  attachmentId: string;
  name: string;
  mimeType: string;
  dataUrl?: string;
}> {
  const attachmentId = uuid();
  const projectId = await db.projects.orderBy("updatedAt").last().then((p) => p?.id);

  // For images, generate a downscaled data URL for instant preview.
  let dataUrl: string | undefined;
  if (file.type.startsWith("image/") && file.size < 4_000_000) {
    dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  }

  if (projectId) {
    await db.attachments.add({
      id: attachmentId,
      projectId,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      blob: file,
      createdAt: Date.now(),
    });
  }

  return { attachmentId, name: file.name, mimeType: file.type, dataUrl };
}
