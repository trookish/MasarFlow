"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, FileDown } from "lucide-react";
import { docsRepo } from "@/lib/db/repos";
import type { Doc } from "@/lib/db/schema";
import { usePlugin, settingStr } from "@/lib/plugins-runtime";
import { exportMarkdownToPdf } from "@/lib/export-pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarkdownPreview } from "@/components/brain/markdown-preview";
import { RichMarkdownEditor } from "@/components/brain/rich-markdown-editor";

/** Common documentation buckets offered as a datalist (category is free-text). */
export const DOC_CATEGORY_SUGGESTIONS = [
  "general",
  "guides",
  "architecture",
  "api",
  "reference",
  "onboarding",
  "design",
];

type DocForm = Pick<Doc, "title" | "category" | "body">;

function toForm(d: Doc): DocForm {
  return { title: d.title, category: d.category, body: d.body };
}

export function DocEditor({
  doc,
  onDelete,
  defaultMode = "edit",
  showLineNumbers = false,
}: {
  doc: Doc;
  onDelete: () => void;
  defaultMode?: "preview" | "edit";
  showLineNumbers?: boolean;
}) {
  const docId = doc.id;
  const pdfPlugin = usePlugin("export-pdf");
  const spellPlugin = usePlugin("spell-check");
  const spellLang = settingStr(spellPlugin.settings, "language", "en");
  const [form, setForm] = useState<DocForm>(() => toForm(doc));
  const [mode, setMode] = useState<"write" | "read">(
    defaultMode === "preview" ? "read" : "write",
  );
  const savedJson = useRef(JSON.stringify(form));
  const latest = useRef(form);

  // Debounced autosave — only when content actually changed.
  useEffect(() => {
    latest.current = form;
    const json = JSON.stringify(form);
    if (json === savedJson.current) return;
    const handle = setTimeout(async () => {
      await docsRepo.update(docId, form);
      savedJson.current = json;
    }, 450);
    return () => clearTimeout(handle);
  }, [form, docId]);

  // Flush a still-pending edit on unmount (switching docs faster than debounce).
  useEffect(() => {
    return () => {
      if (JSON.stringify(latest.current) !== savedJson.current) {
        void docsRepo.update(docId, latest.current);
      }
    };
  }, [docId]);

  const set = (patch: Partial<DocForm>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <Input
            value={form.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="Untitled doc"
            className="h-9 min-w-0 flex-1 border-transparent bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete doc"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={form.category}
            onChange={(e) => set({ category: e.target.value || "general" })}
            list="doc-category-suggestions"
            placeholder="Category"
            className="h-8 w-48 text-sm capitalize"
          />
          <datalist id="doc-category-suggestions">
            {DOC_CATEGORY_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          <div className="ml-auto flex items-center gap-2">
            {pdfPlugin.active && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void exportMarkdownToPdf(
                    form.title || "Untitled doc",
                    form.body,
                    form.category,
                  )
                }
              >
                <FileDown className="h-3.5 w-3.5" />
                Export PDF
              </Button>
            )}
            <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <TabsList>
                <TabsTrigger value="write">Write</TabsTrigger>
                <TabsTrigger value="read">Read</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {mode === "write" ? (
          <RichMarkdownEditor
            key={`${docId}-${showLineNumbers}-${spellPlugin.active}-${spellLang}`}
            value={form.body}
            onChange={(body) => set({ body })}
            suggestions={[]}
            showLineNumbers={showLineNumbers}
            spellCheck={spellPlugin.active}
            spellCheckLang={spellLang}
            placeholderText="Write documentation in Markdown… type / for commands"
            className="scrollbar-thin min-h-0 flex-1 overflow-y-auto"
          />
        ) : (
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <MarkdownPreview content={form.body} />
          </div>
        )}
      </div>
    </div>
  );
}
