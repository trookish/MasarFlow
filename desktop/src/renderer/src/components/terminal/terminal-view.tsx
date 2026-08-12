import { Terminal as Xterm, type IDisposable, type ITerminalOptions } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { ClipboardPaste, Copy, Eraser, ScanText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { xtermTheme } from "@/lib/theme";
import { TerminalContextMenu, type TerminalContextMenuItem } from "./terminal-context-menu";

export function TerminalView({ sessionId }: { sessionId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Xterm | null>(null);
  const fontSize = useApp((s) => s.settings?.fontSize ?? 13);
  const accent = useApp((s) => s.settings?.accent ?? "#dedede");
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

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
      // Right-click already selects the word under the cursor (xterm default);
      // our own contextmenu handler below shows the copy/paste menu.
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

    const copySelection = (): void => {
      if (!term.hasSelection()) return;
      const text = term.getSelection();
      term.clearSelection();
      void window.masarFlow.clipboard.writeText(text);
    };

    const pasteClipboard = (): void => {
      void window.masarFlow.clipboard.readText().then((text) => {
        if (text && mounted && termRef.current) termRef.current.paste(text);
      });
    };

    // Ctrl+C with a selection copies instead of sending SIGINT (Ctrl+Shift+C
    // too — xterm reports it as "C"). Ctrl+V / Ctrl+Shift+V arrive as \x16
    // through onData and are handled there.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "c" || e.key === "C") && term.hasSelection()) {
        copySelection();
        return false;
      }
      return true;
    });

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
    const onData = term.onData((data) => {
      if (data === "\x16") {
        pasteClipboard();
        return;
      }
      window.masarFlow.session.input(sessionId, data);
    });

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
      setMenu(null);
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

  const onContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const term = termRef.current;
  const items: TerminalContextMenuItem[] = [
    {
      label: "Copy",
      icon: <Copy />,
      shortcut: "Ctrl+C",
      disabled: !term?.hasSelection(),
      onSelect: () => termRef.current && copy(termRef.current),
    },
    {
      label: "Copy all",
      icon: <Copy />,
      disabled: !term || term.buffer.active.length === 0,
      onSelect: () => {
        const t = termRef.current;
        if (!t) return;
        t.selectAll();
        copy(t);
      },
    },
    {
      label: "Paste",
      icon: <ClipboardPaste />,
      shortcut: "Ctrl+V",
      onSelect: () => {
        const t = termRef.current;
        if (!t) return;
        void window.masarFlow.clipboard.readText().then((text) => {
          if (text) t.paste(text);
        });
        t.focus();
      },
    },
    { type: "separator" },
    {
      label: "Select all",
      icon: <ScanText />,
      onSelect: () => termRef.current?.selectAll(),
    },
    {
      label: "Clear",
      icon: <Eraser />,
      destructive: true,
      onSelect: () => {
        termRef.current?.clear();
        window.masarFlow.session.clearBuffer(sessionId);
      },
    },
  ];

  return (
    <div
      ref={containerRef}
      onContextMenu={onContextMenu}
      className="h-full w-full overflow-hidden bg-background p-2"
    >
      {menu && (
        <TerminalContextMenu
          x={menu.x}
          y={menu.y}
          items={items}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function copy(term: Xterm): void {
  if (!term.hasSelection()) return;
  const text = term.getSelection();
  term.clearSelection();
  void window.masarFlow.clipboard.writeText(text);
}

export type { IDisposable };
