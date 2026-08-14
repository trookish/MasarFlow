"use client";

import { useCallback } from "react";
import {
  Type,
  FileText,
  Globe,
  Box,
  Copy,
  Trash2,
  Lock,
  Unlock,
  BringToFront,
  SendToBack,
  Palette,
  AlignStartVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignEndHorizontal,
  AlignCenterVertical,
  AlignCenterHorizontal,
  AlignHorizontalSpaceBetween,
  AlignVerticalSpaceBetween,
  LayoutGrid,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuLabel,
} from "@/components/ui/context-menu";
import { NODE_COLOR_HEX } from "./nodes/types";

type Coords = { x: number; y: number } | null;

interface CanvasContextMenuProps {
  coords: Coords;
  onClose: () => void;
  // Empty-canvas actions
  onAddText: (pos: Coords) => void;
  onAddNote: () => void;
  onAddWeb: () => void;
  onAddGroup: () => void;
  // Object actions
  targetNode: { id: string; type: string } | null;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onChangeColor: (id: string, color: string) => void;
  onToggleLock: (id: string) => void;
  onBringForward: (id: string) => void;
  onSendBackward: (id: string) => void;
  locked: boolean;
  // Multi-select actions
  multiSelect: boolean;
  selectedCount: number;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (axis: "h" | "v") => void;
  onAutoGrid: () => void;
  /** Wrap the current selection in a group. */
  onGroupSelection: () => void;
  /** Detach children from a group and remove it. */
  onUngroup: (groupId: string) => void;
}

export type AlignMode =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "centerH"
  | "centerV";

export function CanvasContextMenu({
  coords,
  onClose,
  onAddText,
  onAddNote,
  onAddWeb,
  onAddGroup,
  targetNode,
  onDuplicate,
  onDelete,
  onChangeColor,
  onToggleLock,
  onBringForward,
  onSendBackward,
  locked,
  multiSelect,
  selectedCount,
  onAlign,
  onDistribute,
  onAutoGrid,
  onGroupSelection,
  onUngroup,
}: CanvasContextMenuProps) {
  const handleClose = useCallback(() => onClose(), [onClose]);

  // Multi-select menu
  if (multiSelect && selectedCount >= 2) {
    return (
      <ContextMenu coords={coords} onClose={handleClose} className="w-56">
        <ContextMenuLabel>{selectedCount} objects selected</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuLabel>Align</ContextMenuLabel>
        <ContextMenuItem onSelect={() => onAlign("left")}>
          <AlignStartVertical className="h-4 w-4" /> Align left
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onAlign("right")}>
          <AlignEndVertical className="h-4 w-4" /> Align right
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onAlign("top")}>
          <AlignStartHorizontal className="h-4 w-4" /> Align top
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onAlign("bottom")}>
          <AlignEndHorizontal className="h-4 w-4" /> Align bottom
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onAlign("centerH")}>
          <AlignCenterVertical className="h-4 w-4" /> Center horizontally
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onAlign("centerV")}>
          <AlignCenterHorizontal className="h-4 w-4" /> Center vertically
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuLabel>Distribute</ContextMenuLabel>
        <ContextMenuItem onSelect={() => onDistribute("h")}>
          <AlignHorizontalSpaceBetween className="h-4 w-4" /> Equal horizontal spacing
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onDistribute("v")}>
          <AlignVerticalSpaceBetween className="h-4 w-4" /> Equal vertical spacing
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onAutoGrid}>
          <LayoutGrid className="h-4 w-4" /> Auto-arrange grid
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onGroupSelection}>
          <Box className="h-4 w-4" /> Group selection
        </ContextMenuItem>
      </ContextMenu>
    );
  }

  // Object menu
  if (targetNode) {
    return (
      <ContextMenu coords={coords} onClose={handleClose} className="w-56">
        <ContextMenuLabel>
          {targetNode.type === "note" ? "Note card" :
           targetNode.type === "group" ? "Group" :
           targetNode.type === "media" ? "Media" :
           targetNode.type === "link" ? "Web page" : "Text card"}
        </ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onDuplicate(targetNode.id)}>
          <Copy className="h-4 w-4" /> Duplicate
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onDelete(targetNode.id)} variant="destructive">
          <Trash2 className="h-4 w-4" /> Delete
        </ContextMenuItem>
        <ContextMenuSeparator />
        {targetNode.type === "group" ? (
          <>
            <ContextMenuItem onSelect={() => onUngroup(targetNode.id)}>
              <Box className="h-4 w-4" /> Ungroup
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : null}
        <ContextMenuItem onSelect={() => onToggleLock(targetNode.id)}>
          {locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          {locked ? "Unlock" : "Lock"}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onBringForward(targetNode.id)}>
          <BringToFront className="h-4 w-4" /> Bring forward
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onSendBackward(targetNode.id)}>
          <SendToBack className="h-4 w-4" /> Send backward
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ColorSubmenu onChange={(c) => onChangeColor(targetNode.id, c)} />
      </ContextMenu>
    );
  }

  // Empty-canvas menu
  return (
    <ContextMenu coords={coords} onClose={handleClose} className="w-56">
      <ContextMenuLabel>Add to canvas</ContextMenuLabel>
      <ContextMenuItem onSelect={() => onAddText(coords)}>
        <Type className="h-4 w-4" /> New text card
      </ContextMenuItem>
      <ContextMenuItem onSelect={onAddNote}>
        <FileText className="h-4 w-4" /> Add note
      </ContextMenuItem>
      <ContextMenuItem onSelect={onAddWeb}>
        <Globe className="h-4 w-4" /> Add web page
      </ContextMenuItem>
      <ContextMenuItem onSelect={onAddGroup}>
        <Box className="h-4 w-4" /> Create group
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuLabel>Organize</ContextMenuLabel>
      <ContextMenuItem onSelect={onAutoGrid}>
        <LayoutGrid className="h-4 w-4" /> Auto-arrange all
      </ContextMenuItem>
    </ContextMenu>
  );
}

/* ── Color submenu (inline palette) ───────────────────────────────────────── */

function ColorSubmenu({ onChange }: { onChange: (color: string) => void }) {
  return (
    <div className="px-2 py-1.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Palette className="h-3.5 w-3.5" /> Color
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange("")}
          className="h-6 w-6 rounded-md border border-border bg-card transition-transform hover:scale-110"
          title="Default"
        />
        {Object.entries(NODE_COLOR_HEX).map(([key, hex]) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            style={{ backgroundColor: hex }}
            className="h-6 w-6 rounded-md transition-transform hover:scale-110"
            title={hex}
          />
        ))}
      </div>
    </div>
  );
}
