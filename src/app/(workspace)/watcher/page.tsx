import { Eye } from "lucide-react";
import { RouteShell } from "@/components/shell/route-shell";

export default function WatcherPage() {
  return (
    <RouteShell
      icon={Eye}
      title="Unity Watcher"
      description="Watch real file changes from your Unity project and link them to tasks. Planned next."
    />
  );
}
