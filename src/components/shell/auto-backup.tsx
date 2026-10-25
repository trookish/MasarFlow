"use client";

import { useEffect } from "react";
import { startAutoBackup } from "@/lib/db/auto-backup";
import { startRetention } from "@/lib/db/retention";

/** Mount once: silent rolling disk backups (a no-op in a plain browser) and AI history retention. */
export function AutoBackup() {
  useEffect(() => startAutoBackup(), []);
  useEffect(() => startRetention(), []);
  return null;
}
