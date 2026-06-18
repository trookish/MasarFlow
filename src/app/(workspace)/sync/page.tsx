import { RefreshCw } from "lucide-react";
import { RouteShell } from "@/components/shell/route-shell";

export default function SyncPage() {
  return (
    <RouteShell
      icon={RefreshCw}
      title="Sync Panel"
      description="Two-way Obsidian vault sync and GitHub commit sync are coming in a later milestone."
    />
  );
}
