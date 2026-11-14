import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "../schema";
import type { Canvas, CanvasNode, CanvasEdge } from "../schema";
import { uid } from "@/lib/utils";

export function useCanvases(projectId: string | undefined) {
  return useLiveQuery(
    () =>
      projectId
        ? getDb().canvases.where("projectId").equals(projectId).reverse().sortBy("updatedAt")
        : Promise.resolve([] as Canvas[]),
    [projectId],
    [] as Canvas[],
  );
}

export function useCanvas(id: string | undefined) {
  return useLiveQuery(() => (id ? getDb().canvases.get(id) : undefined), [id]);
}

export function useCanvasNodes(canvasId: string | undefined) {
  return useLiveQuery(
    () =>
      canvasId
        ? getDb().canvasNodes.where("canvasId").equals(canvasId).toArray()
        : Promise.resolve([] as CanvasNode[]),
    [canvasId],
    [] as CanvasNode[],
  );
}

export async function upsertCanvas(canvas: Canvas): Promise<void> {
  await getDb().canvases.put(canvas);
}

export async function createCanvas(projectId: string, name: string): Promise<Canvas> {
  const now = Date.now();
  const canvas: Canvas = {
    id: uid("cv"),
    projectId,
    name: name.trim() || "Untitled canvas",
    createdAt: now,
    updatedAt: now,
  };
  await getDb().canvases.put(canvas);
  return canvas;
}

export async function deleteCanvas(id: string): Promise<void> {
  await getDb().canvases.delete(id);
  await getDb().canvasNodes.where("canvasId").equals(id).delete();
  await getDb().canvasEdges.where("canvasId").equals(id).delete();
}

export async function upsertCanvasNode(node: CanvasNode): Promise<void> {
  await getDb().canvasNodes.put(node);
}

export async function deleteCanvasNode(id: string): Promise<void> {
  await getDb().canvasNodes.delete(id);
  await getDb().canvasEdges.where("source").equals(id).delete();
  await getDb().canvasEdges.where("target").equals(id).delete();
}

export function useCanvasEdges(canvasId: string | undefined) {
  return useLiveQuery(
    () =>
      canvasId
        ? getDb().canvasEdges.where("canvasId").equals(canvasId).toArray()
        : Promise.resolve([] as CanvasEdge[]),
    [canvasId],
    [] as CanvasEdge[],
  );
}

export async function upsertCanvasEdge(edge: CanvasEdge): Promise<void> {
  await getDb().canvasEdges.put(edge);
}

export async function deleteCanvasEdge(id: string): Promise<void> {
  await getDb().canvasEdges.delete(id);
}
