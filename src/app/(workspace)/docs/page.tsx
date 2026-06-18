import { BookOpen } from "lucide-react";
import { RouteShell } from "@/components/shell/route-shell";

export default function DocsPage() {
  return (
    <RouteShell
      icon={BookOpen}
      title="Documentation"
      description="Auto-generated system, API, and architecture docs are coming in a later milestone."
    />
  );
}
