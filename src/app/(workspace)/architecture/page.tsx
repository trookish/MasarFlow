import { Boxes } from "lucide-react";
import { RouteShell } from "@/components/shell/route-shell";

export default function ArchitecturePage() {
  return (
    <RouteShell
      icon={Boxes}
      title="Architecture"
      description="Visual architecture diagrams and system dependency mapping are on the way, reusing the same canvas engine as Brain."
    />
  );
}
