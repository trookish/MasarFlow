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
    <div className="border-border flex items-center justify-between gap-3 rounded-md border p-2.5">
      <div>
        <div className="text-xs font-medium">{label}</div>
        <div className="text-muted-foreground text-[10px]">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
