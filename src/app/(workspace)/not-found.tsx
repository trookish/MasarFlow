"use client";
import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MasarFlowLogo } from "@/components/common/masarflow-logo";

export default function WorkspaceNotFound() {
  return (
    <div className="bg-background flex h-full min-h-[50vh] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-6 flex items-center gap-3">
        <MasarFlowLogo size="sm" />
        <FileQuestion className="text-foreground h-8 w-8" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground mt-2 max-w-md text-sm">
        The page you requested doesn&apos;t exist in this workspace.
      </p>
      <Button className="mt-6" asChild>
        <Link href="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
