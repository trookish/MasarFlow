"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  claimCreateIntent,
  readCreateIntent,
} from "@/lib/navigation/create-intent";

/**
 * Runs `create` once per `?new=<nonce>` intent addressed to `route`.
 *
 * The claim is taken synchronously before `create` starts, so remounts, a
 * dock panel replaying a stale URL, or StrictMode's double effect never
 * create a second item. A new nonce (a second click) creates again.
 * `create` is expected to replace the URL (dropping `new`) once it is done.
 */
export function useCreateIntent(
  route: string,
  enabled: boolean,
  create: () => void | Promise<void>,
): void {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const nonce = readCreateIntent(route, pathname, searchParams);
  const createRef = useRef(create);
  useEffect(() => {
    createRef.current = create;
  });

  useEffect(() => {
    if (!enabled || !nonce) return;
    if (!claimCreateIntent(route, nonce)) return;
    void createRef.current();
  }, [route, enabled, nonce]);
}
