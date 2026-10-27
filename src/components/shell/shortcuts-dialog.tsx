"use client";

import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { useUIStore } from "@/lib/stores/ui";

const GROUPS: { title: string; items: { keys: string[]; label: string }[] }[] =
  [
    {
      title: "Global",
      items: [
        { keys: ["⌘", "K"], label: "Command palette" },
        { keys: ["⌘", "O"], label: "Quick switcher" },
        { keys: ["⌘", "/"], label: "Search everything" },
        { keys: ["⌘", "B"], label: "Toggle sidebar" },
        { keys: ["?"], label: "Keyboard shortcuts" },
        { keys: ["Esc"], label: "Close dialogs / overlays" },
      ],
    },
    {
      title: "Project tabs",
      items: [
        { keys: ["⌘", "Tab"], label: "Focus next tab" },
        { keys: ["⌘", "Shift", "Tab"], label: "Focus previous tab" },
        { keys: ["⌘", "1–9"], label: "Focus a tab by position" },
        { keys: ["⌘", "W"], label: "Close the focused tab" },
        { keys: ["Ctrl", "Shift", "T"], label: "Reopen the last closed tab" },
        { keys: ["Alt", "Shift", "← / →"], label: "Reorder the focused tab" },
        { keys: ["← / →"], label: "Move between tabs when the tab strip is focused" },
      ],
    },
    {
      title: "Tool panels (desktop app)",
      items: [
        { keys: ["⌘", "K"], label: "Open: type “terminal”, “logs”, “system info”" },
        { keys: ["Ctrl", "Shift", "C"], label: "Copy the terminal selection" },
      ],
    },
    {
      title: "Capture",
      items: [
        { keys: ["[", "["], label: "Insert a wikilink (in editor)" },
        { keys: ["⌘", "S"], label: "Save note (auto-saves too)" },
      ],
    },
  ];

export function ShortcutsDialog() {
  const open = useUIStore((s) => s.shortcutsOpen);
  const setOpen = useUIStore((s) => s.setShortcutsOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen} className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription>
          ⌘ is Cmd on macOS, Ctrl on Windows/Linux.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-5 pb-5">
        {GROUPS.map((group) => (
          <div key={group.title} className="space-y-2">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {group.title}
            </p>
            <ul className="space-y-1.5">
              {group.items.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center justify-between text-sm"
                >
                  <span>{item.label}</span>
                  <span className="flex items-center gap-1">
                    {item.keys.map((k, i) => (
                      <Kbd key={i}>{k}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </DialogBody>
    </Dialog>
  );
}
