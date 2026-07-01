"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { syncRepo } from "@/lib/db/repos";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { useObsidianStore } from "@/lib/stores/obsidian";
import { 
  OBSIDIAN_IMAGE_EXTENSIONS, 
  OBSIDIAN_VIDEO_EXTENSIONS, 
  OBSIDIAN_AUDIO_EXTENSIONS,
  OBSIDIAN_PDF_EXTENSIONS,
  fileExtension
} from "@/lib/sync";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/ui/empty-state";
import { FileIcon, ImageIcon, FileAudio, FileVideo, FileText } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";

export function FilesView() {
  const projectId = useActiveProjectId();
  const obsidian = useObsidianStore();
  const [search, setSearch] = useState("");

  const syncFiles = useLiveQuery(() => syncRepo.listByProject(projectId), [projectId]);

  const attachments = (syncFiles || []).filter(f => f.entityId?.startsWith("attachment:"));
  
  const filtered = attachments.filter(f => f.path.toLowerCase().includes(search.toLowerCase()));

  function getMediaUrl(path: string) {
    if (!obsidian.baseUrl || !obsidian.apiKey) return null;
    const url = new URL("/api/obsidian/media", window.location.origin);
    url.searchParams.set("baseUrl", obsidian.baseUrl);
    url.searchParams.set("apiKey", obsidian.apiKey);
    url.searchParams.set("path", path);
    return url.toString();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <h1 className="text-lg font-semibold">Vault Files & Attachments</h1>
        <Input 
          placeholder="Search files..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
      </div>

      <ScrollArea className="flex-1 p-6">
        {attachments.length === 0 ? (
          <EmptyState
            icon={FileIcon}
            title="No attachments synced"
            description="Sync your Obsidian vault to see images, videos, audio, and PDF files here."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((f) => {
              const ext = fileExtension(f.path);
              const mediaUrl = getMediaUrl(f.path);
              const name = f.path.split("/").pop() ?? f.path;

              const isImage = OBSIDIAN_IMAGE_EXTENSIONS.has(ext);
              const isVideo = OBSIDIAN_VIDEO_EXTENSIONS.has(ext);
              const isAudio = OBSIDIAN_AUDIO_EXTENSIONS.has(ext);
              const isPdf = OBSIDIAN_PDF_EXTENSIONS.has(ext);

              return (
                <Card key={f.id} className="overflow-hidden flex flex-col hover:border-primary/50 transition-colors">
                  <div className="bg-muted/30 aspect-square flex items-center justify-center border-b relative group">
                    {!mediaUrl ? (
                      <div className="text-sm text-muted-foreground p-4 text-center">
                        Configure Obsidian API key to preview
                      </div>
                    ) : isImage ? (
                      <img src={mediaUrl} alt={name} className="w-full h-full object-cover" loading="lazy" />
                    ) : isVideo ? (
                      <video src={mediaUrl} className="w-full h-full object-cover" preload="metadata" />
                    ) : isAudio ? (
                      <FileAudio className="w-12 h-12 text-muted-foreground opacity-50" />
                    ) : isPdf ? (
                      <FileText className="w-12 h-12 text-muted-foreground opacity-50" />
                    ) : (
                      <FileIcon className="w-12 h-12 text-muted-foreground opacity-50" />
                    )}
                    
                    {/* Hover overlay to open in new tab */}
                    {mediaUrl && (
                      <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                        <a href={mediaUrl} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline flex flex-col items-center gap-2">
                          {isVideo ? <FileVideo className="w-6 h-6" /> : isImage ? <ImageIcon className="w-6 h-6" /> : <FileIcon className="w-6 h-6" />}
                          Open in new tab
                        </a>
                      </div>
                    )}
                  </div>
                  <CardContent className="p-3">
                    <div className="font-medium text-sm truncate" title={name}>{name}</div>
                    <div className="text-xs text-muted-foreground truncate mt-1" title={f.path}>{f.path}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
