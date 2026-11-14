"use client";
import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  icon?: LucideIcon;
  eyebrow?: string;
  title: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "border-border flex flex-col gap-3 border-b px-6 py-5 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-muted-foreground mb-1.5 flex items-center gap-2 text-[11px] font-medium tracking-wider uppercase">
            {Icon && <Icon className="h-3.5 w-3.5" />}
            <span>{eyebrow}</span>
          </div>
        )}
        <motion.h1
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="text-2xl font-semibold tracking-tight text-balance"
        >
          {title}
        </motion.h1>
        {description && (
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm text-pretty">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
