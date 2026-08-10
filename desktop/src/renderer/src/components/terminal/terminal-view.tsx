import { Terminal as Xterm, type IDisposable, type ITerminalOptions } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { useEffect, useRef } from "react";
import { useApp } from "@/lib/store";
import { xtermTheme } from "@/lib/theme";

export function TerminalView({ sessionId }: { sessionId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Xterm | null>(null);
  const fontSize = useApp((s) => s.settings?.fontSize ?? 13);
  const accent = useApp((s) => s.settings?.accent ?? "#7c5cfc");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const options: ITerminalOptions = {
      fontFamily: "Geist Mono, ui-monospace, monospace",
      fontSize,
      theme: xtermTheme(accent),
      cursorBlink: true,
      scrollback: 10_000,
      allowTransparency: true,
      convertEol: false,
    };
    const term = new Xterm(options);
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    termRef.current = term;

    let mounted = true;
    const write = (data: string): void => {
      if (mounted) term.write(data);
    };

    void window.masarFlow.session.buffer(sessionId).then((buf) => {
      if (mounted && buf) term.write(buf);
    });

    const offOut = window.masarFlow.session.onOutput(({ id, data }) => {
      if (id === sessionId) write(data);
    });
    const offExit = window.masarFlow.session.onExit(({ id, exitCode }) => {
      if (id === sessionId) {
        write(
          `\r\n\x1b[38;5;242m───────────── process exited with code ${exitCode} ─────────────\x1b[0m\r\n`,
        );
      }
    });
    const onData = term.onData((data) => window.masarFlow.session.input(sessionId, data));

    const doFit = (): void => {
      try {
        fit.fit();
        window.masarFlow.session.resize(sessionId, term.cols, term.rows);
      } catch {
        // container hidden — retry on next observer tick
      }
    };

    const ro = new ResizeObserver(() => doFit());
    ro.observe(container);
    requestAnimationFrame(doFit);

    const onFocus = (): void => term.focus();
    container.addEventListener("click", onFocus);

    return () => {
      mounted = false;
      offOut();
      offExit();
      onData.dispose();
      ro.disconnect();
      container.removeEventListener("click", onFocus);
      term.dispose();
      termRef.current = null;
    };
    // Recreate the terminal when session/theme/font changes require it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = xtermTheme(accent);
  }, [accent]);

  useEffect(() => {
    if (termRef.current) termRef.current.options.fontSize = fontSize;
  }, [fontSize]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden bg-background p-2" />;
}

export type { IDisposable };
