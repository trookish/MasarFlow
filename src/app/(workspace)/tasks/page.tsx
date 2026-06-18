import { KanbanSquare } from "lucide-react";
import { RouteShell } from "@/components/shell/route-shell";

export default function TasksPage() {
  return (
    <RouteShell
      icon={KanbanSquare}
      title="Task Boards"
      description="Kanban boards, sprint planning, and AI task generation are planned next. Tasks you create are stored and show in search and the graph."
    />
  );
}
