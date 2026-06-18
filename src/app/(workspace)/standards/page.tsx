import { ShieldCheck } from "lucide-react";
import { RouteShell } from "@/components/shell/route-shell";

export default function StandardsPage() {
  return (
    <RouteShell
      icon={ShieldCheck}
      title="Standards"
      description="The standards hub and enforcer will catalog your coding rules and flag violations across specs, tasks, and notes."
    />
  );
}
