import { Share2 } from "lucide-react";
import { RouteShell } from "@/components/shell/route-shell";

export default function KnowledgePage() {
  return (
    <RouteShell
      icon={Share2}
      title="Knowledge Graph"
      description="A full cross-entity knowledge graph view is planned. For now, explore the live notes graph under Brain → Graph."
    />
  );
}
