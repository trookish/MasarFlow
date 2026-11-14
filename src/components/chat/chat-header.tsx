"use client";

import {
  BackendSwitch,
  CatalogModelMenu,
  EffortSelector,
  ModeToggle,
} from "./chat-controls";
import { Sparkles, FolderGit2 } from "lucide-react";
import { chatThreadsRepo } from "@/lib/db/repos";
import type { ChatThread, ChatBackend, AiConnection } from "@/lib/db/schema";
import {
  modelsForProvider,
  type Catalog,
  type AiProvider,
} from "@/lib/ai/catalog";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { UnifiedModelPicker } from "./model-picker";
import type { LinkedProject } from "@/lib/db/schema";
import type { ToolViewMode } from "@/lib/chat/tool-groups";
import { ToolViewSwitch } from "./tool-view-switch";

export function ChatHeader({
  thread,
  backend,
  mode,
  connections,
  catalog,
  apiConnection,
  ollamaProvider,
  activeCanReason,
  linkedRoots,
  modelPickerOpen,
  setModelPickerOpen,
  setConnDialog,
  setLinkDialog,
  switchBackend,
  toolView,
  onToolViewChange,
}: {
  thread: ChatThread;
  backend: ChatBackend;
  mode: "agentic" | "chat";
  connections: AiConnection[];
  catalog: Catalog | null;
  apiConnection: AiConnection | null;
  ollamaProvider: AiProvider | null;
  activeCanReason: boolean;
  linkedRoots: LinkedProject[] | undefined;
  modelPickerOpen: boolean;
  setModelPickerOpen: (open: boolean) => void;
  setConnDialog: (open: boolean) => void;
  setLinkDialog: (open: boolean) => void;
  switchBackend: (next: ChatBackend) => Promise<void>;
  toolView: ToolViewMode;
  onToolViewChange: (mode: ToolViewMode) => void;
}) {
  return (
    <>
      {/* Header: backend + provider/model + mode + linked projects.
               No overflow here — an overflow container would clip the open
               provider/model dropdowns (they anchor with position:absolute). */}
      <div className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <BackendSwitch
          backend={backend}
          onChange={(b) => void switchBackend(b)}
        />

        {backend === "api" && (
          <UnifiedModelPicker
            connections={connections}
            catalog={catalog}
            connectionId={apiConnection?.id ?? thread.connectionId}
            modelId={thread.modelId}
            open={modelPickerOpen}
            onOpenChange={setModelPickerOpen}
            onSelect={(choice) => chatThreadsRepo.update(thread.id, choice)}
            onManageConnections={() => setConnDialog(true)}
          />
        )}

        {backend === "ollama" && (
          <CatalogModelMenu
            models={ollamaProvider ? modelsForProvider(ollamaProvider) : []}
            value={thread.modelId}
            offline={
              !ollamaProvider || Object.keys(ollamaProvider.models).length === 0
            }
            onChange={(m) => chatThreadsRepo.update(thread.id, { modelId: m })}
          />
        )}

        <ModeToggle
          mode={mode}
          onChange={(m) => chatThreadsRepo.update(thread.id, { mode: m })}
        />

        <EffortSelector
          effort={thread.effort ?? "off"}
          canReason={activeCanReason}
          onChange={(e) => chatThreadsRepo.update(thread.id, { effort: e })}
        />

        {mode === "agentic" && (
          <Tooltip
            label={
              linkedRoots?.length
                ? `Linked projects: ${linkedRoots.map((r) => r.name).join(", ")} — the AI can read them freely and asks before writes/commands`
                : "Link an external project folder (e.g. a web app, a Unity game, or any codebase) — the AI's filesystem tools (fs_list/fs_read/fs_search/fs_write/shell_run) then run in it. Without a link only the workspace tools are available."
            }
            side="bottom"
          >
            <Button
              variant={linkedRoots?.length ? "default" : "outline"}
              size="icon-sm"
              aria-label="Linked projects"
              onClick={() => setLinkDialog(true)}
            >
              <FolderGit2 className="h-4 w-4" />
            </Button>
          </Tooltip>
        )}

        <ToolViewSwitch value={toolView} onChange={onToolViewChange} />

        <span
          className="ml-auto hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground lg:inline-flex"
          title={
            mode === "agentic"
              ? "Every turn is grounded in your live workspace and the assistant can read, write, and run commands via tools."
              : "Direct conversation with the model — no workspace context is sent."
          }
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          {mode === "agentic"
            ? `Agentic${linkedRoots?.length ? ` · +${linkedRoots.length} linked` : ""}`
            : "Direct chat"}
        </span>
      </div>
    </>
  );
}
