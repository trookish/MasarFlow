"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PenTool, LayoutTemplate, Network } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const TABS = [
  { label: "Notes", href: "/brain", icon: PenTool },
  { label: "Canvas", href: "/brain/canvas", icon: LayoutTemplate },
  { label: "Templates", href: "/brain/templates", icon: LayoutTemplate },
  { label: "Graph", href: "/brain/graph", icon: Network },
];

export default function BrainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-3">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </Link>
          );
        })}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
