import { Bot } from "lucide-react";
import { RouteShell } from "@/components/shell/route-shell";

export default function AgentsPage() {
  return (
    <RouteShell
      icon={Bot}
      title="AI Agents"
      description="Specialized AI agents — Architect, Planner, Programmer, Reviewer, and more — will run and stream their work here."
    />
  );
}
