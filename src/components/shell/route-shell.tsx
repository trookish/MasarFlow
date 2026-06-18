import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

/**
 * Placeholder for routes whose full implementation is planned for a later
 * milestone. Navigation is complete today so nothing 404s.
 */
export function RouteShell({
  icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3">
        <EmptyState icon={icon} title={title} description={description} />
        <Badge variant="outline">Planned for a later milestone</Badge>
      </div>
    </div>
  );
}
