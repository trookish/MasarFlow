"use client";

import dynamic from "next/dynamic";

/**
 * /tools/terminal route — the dock panel loader also renders this page.
 *
 * The xterm bundle touches `self` at module scope, so the panel is imported
 * client-only (ssr: false): the server never evaluates xterm, and the route
 * still renders its client shell from the browser.
 */
const TerminalPanel = dynamic(
  () => import("@/components/tools/terminal-panel").then((m) => m.TerminalPanel),
  { ssr: false },
);

export default function TerminalPage() {
  return <TerminalPanel />;
}
