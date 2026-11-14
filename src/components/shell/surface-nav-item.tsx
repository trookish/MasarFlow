"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * The icon chip every surface link is built on. The active surface fills the
 * chip with a wash of the user's accent and paints the icon with the accent
 * itself; both follow a gradient accent. The chip has a fixed size, so the
 * icon never moves or rescales when the rail expands or collapses.
 */
export function NavIconChip({
  icon: Icon,
  active,
  className,
}: {
  icon: LucideIcon;
  active: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative grid size-9 shrink-0 place-items-center rounded-lg transition-colors",
        !active && "group-hover:bg-accent",
        className,
      )}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute inset-0 rounded-[inherit] bg-primary opacity-20"
        />
      ) : null}
      <Icon
        aria-hidden
        className={cn(
          "relative size-[18px]",
          active && "accent-icon text-primary",
        )}
        strokeWidth={active ? 2.25 : 2}
      />
    </span>
  );
}

export function SurfaceNavLink({
  href,
  label,
  title,
  icon,
  active,
  showLabel,
  className,
}: {
  href: string;
  label: string;
  /** Native hover text; omit when a Tooltip already explains the link. */
  title?: string;
  icon: LucideIcon;
  active: boolean;
  showLabel: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      data-active={active || undefined}
      title={title}
      className={cn(
        "group flex items-center gap-3 rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "font-medium text-foreground"
          : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <NavIconChip icon={icon} active={active} />
      {showLabel ? (
        <span className="truncate whitespace-nowrap text-sm">{label}</span>
      ) : null}
    </Link>
  );
}
