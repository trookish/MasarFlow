import { Plug } from "lucide-react";
import { RouteShell } from "@/components/shell/route-shell";

export default function PluginsPage() {
  return (
    <RouteShell
      icon={Plug}
      title="Plugins"
      description="Extend MasarFlow with plugins. Coming in a later milestone."
    />
  );
}
