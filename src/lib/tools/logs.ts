/**
 * Log-viewer helpers: classify a line so the panel can colour and filter it.
 * Pure so the classification is testable; the main process owns the file I/O.
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

export type LogLevel = "error" | "warn" | "info";
export type LogFilter = LogLevel | "all";

/** The strongest signal in the line wins ("error" beats "warn"). */
export function lineLevel(line: string): LogLevel {
  const lower = line.toLowerCase();
  if (lower.includes("error") || lower.includes("unhandled") || lower.includes("failed")) {
    return "error";
  }
  if (lower.includes("warn") || lower.includes("deprecat")) return "warn";
  return "info";
}

export function levelClass(level: LogLevel): string {
  switch (level) {
    case "error":
      return "text-destructive";
    case "warn":
      return "text-amber-500";
    default:
      return "text-muted-foreground";
  }
}

export function levelFilterLabel(filter: LogFilter): string {
  switch (filter) {
    case "error":
      return "Errors only";
    case "warn":
      return "Warnings and errors";
    default:
      return "Everything";
  }
}

/** True when a line passes the active filter. */
export function passesFilter(line: string, filter: LogFilter): boolean {
  const level = lineLevel(line);
  if (filter === "all") return true;
  if (filter === "error") return level === "error";
  return level === "error" || level === "warn";
}
