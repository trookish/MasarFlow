"use client";
import * as React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function MetricRing({
  value,
  size = 56,
  stroke = 5,
  trackClassName,
  indicatorClassName,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  trackClassName?: string;
  indicatorClassName?: string;
  label?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (value / 100) * circumference;
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-label={label ?? `${value}%`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          className={cn("fill-none stroke-border", trackClassName)}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
          className={cn("fill-none stroke-primary", indicatorClassName)}
        />
      </svg>
      <span className="absolute text-xs font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function TrendBadge({ delta, className }: { delta: number; className?: string }) {
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const color =
    delta > 0
      ? "text-[color:var(--success)]"
      : delta < 0
        ? "text-[color:var(--danger)]"
        : "text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-medium", color, className)}>
      <Icon className="h-3 w-3" />
      {Math.abs(delta)}%
    </span>
  );
}
