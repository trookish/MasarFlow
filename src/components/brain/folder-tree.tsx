"use client";

import { useRef, useState } from "react";
import {
  Folder as FolderIcon,
  FolderPlus,
  Files,
  Inbox,
  X,
} from "lucide-react";
import type { Folder, Note } from "@/lib/db/schema";
import { cn } from "@/lib/utils/cn";

export type FolderFilter = "all" | "unfiled" | string;

interface FolderTreeProps {
  folders: Folder[];
  notes: Note[];
  selected: FolderFilter;
  onSelect: (filter: FolderFilter) => void;
  onCreateFolder: (name: string) => void;
  onDeleteFolder: (id: string) => void;
}

function Row({
  active,
  icon,
  label,
  count,
  onClick,
  onDelete,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count: number;
  onClick: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm",
        active
          ? "bg-accent font-medium text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
      onClick={onClick}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {onDelete ? (
        <button
          type="button"
          aria-label={`Delete ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="hidden text-muted-foreground group-hover:block hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <span className="text-xs text-muted-foreground tabular-nums">
        {count}
      </span>
    </div>
  );
}

export function FolderTree({
  folders,
  notes,
  selected,
  onSelect,
  onCreateFolder,
  onDeleteFolder,
}: FolderTreeProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  // Guards against the blur handler firing a second time after Enter/Escape
  // has already unmounted the input (the blur closure still holds the name).
  const done = useRef(false);

  const unfiledCount = notes.filter((n) => !n.folderId).length;

  function commit() {
    if (done.current) return;
    done.current = true;
    const trimmed = name.trim();
    if (trimmed) onCreateFolder(trimmed);
    setName("");
    setAdding(false);
  }

  function cancel() {
    done.current = true;
    setName("");
    setAdding(false);
  }

  function toggleAdder() {
    if (adding) {
      cancel();
    } else {
      done.current = false;
      setName("");
      setAdding(true);
    }
  }

  return (
    <div className="space-y-0.5 border-b border-border p-2">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-[10px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
          Folders
        </span>
        <button
          type="button"
          aria-label="New folder"
          onClick={toggleAdder}
          className="text-muted-foreground hover:text-foreground"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
      </div>

      <Row
        active={selected === "all"}
        icon={<Files className="h-4 w-4" />}
        label="All notes"
        count={notes.length}
        onClick={() => onSelect("all")}
      />
      {folders.map((f) => (
        <Row
          key={f.id}
          active={selected === f.id}
          icon={<FolderIcon className="h-4 w-4" />}
          label={f.name}
          count={notes.filter((n) => n.folderId === f.id).length}
          onClick={() => onSelect(f.id)}
          onDelete={() => onDeleteFolder(f.id)}
        />
      ))}
      <Row
        active={selected === "unfiled"}
        icon={<Inbox className="h-4 w-4" />}
        label="Unfiled"
        count={unfiledCount}
        onClick={() => onSelect("unfiled")}
      />

      {adding ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
          onBlur={commit}
          placeholder="Folder name…"
          className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none"
        />
      ) : null}
    </div>
  );
}
