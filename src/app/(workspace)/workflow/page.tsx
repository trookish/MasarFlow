import { Workflow } from "lucide-react";
import { RouteShell } from "@/components/shell/route-shell";

export default function WorkflowPage() {
  return (
    <RouteShell
      icon={Workflow}
      title="AI Workflow"
      description="The 16-step idea-to-implementation workflow is planned for a later milestone."
    />
  );
}
