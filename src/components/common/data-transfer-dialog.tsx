"use client";
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, FileJson, AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { exportAll, importAll, downloadExport, type ExportShape } from "@/lib/data";
import { invalidateSearchIndex } from "@/lib/search";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DataTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "export" | "import" | "both";
}

export function DataTransferDialog({ open, onOpenChange, mode }: DataTransferDialogProps) {
  const [working, setWorking] = React.useState(false);
  const [parsed, setParsed] = React.useState<ExportShape | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [replace, setReplace] = React.useState(false);
  const [result, setResult] = React.useState<{
    ok: boolean;
    counts: Record<string, number>;
    error?: string;
  } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setParsed(null);
      setError(null);
      setResult(null);
      setReplace(false);
    }
  };

  const onExport = async () => {
    setWorking(true);
    try {
      const shape = await exportAll();
      downloadExport(shape);
      toast.success("Export ready", {
        description:
          Object.keys(shape.data).length +
          " tables, " +
          Object.values(shape.data).reduce((a, b) => a + b.length, 0) +
          " rows.",
      });
      onOpenChange(false);
    } catch (e) {
      toast.error("Export failed", { description: (e as Error).message });
    } finally {
      setWorking(false);
    }
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as ExportShape;
        if (!data || typeof data !== "object" || !data.data)
          throw new Error("Not a valid MasarFlow export.");
        setParsed(data);
      } catch (err) {
        setError((err as Error).message);
      }
    };
    reader.readAsText(file);
  };

  const onImport = async () => {
    if (!parsed) return;
    setWorking(true);
    try {
      const r = await importAll(parsed, { replace });
      setResult(r);
      invalidateSearchIndex();
      if (r.ok) {
        toast.success("Import complete", {
          description: Object.values(r.counts).reduce((a, b) => a + b, 0) + " rows imported.",
        });
      } else {
        toast.error("Import failed", { description: r.error });
      }
    } finally {
      setWorking(false);
    }
  };

  const showImport = mode === "import" || mode === "both";
  const showExport = mode === "export" || mode === "both";
  const isBoth = showImport && showExport;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="h-4 w-4" /> Data transfer
          </DialogTitle>
          <DialogDescription>
            Export everything to JSON, or import a previous export.{" "}
            {isBoth ? "Choose a tab below." : ""}
          </DialogDescription>
        </DialogHeader>

        {isBoth && !parsed && !result && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onExport}
              disabled={working}
              className={cn(
                "border-border bg-card hover:border-foreground/30 flex flex-col items-center gap-2 rounded-md border p-6 text-sm transition-colors",
                working && "opacity-60",
              )}
            >
              <Download className="h-6 w-6 text-[color:var(--primary)]" />
              <span className="font-medium">Export all data</span>
              <span className="text-muted-foreground text-[10px]">JSON file with all tables</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={working}
              className={cn(
                "border-border bg-card hover:border-foreground/30 flex flex-col items-center gap-2 rounded-md border p-6 text-sm transition-colors",
                working && "opacity-60",
              )}
            >
              <Upload className="h-6 w-6 text-[color:var(--info)]" />
              <span className="font-medium">Import from file</span>
              <span className="text-muted-foreground text-[10px]">JSON from a prior export</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={onPickFile}
              className="hidden"
            />
          </div>
        )}

        {showExport && !isBoth && (
          <div className="space-y-2">
            <div className="border-border bg-surface-2 text-muted-foreground rounded-md border p-3 text-xs">
              Exports all 18 tables (projects, notes, specs, tasks, standards, systems, arch nodes,
              arch edges, docs, dev logs, agents, commits, memories, links, tags, folders, plans,
              meta) as a single JSON file.
            </div>
            <Button onClick={onExport} disabled={working} className="w-full gap-2">
              <Download className="h-3.5 w-3.5" />
              {working ? "Exporting..." : "Download JSON"}
            </Button>
          </div>
        )}

        {showImport && !isBoth && (
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={onPickFile}
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="soft"
              className="w-full gap-2"
            >
              <Upload className="h-3.5 w-3.5" />
              Pick JSON file
            </Button>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-[color:var(--danger)]/30 bg-[color:var(--danger)]/10 p-3 text-xs text-[color:var(--danger)]">
            <AlertTriangle className="h-3.5 w-3.5" /> {error}
          </div>
        )}

        {parsed && (
          <div className="space-y-3">
            <div className="border-border bg-card rounded-md border p-3">
              <div className="mb-1 flex items-center gap-2 text-xs">
                <FileJson className="h-3.5 w-3.5" />
                <span className="font-medium">Parsed export</span>
                <Badge variant="outline" className="ml-auto">
                  v{parsed.version}
                </Badge>
              </div>
              <div className="text-muted-foreground text-[10px]">
                Exported {new Date(parsed.exportedAt).toLocaleString()} -{" "}
                {Object.keys(parsed.data).length} tables -{" "}
                {Object.values(parsed.data).reduce((a, b) => a + b.length, 0)} rows
              </div>
              <div className="mt-2 grid max-h-40 grid-cols-3 gap-1 overflow-y-auto text-[10px]">
                {Object.entries(parsed.data).map(([k, v]) => (
                  <div
                    key={k}
                    className="bg-surface-2 flex items-center justify-between rounded-sm px-1.5 py-1"
                  >
                    <span className="text-muted-foreground font-mono">{k}</span>
                    <span className="font-mono">{v.length}</span>
                  </div>
                ))}
              </div>
            </div>
            <label className="border-border flex items-center gap-2 rounded-md border p-2.5 text-xs">
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
                className="accent-primary"
              />
              <Trash2 className="h-3.5 w-3.5 text-[color:var(--danger)]" />
              <span>Replace existing data (otherwise merge by primary key)</span>
            </label>
            <div className="flex items-center gap-2">
              <Button onClick={onImport} disabled={working} className="flex-1 gap-2">
                <Upload className="h-3.5 w-3.5" />
                {working
                  ? "Importing..."
                  : "Import " +
                    Object.values(parsed.data).reduce((a, b) => a + b.length, 0) +
                    " rows"}
              </Button>
              <Button variant="ghost" onClick={() => setParsed(null)}>
                Back
              </Button>
            </div>
          </div>
        )}

        {result && (
          <div
            className={
              "rounded-md border p-3 text-xs " +
              (result.ok
                ? "border-[color:var(--success)]/30 bg-[color:var(--success)]/10"
                : "border-[color:var(--danger)]/30 bg-[color:var(--danger)]/10")
            }
          >
            <div className="mb-1 flex items-center gap-2">
              {result.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-[color:var(--success)]" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-[color:var(--danger)]" />
              )}
              <span className="font-medium">
                {result.ok ? "Import succeeded" : "Import failed"}
              </span>
            </div>
            {result.error && <div className="text-[10px]">{result.error}</div>}
            {result.ok && (
              <div className="mt-1 grid grid-cols-3 gap-1 text-[10px]">
                {Object.entries(result.counts)
                  .slice(0, 9)
                  .map(([k, v]) => (
                    <div
                      key={k}
                      className="bg-card/60 flex items-center justify-between rounded-sm px-1.5 py-0.5"
                    >
                      <span className="font-mono">{k}</span>
                      <span className="font-mono">{v}</span>
                    </div>
                  ))}
              </div>
            )}
            <Button onClick={() => onOpenChange(false)} className="mt-2 w-full">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
