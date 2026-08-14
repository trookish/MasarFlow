import { db } from "@/lib/db";
import type { Canvas, CanvasNode, CanvasEdge } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

export const canvasRepo = {
  async listByProject(projectId?: string | null): Promise<Canvas[]> {
    if (!projectId) return [];
    return db.canvases
      .where("projectId")
      .equals(projectId)
      .reverse()
      .sortBy("updatedAt");
  },

  get(id: string): Promise<Canvas | undefined> {
    return db.canvases.get(id);
  },

  async create(
    input: Pick<Canvas, "projectId" | "name"> & Partial<Canvas>,
  ): Promise<Canvas> {
    const ts = now();
    const canvas: Canvas = {
      id: input.id ?? uuid(),
      projectId: input.projectId,
      name: input.name,
      description: input.description ?? "",
      createdAt: ts,
      updatedAt: ts,
    };
    await db.canvases.add(canvas);
    return canvas;
  },

  async rename(id: string, name: string): Promise<void> {
    await db.canvases.update(id, { name, updatedAt: now() });
  },

  async update(id: string, patch: Partial<Canvas>): Promise<void> {
    await db.canvases.update(id, { ...patch, updatedAt: now() });
  },

  async touch(id: string): Promise<void> {
    await db.canvases.update(id, { updatedAt: now() });
  },

  async remove(id: string): Promise<void> {
    await db.transaction(
      "rw",
      [db.canvases, db.canvasNodes, db.canvasEdges],
      async () => {
        await db.canvasNodes.where("canvasId").equals(id).delete();
        await db.canvasEdges.where("canvasId").equals(id).delete();
        await db.canvases.delete(id);
      },
    );
  },

  async nodes(canvasId?: string | null): Promise<CanvasNode[]> {
    if (!canvasId) return [];
    return db.canvasNodes.where("canvasId").equals(canvasId).toArray();
  },

  async edges(canvasId?: string | null): Promise<CanvasEdge[]> {
    if (!canvasId) return [];
    return db.canvasEdges.where("canvasId").equals(canvasId).toArray();
  },

  async addNode(
    input: Pick<CanvasNode, "canvasId"> & Partial<CanvasNode>,
  ): Promise<CanvasNode> {
    const ts = now();
    const node: CanvasNode = {
      id: input.id ?? uuid(),
      canvasId: input.canvasId,
      type: input.type ?? "text",
      x: input.x ?? 0,
      y: input.y ?? 0,
      width: input.width ?? 240,
      height: input.height ?? 140,
      data: input.data ?? {},
      color: input.color ?? "",
      parentId: input.parentId ?? null,
      createdAt: ts,
      updatedAt: ts,
    };
    await db.canvasNodes.add(node);
    await this.touch(input.canvasId);
    return node;
  },

  async updateNode(id: string, patch: Partial<CanvasNode>): Promise<void> {
    await db.canvasNodes.update(id, { ...patch, updatedAt: now() });
  },

  async removeNode(id: string): Promise<void> {
    await db.canvasNodes.delete(id);
  },

  async addEdge(
    input: Pick<CanvasEdge, "canvasId" | "source" | "target"> &
      Partial<CanvasEdge>,
  ): Promise<CanvasEdge> {
    const edge: CanvasEdge = {
      id: input.id ?? uuid(),
      canvasId: input.canvasId,
      source: input.source,
      target: input.target,
      sourceHandle: input.sourceHandle ?? null,
      targetHandle: input.targetHandle ?? null,
      label: input.label ?? "",
      color: input.color ?? "",
      createdAt: now(),
    };
    await db.canvasEdges.add(edge);
    return edge;
  },

  async removeEdge(id: string): Promise<void> {
    await db.canvasEdges.delete(id);
  },
};
