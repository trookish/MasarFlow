"use client";

import { useEffect } from "react";
import { startAutoBackup } from "@/lib/db/auto-backup";

/** Mount once: silent rolling disk backups. A no-op in a plain browser. */
export function AutoBackup() {
  useEffect(() => startAutoBackup(), []);
  return null;
}
