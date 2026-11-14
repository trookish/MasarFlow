"use client";

import { createContext, useContext } from "react";

/** Page id of the project tab a component renders in (`/capture`), or null outside the tab strip. */
export const PanelPageContext = createContext<string | null>(null);

export function usePanelPage(): string | null {
  return useContext(PanelPageContext);
}
