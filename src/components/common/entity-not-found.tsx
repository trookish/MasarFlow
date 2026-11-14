"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface EntityNotFoundProps {
  title?: string;
  description?: string;
  backHref: string;
  backLabel: string;
  icon?: LucideIcon;
}

export function EntityNotFound({
  title = "Not found",
  description = "The item you're looking for doesn't exist or has been deleted.",
  backHref,
  backLabel,
  icon: Icon,
}: EntityNotFoundProps) {
  return (
    <div className="flex h-full flex-col items-start px-6 py-10">
      <Button variant="ghost" size="sm" asChild>
        <Link href={backHref} className="gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
        </Link>
      </Button>
      <div className="mt-8 flex w-full flex-1 flex-col items-center justify-center text-center">
        {Icon && (
          <div className="border-border bg-surface/30 mb-4 grid h-14 w-14 place-items-center rounded-2xl border">
            <Icon className="text-foreground h-7 w-7" />
          </div>
        )}
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">{description}</p>
      </div>
    </div>
  );
}
