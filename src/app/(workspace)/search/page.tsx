import { Search } from "lucide-react";
import { RouteShell } from "@/components/shell/route-shell";

export default function SemanticSearchPage() {
  return (
    <RouteShell
      icon={Search}
      title="Semantic Search"
      description="Embedding-based semantic search across the project is planned. Use ⌘/ for fast fuzzy search across everything today."
    />
  );
}
