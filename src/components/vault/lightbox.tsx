"use client";
import * as React from "react";
import { ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function Lightbox({
  open,
  onOpenChange,
  src,
  alt,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  src: string;
  alt: string;
}) {
  const [zoom, setZoom] = React.useState(1);
  const [rot, setRot] = React.useState(0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl bg-black/95 p-2 sm:rounded-lg">
        <DialogTitle className="sr-only">Lightbox Viewer</DialogTitle>
        <div className="relative flex max-h-[80vh] items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="max-h-[75vh] max-w-full select-none"
            style={{
              transform: "scale(" + zoom + ") rotate(" + rot + "deg)",
              transition: "transform 0.2s",
            }}
            draggable={false}
          />
        </div>
        <div className="flex items-center gap-1.5 px-2 pb-1 text-white">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-[10px] tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => setRot((r) => r + 90)}>
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
          <span className="ml-auto text-[10px] opacity-70">{alt}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
