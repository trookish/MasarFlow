"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Trash2, Plus, X, ShieldCheck, ShieldOff } from "lucide-react";
import { standardsRepo } from "@/lib/db/repos";
import {
  type Standard,
  type StandardCategory,
  standardCategorySchema,
} from "@/lib/db/schema";
import { isValidPattern } from "@/lib/enforce";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export const STANDARD_CATEGORIES = standardCategorySchema.options;

type StandardForm = Pick<
  Standard,
  "title" | "category" | "rule" | "examples" | "enforced" | "pattern"
>;

function toForm(s: Standard): StandardForm {
  return {
    title: s.title,
    category: s.category,
    rule: s.rule,
    examples: s.examples,
    enforced: s.enforced,
    pattern: s.pattern ?? "",
  };
}

export function StandardEditor({
  standard,
  onDelete,
}: {
  standard: Standard;
  onDelete: () => void;
}) {
  const standardId = standard.id;
  const [form, setForm] = useState<StandardForm>(() => toForm(standard));
  const savedJson = useRef(JSON.stringify(form));
  const latest = useRef(form);

  useEffect(() => {
    latest.current = form;
    const json = JSON.stringify(form);
    if (json === savedJson.current) return;
    const handle = setTimeout(async () => {
      await standardsRepo.update(standardId, form);
      savedJson.current = json;
    }, 450);
    return () => clearTimeout(handle);
  }, [form, standardId]);

  useEffect(() => {
    return () => {
      if (JSON.stringify(latest.current) !== savedJson.current) {
        void standardsRepo.update(standardId, latest.current);
      }
    };
  }, [standardId]);

  const set = (patch: Partial<StandardForm>) =>
    setForm((f) => ({ ...f, ...patch }));

  const patternValid = isValidPattern(form.pattern);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <Input
          value={form.title}
          onChange={(e) => set({ title: e.target.value })}
          className="h-9 flex-1 text-base font-semibold"
          placeholder="Standard title"
        />
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button variant="outline" size="sm">
              <span className="capitalize">{form.category}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
            {STANDARD_CATEGORIES.map((c) => (
              <DropdownMenuItem
                key={c}
                active={c === form.category}
                onSelect={() => set({ category: c as StandardCategory })}
              >
                <span className="capitalize">{c}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant={form.enforced ? "default" : "outline"}
          size="sm"
          onClick={() => set({ enforced: !form.enforced })}
        >
          {form.enforced ? (
            <ShieldCheck className="h-3.5 w-3.5" />
          ) : (
            <ShieldOff className="h-3.5 w-3.5" />
          )}
          {form.enforced ? "Enforced" : "Off"}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Delete standard"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Rule
            </label>
            <Textarea
              value={form.rule}
              onChange={(e) => set({ rule: e.target.value })}
              placeholder="Describe the rule developers must follow."
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Forbidden pattern (regex)
            </label>
            <Input
              value={form.pattern}
              onChange={(e) => set({ pattern: e.target.value })}
              placeholder="e.g. \bvar\b  — leave empty for docs-only"
              className={cn(
                "font-mono text-sm",
                !patternValid && "border-destructive focus-visible:ring-destructive/40",
              )}
            />
            <p
              className={cn(
                "text-xs",
                patternValid ? "text-muted-foreground" : "text-destructive",
              )}
            >
              {patternValid
                ? "Content matching this pattern is flagged by the enforcer (case-insensitive). Empty = documentation only."
                : "Invalid regular expression."}
            </p>
          </div>

          <ExamplesEditor
            items={form.examples}
            onChange={(examples) => set({ examples })}
          />
        </div>
      </div>
    </div>
  );
}

function ExamplesEditor({
  items,
  onChange,
}: {
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">
          Examples (code snippets)
        </label>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange([...items, ""])}
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">No examples.</p>
      ) : (
        items.map((item, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <Textarea
              value={item}
              onChange={(e) =>
                onChange(items.map((v, j) => (j === i ? e.target.value : v)))
              }
              rows={2}
              className="font-mono text-xs"
            />
            <button
              type="button"
              aria-label="Remove example"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="mt-1 rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))
      )}
    </div>
  );
}
