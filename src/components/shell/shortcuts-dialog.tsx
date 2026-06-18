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
        { keys: ["⌘", "/"], label: "Search everything" },
        { keys: ["⌘", "B"], label: "Toggle sidebar" },
        { keys: ["?"], label: "Keyboard shortcuts" },
        { keys: ["Esc"], label: "Close dialogs / overlays" },
      ],
    },
    {
      title: "Brain",
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
