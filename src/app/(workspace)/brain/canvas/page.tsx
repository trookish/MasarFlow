"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Brain, Plus, LayoutGrid } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useCanvases, createCanvas } from "@/lib/db/repos/canvases";
import { toast } from "sonner";

export default function CanvasesPage() {
  const router = useRouter();
  const project = useActiveProject();
  const canvases = useCanvases(project?.id);
  const [isCreating, setIsCreating] = React.useState(false);
  const [name, setName] = React.useState("");

  React.useEffect(() => {
    if (canvases && canvases.length > 0 && !isCreating) {
      router.replace(`/brain/canvas/${canvases[0].id}`);
    }
  }, [canvases, router, isCreating]);

  const onCreate = async () => {
    if (!project) return;
    const trimmed = name.trim() || "Untitled canvas";
    try {
      const canvas = await createCanvas(project.id, trimmed);
      toast.success("Canvas created");
      router.push(`/brain/canvas/${canvas.id}`);
    } catch (e) {
      toast.error("Failed to create canvas", { description: (e as Error).message });
    }
  };

  if (canvases && canvases.length > 0) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="text-muted-foreground text-sm">Opening canvas…</div>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <PageHeader
        icon={Brain}
        eyebrow="Brain"
        title="Canvases"
        description="Visual boards for brainstorming, mapping, and linking notes together."
        actions={
          <Button onClick={() => setIsCreating(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> New canvas
          </Button>
        }
      />

      <div className="px-6 py-8">
        {isCreating ? (
          <Card className="mx-auto max-w-md">
            <CardHeader>
              <CardTitle>New canvas</CardTitle>
              <CardDescription>Give your board a name to get started.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Traversal Design Board"
                onKeyDown={(e) => {
                  if (e.key === "Enter") onCreate();
                  if (e.key === "Escape") setIsCreating(false);
                }}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setIsCreating(false)}>
                  Cancel
                </Button>
                <Button onClick={onCreate}>Create canvas</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="border-border text-muted-foreground mx-auto max-w-md rounded-lg border border-dashed p-10 text-center">
            <LayoutGrid className="mx-auto mb-3 h-8 w-8 opacity-50" />
            <p className="text-sm font-medium">No canvases yet</p>
            <p className="mt-1 text-xs">
              Create a canvas to start arranging notes and ideas visually.
            </p>
            <Button onClick={() => setIsCreating(true)} variant="outline" className="mt-4 gap-1.5">
              <Plus className="h-4 w-4" /> New canvas
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
