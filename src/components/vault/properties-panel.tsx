"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { PropValue } from "@/lib/db/schema";
import {
  addPropRow, fromPropRows, removePropRow, renamePropRow, setPropValue, toPropRows, type PropRow,
} from "@/lib/vault/props";
import { Input } from "@/components/ui/input";
import { VaultPathHint } from "./vault-path-hint";

/** The one property editor: frontmatter, in the editor, for every entity kind. */
export function PropertiesPanel({
  props,
  onChange,
  entityId,
  disabled = false,
}: {
  props: Record<string, PropValue> | undefined;
  onChange: (next: Record<string, PropValue>) => void;
  /** The entity whose mirrored file the footer hint points at. */
  entityId: string;
  disabled?: boolean;
}) {
  const [rows, setRows] = useState<PropRow[]>(() => toPropRows(props));
  // Re-sync when the `props` prop changes identity from outside (React's
  // "adjusting state when props change" pattern — setState during render, not
  // in an effect, which the hooks lint forbids).
  const [syncedProps, setSyncedProps] = useState(props);
  if (props !== syncedProps) {
    setSyncedProps(props);
    setRows(toPropRows(props));
  }

  const commit = (next: PropRow[]): void => {
    setRows(next);
    onChange(fromPropRows(next));
  };
  const display = (row: PropRow): string => (Array.isArray(row.value) ? row.value.join(", ") : String(row.value));

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Properties</span>
        <button
          type="button"
          disabled={disabled}
          aria-label="Add property"
          onClick={() => commit(addPropRow(rows))}
          className="text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No properties yet — they become frontmatter in the mirrored file.</p>
      ) : null}
      {rows.map((row, index) => (
        <div key={`${row.key}-${index}`} className="flex items-center gap-2">
          <Input
            value={row.key}
            disabled={disabled}
            onChange={(e) => setRows(renamePropRow(rows, index, e.target.value))}
            onBlur={() => commit(rows)}
            placeholder="key"
            className="h-7 w-32 text-xs"
          />
          <Input
            value={display(row)}
            disabled={disabled}
            onChange={(e) => setRows(setPropValue(rows, index, e.target.value))}
            onBlur={() => commit(rows)}
            placeholder={row.kind === "list" ? "a, b" : "value"}
            className="h-7 flex-1 text-xs"
          />
          <span className="w-14 text-xs text-muted-foreground">{row.kind}</span>
          <button
            type="button"
            disabled={disabled}
            aria-label={`Remove property ${row.key || index + 1}`}
            onClick={() => commit(removePropRow(rows, index))}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <VaultPathHint entityId={entityId} />
    </div>
  );
}
