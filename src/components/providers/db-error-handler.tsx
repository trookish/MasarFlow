"use client";
import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

function isDbError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("dexie") ||
      msg.includes("indexeddb") ||
      msg.includes("quota") ||
      msg.includes("database") ||
      msg.includes("transaction") ||
      msg.includes("constraint") ||
      msg.includes("version")
    );
  }
  if (typeof error === "string") {
    const msg = error.toLowerCase();
    return (
      msg.includes("dexie") ||
      msg.includes("indexeddb") ||
      msg.includes("quota") ||
      msg.includes("database")
    );
  }
  return false;
}

function formatDbError(error: Error): string {
  const msg = error.message;
  if (msg.includes("QuotaExceeded")) return "Storage quota exceeded. Free up space and try again.";
  if (msg.includes("VersionError")) return "Database version mismatch. Reload to upgrade.";
  if (msg.includes("AbortError")) return "Database operation was interrupted.";
  if (msg.includes("NotFoundError")) return "Database not found. It may need to be reseeded.";
  return msg || "A database error occurred.";
}

export function DbErrorHandler({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    const onError = (e: ErrorEvent) => {
      const err = e.error ?? e.message;
      if (isDbError(err)) {
        e.preventDefault();
        console.error("Unhandled DB error:", err);
        toast.error("Database error", {
          description: err instanceof Error ? formatDbError(err) : String(err),
          icon: <AlertTriangle className="h-4 w-4" />,
        });
      }
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      if (isDbError(reason)) {
        e.preventDefault();
        console.error("Unhandled DB rejection:", reason);
        toast.error("Database error", {
          description: reason instanceof Error ? formatDbError(reason) : String(reason),
          icon: <AlertTriangle className="h-4 w-4" />,
        });
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return <>{children}</>;
}
