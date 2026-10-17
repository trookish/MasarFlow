"use client";

import { useEffect } from "react";
import { db } from "@/lib/db";
import { installActivityTracking } from "@/lib/activity/track";

/** Mount once in the workspace shell. Cleanup makes StrictMode double-mount safe. */
export function useActivityTracking(): void {
  useEffect(() => installActivityTracking(db), []);
}
