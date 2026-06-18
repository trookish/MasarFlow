import { FileText } from "lucide-react";
import { RouteShell } from "@/components/shell/route-shell";

export default function SpecsPage() {
  return (
    <RouteShell
      icon={FileText}
      title="Specifications"
      description="RFC-style specs with the AI planner and approval flow arrive in a later milestone. Specs you create are already stored and appear in search and the graph."
    />
  );
}
