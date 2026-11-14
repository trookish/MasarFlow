export default function WorkspaceLoading() {
  return (
    <div className="bg-background grid h-full min-h-[50vh] place-items-center">
      <div className="flex flex-col items-center gap-3">
        <div className="relative h-10 w-10">
          <div className="animate-pulse-soft bg-primary/40 absolute inset-0 rounded-full blur-xl" />
          <div className="border-primary/40 border-t-primary absolute inset-1.5 animate-spin rounded-full border-2" />
        </div>
        <p className="text-muted-foreground text-xs">Loading workspace…</p>
      </div>
    </div>
  );
}
