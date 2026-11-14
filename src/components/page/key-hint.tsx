import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils/cn";

/**
 * A keyboard shortcut written the way the app is used: one Kbd per key, joined by "+" only when
 * the keys are pressed together. `sequence` splits on spaces for chords pressed one after another
 * (the command palette's "G then T").
 */
export function KeyHint({
  keys,
  className,
}: {
  /** e.g. ["Ctrl", "Shift", "T"] or ["G", "T"] for a sequence. */
  keys: string[];
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {keys.map((key, i) => (
        <span key={`${key}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 ? (
            <span aria-hidden className="text-xs text-muted-foreground">
              +
            </span>
          ) : null}
          <Kbd>{key}</Kbd>
        </span>
      ))}
    </span>
  );
}

/** A sentence with its shortcut appended, e.g. "New task  ⌘N". */
export function HintText({
  children,
  keys,
}: {
  children: string;
  keys?: string[];
}) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      {children}
      {keys ? <KeyHint keys={keys} /> : null}
    </span>
  );
}
