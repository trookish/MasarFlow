"use client";
import * as React from "react";
import { Image as ImageIcon, Music, Video, FileText, Download, Loader2, Mic } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Lightbox } from "./lightbox";
import { getCachedAttachment, formatBytes } from "@/lib/vault/attachments";
import { isImage, isVideo, isAudio, isPdf, isTextish, isDownloadable, detectMimeType } from "@/lib/vault/ignore-patterns";
import { useAi } from "@/lib/stores/ai";
import { toast } from "sonner";

export function AttachmentViewer({ projectId, relativePath, name }: { projectId: string; relativePath: string; name: string }) {
  const [src, setSrc] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [transcript, setTranscript] = React.useState<string | null>(null);
  const [transcribing, setTranscribing] = React.useState(false);
  const [lightbox, setLightbox] = React.useState(false);
  const provider = useAi((s) => s.provider);
  const apiKey = useAi((s) => s.apiKey);
  const mime = detectMimeType(name);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const cached = await getCachedAttachment(await hashPath(relativePath));
      if (cancelled) return;
      if (cached) { setSrc(cached.url); setLoading(false); return; }
      const att = await getAttachmentByPath(projectId, relativePath);
      if (cancelled) return;
      if (att?.blob) {
        const c = await getCachedAttachment(att.id);
        if (c) setSrc(c.url);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId, relativePath]);

  if (loading) return <div className="rounded-md border border-border bg-surface-2 p-3"><Skeleton className="h-32 w-full" /></div>;
  if (!src) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed border-border bg-card/40 p-2.5 text-[11px] text-muted-foreground">
        <FileText className="h-3.5 w-3.5" />{name}<span className="ml-auto text-[10px]">cached attachment not available</span>
      </div>
    );
  }

  if (isImage(name)) {
    return (
      <div className="overflow-hidden rounded-md border border-border bg-surface-2">
        <button onClick={() => setLightbox(true)} className="block w-full">
          <img src={src} alt={name} className="mx-auto max-h-96 object-contain" />
        </button>
        <div className="flex items-center gap-2 border-t border-border bg-card/60 p-1.5 text-[10px] text-muted-foreground">
          <ImageIcon className="h-3 w-3" />{name}<span className="ml-auto">{mime}</span>
        </div>
        <Lightbox open={lightbox} onOpenChange={setLightbox} src={src} alt={name} />
      </div>
    );
  }
  if (isVideo(name)) {
    return (
      <div className="rounded-md border border-border bg-surface-2">
        <video src={src} controls className="w-full rounded-md" />
        <div className="flex items-center gap-2 border-t border-border bg-card/60 p-1.5 text-[10px] text-muted-foreground"><Video className="h-3 w-3" />{name}<span className="ml-auto">{mime}</span></div>
      </div>
    );
  }
  if (isAudio(name)) {
    return (
      <div className="space-y-2 rounded-md border border-border bg-surface-2 p-2.5">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><Music className="h-3.5 w-3.5" />{name}<span className="ml-auto">{mime}</span></div>
        <audio src={src} controls className="w-full" />
        {provider !== "simulated" && apiKey && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="soft" disabled={transcribing} onClick={async () => { setTranscribing(true); setTranscript("Transcription requires a real LLM with audio input. (Provider: " + provider + ". Stub for v1.)"); setTranscribing(false); toast.info("Transcript stub", { description: "Wire your provider for real transcripts." }); }}>
              {transcribing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mic className="h-3 w-3" />}Transcribe
            </Button>
            {transcript && <span className="text-[11px] text-muted-foreground">{transcript}</span>}
          </div>
        )}
      </div>
    );
  }
  if (isPdf(name)) {
    return (
      <div className="rounded-md border border-border bg-surface-2">
        <iframe src={src} className="h-[480px] w-full rounded-md" title={name} />
        <div className="flex items-center gap-2 border-t border-border bg-card/60 p-1.5 text-[10px] text-muted-foreground"><FileText className="h-3 w-3" />{name}</div>
      </div>
    );
  }
  if (isTextish(name)) {
    return <TextPreview src={src} />;
  }
  if (isDownloadable(name)) {
    return (
      <a href={src} download={name} className="flex items-center gap-2 rounded-md border border-border bg-card/60 p-2.5 text-[11px] hover:bg-accent/30">
        <Download className="h-3.5 w-3.5" />{name}<Badge variant="ghost" className="ml-auto text-[10px]">download</Badge>
      </a>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card/60 p-2.5 text-[11px]"><FileText className="h-3.5 w-3.5" />{name}</div>
  );
}

function TextPreview({ src }: { src: string }) {
  const [text, setText] = React.useState<string | null>(null);
  React.useEffect(() => { (async () => { const r = await fetch(src); setText(await r.text()); })(); }, [src]);
  return (
    <pre className="max-h-72 overflow-auto rounded-md border border-border bg-surface-2 p-2.5 text-[11px] whitespace-pre-wrap">
      {text ?? "Loading..."}
    </pre>
  );
}

async function hashPath(p: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const enc = new TextEncoder().encode(p);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  }
  return "plain_" + p.length;
}

async function getAttachmentByPath(projectId: string, relativePath: string) {
  const { getAttachmentByPath: get } = await import("@/lib/vault/attachments");
  return get(projectId, relativePath);
}
