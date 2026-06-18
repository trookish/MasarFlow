import { ScrollText } from "lucide-react";
import { RouteShell } from "@/components/shell/route-shell";

export default function DevLogsPage() {
  return (
    <RouteShell
      icon={ScrollText}
      title="Dev Logs"
      description="A chronological log trail of project changes is planned next. Demo data already seeds a few entries on the dashboard."
    />
  );
}
