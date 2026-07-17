"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * A debounced callback hook.
 *
 * Returns a stable function that, when called, waits `delay` ms before
 * invoking `fn` with the latest arguments. If called again within the window,
 * the timer resets. The pending call is flushed on unmount so no edit is lost.
 *
 * Use this to batch rapid writes (e.g. CodeMirror keystrokes → IndexedDB)
 * without dropping the final value.
 */
export function useDebouncedCallback<T extends (...args: never[]) => void>(
  fn: T,
  delay: number,
): T {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const argsRef = useRef<Parameters<T> | null>(null);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  // Flush the pending call on unmount so no edit is lost.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        if (argsRef.current) fnRef.current(...argsRef.current);
      }
    };
  }, []);

  const debounced = useCallback(
    (...args: Parameters<T>) => {
      argsRef.current = args;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (argsRef.current) fnRef.current(...argsRef.current);
        argsRef.current = null;
      }, delay);
    },
    [delay],
  ) as T;

  return debounced;
}
