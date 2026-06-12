"use client";
import { Switch } from "@/components/ui/switch";

export function Row({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5">
      <div>
        <div className="text-xs font-medium">{label}</div>
        <div className="text-[10px] text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
