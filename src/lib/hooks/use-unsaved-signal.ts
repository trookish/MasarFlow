"use client";

import { useCallback, useEffect, useId } from "react";
import { usePanelPage } from "@/lib/dock/panel-context";
import { useUnsavedStore } from "@/lib/stores/unsaved";

/**
 * For an autosaving editor: report whether it holds an edit that has not been written yet, so the
 * project tab it lives in can show the unsaved-changes dot. Call `signal(true)` when a save is
 * scheduled and `signal(false)` once it lands. Unmounting clears the editor's mark (its own unmount
 * flush writes the edit).
 */
export function useUnsavedSignal(): (unsaved: boolean) => void {
  const page = usePanelPage();
  const editor = useId();
  const signal = useCallback(
    (unsaved: boolean) => {
      if (page) useUnsavedStore.getState().setUnsaved(page, editor, unsaved);
    },
    [page, editor],
  );
  useEffect(
    () => () => {
      if (page) useUnsavedStore.getState().setUnsaved(page, editor, false);
    },
    [page, editor],
  );
  return signal;
}
