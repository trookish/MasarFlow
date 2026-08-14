"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useOnSelectionChange,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./canvas.css";
import {
  Plus,
  LayoutTemplate,
  Type,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Globe,
  Box,
} from "lucide-react";
import { canvasRepo, notesRepo } from "@/lib/db/repos";
import type { CanvasNode } from "@/lib/db/schema";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { usePageSettings } from "@/lib/stores/page-settings";
import { useDebouncedCallback } from "@/lib/hooks/use-debounced";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CanvasToolbar } from "./canvas-toolbar";
import { canvasNodeTypes, rfTypeFor, dbTypeFor } from "./nodes";
import { fileToMediaNodeData } from "./nodes/media-node";
import type { BaseNodeData } from "./nodes/types";
import { CanvasContextMenu, type AlignMode } from "./canvas-context-menu";
import {
  alignLeft,
  alignRight,
  alignTop,
  alignBottom,
  alignCenterH,
  alignCenterV,
  distributeH,
  distributeV,
  autoGrid,
} from "./canvas-alignment";
import { useCanvasShortcuts } from "./canvas-shortcuts";
import {
  setCanvasAIContext,
  type CanvasAIContext,
  type CanvasNodeSummary,
} from "@/lib/canvas-ai";

type AnyNodeData = Record<string, unknown> & BaseNodeData;

/* ── Edge defaults ────────────────────────────────────────────────────────── */

const EDGE_DEFAULTS = {
  type: "smoothstep" as const,
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
  style: {
    stroke: "var(--muted-foreground)",
    strokeWidth: 1.25,
    strokeOpacity: 0.75,
  },
};

/* ── Board ────────────────────────────────────────────────────────────────── */

function CanvasBoardInner() {
  const projectId = useActiveProjectId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canvasIdParam = searchParams.get("canvas");
  const { resolvedTheme } = useTheme();
  const { canvas: settings } = usePageSettings();
  const {
    screenToFlowPosition,
    getNodes,
    getZoom,
    getViewport,
    setViewport,
  } = useReactFlow();

  const boardRef = useRef<HTMLDivElement>(null);

  const canvases = useLiveQuery(
    () => canvasRepo.listByProject(projectId),
    [projectId],
  );
  const canvasId = canvasIdParam ?? canvases?.[0]?.id ?? null;
  const currentCanvas = canvases?.find((c) => c.id === canvasId);

  const dbNodes = useLiveQuery(() => canvasRepo.nodes(canvasId), [canvasId]);
  const dbEdges = useLiveQuery(() => canvasRepo.edges(canvasId), [canvasId]);
  const projectNotes = useLiveQuery(
    () => notesRepo.listByProject(projectId),
    [projectId],
  );

  const [nodes, setNodesState, onNodesChange] = useNodesState<
    Node<AnyNodeData>
  >([]);
  const [edges, setEdgesState, onEdgesChange] = useEdgesState<Edge>([]);
  const seededRef = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [notePickerOpen, setNotePickerOpen] = useState(false);
  const [palette, setPalette] = useState<{ x: number; y: number } | null>(null);
  const [webDialogOpen, setWebDialogOpen] = useState(false);
  const [webUrl, setWebUrl] = useState("");
  const paletteRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Flow position where the next palette/rail card lands (null = auto). */
  const insertPosRef = useRef<{ x: number; y: number } | null>(null);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    nodeId: string | null;
    multiSelect: boolean;
  } | null>(null);

  // Selection state (for multi-select context menu)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

  useOnSelectionChange({
    onChange: useCallback(({ nodes: selNodes }) => {
      setSelectedNodeIds(selNodes.map((n) => n.id));
    }, []),
  });

  // Centralized data-change callback.
  // The IndexedDB write is debounced (300ms) so typing in a CodeMirror card
  // doesn't hit the DB on every keystroke. The RF state update is immediate
  // (no debounce) so the UI stays responsive.
  const persistNodeData = useDebouncedCallback(
    (id: string, data: Record<string, unknown>) => {
      void canvasRepo.updateNode(id, { data });
    },
    300,
  );

  const onNodeDataChange = useCallback(
    (id: string, data: Record<string, unknown>) => {
      persistNodeData(id, data);
      setNodesState((ns) =>
        ns.map((n) => {
          if (n.id === id) return { ...n, data: { ...n.data, ...data } };
          // Collapsing/expanding a group shows or hides its children.
          if (n.parentId === id && typeof data.collapsed === "boolean") {
            return { ...n, hidden: data.collapsed };
          }
          return n;
        }),
      );
    },
    [persistNodeData, setNodesState],
  );

  const onOpenNote = useCallback(
    (noteId: string) => {
      router.push(`/brain?note=${noteId}`);
    },
    [router],
  );

  const toFlowNode = useCallback(
    (n: CanvasNode): Node<AnyNodeData> => ({
      id: n.id,
      type: rfTypeFor(n.type),
      position: { x: n.x, y: n.y },
      parentId: n.parentId ?? undefined,
      extent: n.parentId ? "parent" : undefined,
      data: {
        ...(n.data as AnyNodeData),
        shadow: settings.cardShadows,
        onDataChange: onNodeDataChange,
        onOpenNote,
      },
      style: { width: n.width, height: n.height },
    }),
    [onNodeDataChange, onOpenNote, settings.cardShadows],
  );

  // Seed RF state once per canvas from the database.
  useEffect(() => {
    if (!canvasId || dbNodes === undefined || dbEdges === undefined) return;
    if (seededRef.current === canvasId) return;
    seededRef.current = canvasId;
    const collapsedGroups = new Set(
      dbNodes
        .filter(
          (n) =>
            n.type === "group" &&
            Boolean((n.data as { collapsed?: boolean } | undefined)?.collapsed),
        )
        .map((n) => n.id),
    );
    setNodesState(
      dbNodes.map((n) => {
        const flow = toFlowNode(n);
        return flow.parentId && collapsedGroups.has(flow.parentId)
          ? { ...flow, hidden: true }
          : flow;
      }),
    );
    setEdgesState(
      dbEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
        label: e.label || undefined,
        ...EDGE_DEFAULTS,
        ...(e.color ? { style: { stroke: e.color } } : {}),
      })),
    );
  }, [canvasId, dbNodes, dbEdges, toFlowNode, setNodesState, setEdgesState]);

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!canvasId) return;
      const edge = await canvasRepo.addEdge({
        canvasId,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? null,
        targetHandle: connection.targetHandle ?? null,
      });
      setEdgesState((es) =>
        addEdge({ ...connection, id: edge.id, ...EDGE_DEFAULTS }, es),
      );
    },
    [canvasId, setEdgesState],
  );

  const onNodeDragStop = useCallback((_evt: unknown, node: Node) => {
    void canvasRepo.updateNode(node.id, {
      x: node.position.x,
      y: node.position.y,
      ...(node.width ? { width: node.width } : {}),
      ...(node.height ? { height: node.height } : {}),
    });
  }, []);

  // Snap to objects: while dragging, pull the node's edges/centers toward
  // nearby sibling edges/centers within a screen-space threshold.
  const onNodeDrag = useCallback(
    (_evt: unknown, node: Node) => {
      if (!settings.snapToObjects) return;
      const zoom = getZoom();
      const tol = 8 / zoom;
      const w = node.width ?? 280;
      const h = node.height ?? 160;
      const own = {
        left: node.position.x,
        centerX: node.position.x + w / 2,
        right: node.position.x + w,
        top: node.position.y,
        centerY: node.position.y + h / 2,
        bottom: node.position.y + h,
      };
      let bestDx = tol;
      let bestDy = tol;
      const trySnap = (
        from: number,
        to: number,
        axis: "x" | "y",
      ) => {
        const delta = to - from;
        const best = axis === "x" ? bestDx : bestDy;
        if (Math.abs(delta) < Math.abs(best)) {
          if (axis === "x") bestDx = delta;
          else bestDy = delta;
        }
      };
      for (const o of getNodes()) {
        if (o.id === node.id) continue;
        const ow = o.width ?? 280;
        const oh = o.height ?? 160;
        const cand = {
          left: o.position.x,
          centerX: o.position.x + ow / 2,
          right: o.position.x + ow,
          top: o.position.y,
          centerY: o.position.y + oh / 2,
          bottom: o.position.y + oh,
        };
        for (const from of [own.left, own.centerX, own.right]) {
          for (const to of [cand.left, cand.centerX, cand.right]) {
            trySnap(from, to, "x");
          }
        }
        for (const from of [own.top, own.centerY, own.bottom]) {
          for (const to of [cand.top, cand.centerY, cand.bottom]) {
            trySnap(from, to, "y");
          }
        }
      }
      if (Math.abs(bestDx) >= tol && Math.abs(bestDy) >= tol) return;
      setNodesState((ns) =>
        ns.map((n) =>
          n.id === node.id
            ? {
                ...n,
                position: {
                  x: Math.abs(bestDx) < tol ? n.position.x + bestDx : n.position.x,
                  y: Math.abs(bestDy) < tol ? n.position.y + bestDy : n.position.y,
                },
              }
            : n,
        ),
      );
    },
    [settings.snapToObjects, getZoom, getNodes, setNodesState],
  );

  // Zoom around the cursor with the configured zoom speed. ReactFlow's own
  // wheel handler is passive, so we drive zoom manually with a native
  // non-passive listener and disable RF's scroll zoom.
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const board = el;
    function onWheel(e: WheelEvent) {
      // Let scrollable node content (editors, previews) scroll normally.
      let target: HTMLElement | null = e.target as HTMLElement | null;
      while (target && target !== board) {
        const style = window.getComputedStyle(target);
        const scrolls =
          target.scrollHeight > target.clientHeight &&
          /(auto|scroll)/.test(style.overflowY);
        if (scrolls) return;
        target = target.parentElement;
      }
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0016 * (settings.zoomSpeed || 1));
      const { zoom } = getViewport();
      const nextZoom = Math.min(4, Math.max(0.1, zoom * factor));
      if (nextZoom === zoom) return;
      const bounds = board.getBoundingClientRect();
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setViewport({
        zoom: nextZoom,
        x: pos.x - (e.clientX - bounds.left) / nextZoom,
        y: pos.y - (e.clientY - bounds.top) / nextZoom,
      });
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [
    settings.zoomSpeed,
    getViewport,
    screenToFlowPosition,
    setViewport,
  ]);

  /* ── Node creation ──────────────────────────────────────────────────────── */

  const nextPosition = useCallback(() => {
    const i = nodes.length;
    return { x: 100 + (i % 6) * 48, y: 90 + (i % 6) * 44 };
  }, [nodes.length]);

  const addNode = useCallback(
    async (
      type: CanvasNode["type"],
      data: Record<string, unknown>,
      pos?: { x: number; y: number },
    ) => {
      if (!canvasId) return;
      const node = await canvasRepo.addNode({
        canvasId,
        type,
        x: (pos ?? nextPosition()).x,
        y: (pos ?? nextPosition()).y,
        data,
        width: type === "group" ? 400 : 280,
        height: type === "group" ? 300 : 160,
      });
      setNodesState((ns) => [...ns, toFlowNode(node)]);
    },
    [canvasId, nextPosition, setNodesState, toFlowNode],
  );

  const addTextNode = (pos?: { x: number; y: number }) =>
    addNode("text", { text: "", newCard: true }, pos);
  const addNoteNode = (
    noteId: string,
    title: string,
    excerpt: string,
    pos?: { x: number; y: number },
  ) => addNode("note", { noteId, title, excerpt, mode: "preview" }, pos);
  const addGroupNode = (pos?: { x: number; y: number }) =>
    addNode("group", { label: "New group" }, pos);

  const addWebNode = useCallback(
    async (url: string, pos?: { x: number; y: number }) => {
      const { detectWebKind } = await import("./nodes/types");
      const kind = detectWebKind(url);
      await addNode("link", { url, title: url, kind }, pos);
    },
    [addNode],
  );

  async function addMediaNodeFromFile(
    file: File,
    pos?: { x: number; y: number },
  ) {
    const mediaData = await fileToMediaNodeData(file);
    await addNode(
      "media",
      {
        attachmentId: mediaData.attachmentId,
        name: mediaData.name,
        mimeType: mediaData.mimeType,
        dataUrl: mediaData.dataUrl,
      },
      pos,
    );
  }

  /* ── Context menu actions ───────────────────────────────────────────────── */

  const duplicateNode = useCallback(
    async (id: string) => {
      const original = nodes.find((n) => n.id === id);
      if (!original || !canvasId) return;
      const parent = original.parentId
        ? nodes.find((n) => n.id === original.parentId)
        : null;
      // Grouped children store relative positions — place the copy in
      // absolute space so it lands visually beside the original.
      const absX = (parent?.position.x ?? 0) + original.position.x;
      const absY = (parent?.position.y ?? 0) + original.position.y;
      const dbNode = await canvasRepo.addNode({
        canvasId,
        type: dbTypeFor(original.type ?? "textNode") as CanvasNode["type"],
        x: absX + 40,
        y: absY + 40,
        width: original.width ?? 280,
        height: original.height ?? 160,
        data: { ...original.data },
      });
      setNodesState((ns) => [...ns, toFlowNode(dbNode)]);
    },
    [nodes, canvasId, setNodesState, toFlowNode],
  );

  const deleteNode = useCallback(
    (id: string) => {
      void canvasRepo.removeNode(id);
      setNodesState((ns) => ns.filter((n) => n.id !== id));
    },
    [setNodesState],
  );

  const changeNodeColor = useCallback(
    (id: string, color: string) => {
      void canvasRepo.updateNode(id, { color });
      setNodesState((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, color } } : n)),
      );
    },
    [setNodesState],
  );

  const toggleNodeLock = useCallback(
    (id: string) => {
      setNodesState((ns) =>
        ns.map((n) =>
          n.id === id
            ? {
                ...n,
                draggable: !n.draggable,
                data: { ...n.data, locked: !n.data.locked },
              }
            : n,
        ),
      );
    },
    [setNodesState],
  );

  const bringForward = useCallback(
    (id: string) => {
      const allNodes = getNodes();
      const maxZ = Math.max(0, ...allNodes.map((n) => n.zIndex ?? 0));
      setNodesState((ns) =>
        ns.map((n) => (n.id === id ? { ...n, zIndex: maxZ + 1 } : n)),
      );
    },
    [getNodes, setNodesState],
  );

  const sendBackward = useCallback(
    (id: string) => {
      const allNodes = getNodes();
      const minZ = Math.min(0, ...allNodes.map((n) => n.zIndex ?? 0));
      setNodesState((ns) =>
        ns.map((n) => (n.id === id ? { ...n, zIndex: minZ - 1 } : n)),
      );
    },
    [getNodes, setNodesState],
  );

  /* ── Alignment actions ──────────────────────────────────────────────────── */

  const applyAlignment = useCallback(
    (mode: AlignMode) => {
      const selNodes = getNodes().filter((n) => selectedNodeIds.includes(n.id));
      if (selNodes.length < 2) return;
      let posMap: Record<string, { x: number; y: number }>;
      switch (mode) {
        case "left":
          posMap = alignLeft(selNodes);
          break;
        case "right":
          posMap = alignRight(selNodes);
          break;
        case "top":
          posMap = alignTop(selNodes);
          break;
        case "bottom":
          posMap = alignBottom(selNodes);
          break;
        case "centerH":
          posMap = alignCenterH(selNodes);
          break;
        case "centerV":
          posMap = alignCenterV(selNodes);
          break;
        default:
          return;
      }
      setNodesState((ns) =>
        ns.map((n) => {
          const p = posMap[n.id];
          if (!p) return n;
          void canvasRepo.updateNode(n.id, { x: p.x, y: p.y });
          return { ...n, position: p };
        }),
      );
    },
    [getNodes, selectedNodeIds, setNodesState],
  );

  const applyDistribute = useCallback(
    (axis: "h" | "v") => {
      const selNodes = getNodes().filter((n) => selectedNodeIds.includes(n.id));
      if (selNodes.length < 3) return;
      const posMap =
        axis === "h" ? distributeH(selNodes) : distributeV(selNodes);
      setNodesState((ns) =>
        ns.map((n) => {
          const p = posMap[n.id];
          if (!p) return n;
          void canvasRepo.updateNode(n.id, { x: p.x, y: p.y });
          return { ...n, position: p };
        }),
      );
    },
    [getNodes, selectedNodeIds, setNodesState],
  );

  const applyAutoGrid = useCallback(
    (selectedOnly: boolean) => {
      const target = selectedOnly
        ? getNodes().filter((n) => selectedNodeIds.includes(n.id))
        : getNodes();
      if (target.length === 0) return;
      const posMap = autoGrid(target);
      setNodesState((ns) =>
        ns.map((n) => {
          const p = posMap[n.id];
          if (!p) return n;
          void canvasRepo.updateNode(n.id, { x: p.x, y: p.y });
          return { ...n, position: p };
        }),
      );
    },
    [getNodes, selectedNodeIds, setNodesState],
  );

  /* ── Grouping ───────────────────────────────────────────────────────────── */

  // Wrap the current selection in a real group: children get parentId, their
  // positions become relative to the group, and everything persists.
  const groupSelection = useCallback(async () => {
    if (!canvasId) return;
    const selNodes = getNodes().filter(
      (n) => selectedNodeIds.includes(n.id) && !n.parentId,
    );
    if (selNodes.length < 2) return;
    const PAD = 56;
    const x = Math.min(...selNodes.map((n) => n.position.x)) - PAD;
    const y = Math.min(...selNodes.map((n) => n.position.y)) - PAD;
    const width =
      Math.max(...selNodes.map((n) => n.position.x + (n.width ?? 280))) -
      x +
      PAD;
    const height =
      Math.max(...selNodes.map((n) => n.position.y + (n.height ?? 160))) -
      y +
      PAD;
    const group = await canvasRepo.addNode({
      canvasId,
      type: "group",
      x,
      y,
      width,
      height,
      data: { label: "Group" },
    });
    for (const n of selNodes) {
      void canvasRepo.updateNode(n.id, {
        parentId: group.id,
        x: n.position.x - x,
        y: n.position.y - y,
      });
    }
    setNodesState((ns) => [
      ...ns.map((n) =>
        selectedNodeIds.includes(n.id)
          ? {
              ...n,
              parentId: group.id,
              extent: "parent" as const,
              position: {
                x: n.position.x - x,
                y: n.position.y - y,
              },
            }
          : n,
      ),
      toFlowNode(group),
    ]);
  }, [canvasId, getNodes, selectedNodeIds, setNodesState, toFlowNode]);

  // Detach a group's children (restoring absolute positions) and drop the
  // group node itself.
  const ungroup = useCallback(
    (groupId: string) => {
      const group = getNodes().find((n) => n.id === groupId);
      const ox = group?.position.x ?? 0;
      const oy = group?.position.y ?? 0;
      for (const n of getNodes()) {
        if (n.parentId === groupId) {
          void canvasRepo.updateNode(n.id, {
            parentId: null,
            x: ox + n.position.x,
            y: oy + n.position.y,
          });
        }
      }
      void canvasRepo.removeNode(groupId);
      setNodesState((ns) =>
        ns
          .filter((n) => n.id !== groupId)
          .map((n) =>
            n.parentId === groupId
              ? {
                  ...n,
                  parentId: undefined,
                  extent: undefined,
                  position: { x: ox + n.position.x, y: oy + n.position.y },
                }
              : n,
          ),
      );
    },
    [getNodes, setNodesState],
  );

  // Deleting a group removes its children too (recursively).
  const deleteWithChildren = useCallback(
    (ids: string[]) => {
      const doomed = new Set(ids);
      let grew = true;
      while (grew) {
        grew = false;
        for (const n of getNodes()) {
          if (n.parentId && doomed.has(n.parentId) && !doomed.has(n.id)) {
            doomed.add(n.id);
            grew = true;
          }
        }
      }
      for (const id of doomed) void canvasRepo.removeNode(id);
      setNodesState((ns) => ns.filter((n) => !doomed.has(n.id)));
    },
    [getNodes, setNodesState],
  );

  /* ── Context menu handlers ──────────────────────────────────────────────── */

  const onPaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault();
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      nodeId: null,
      multiSelect: false,
    });
  }, []);

  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent | MouseEvent, node: Node) => {
      e.preventDefault();
      const multi =
        selectedNodeIds.length >= 2 && selectedNodeIds.includes(node.id);
      setCtxMenu({
        x: e.clientX,
        y: e.clientY,
        nodeId: node.id,
        multiSelect: multi,
      });
    },
    [selectedNodeIds],
  );

  /* ── OS drag-drop ───────────────────────────────────────────────────────── */

  function onDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDragOver(true);
    }
  }
  function onDragLeave() {
    setDragOver(false);
  }
  async function onDrop(e: React.DragEvent) {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    setDragOver(false);
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    for (const file of Array.from(e.dataTransfer.files)) {
      await addMediaNodeFromFile(file, pos);
    }
  }

  /* ── Click-to-add (Milanote-style palette) ──────────────────────────────── */

  // Clicking the empty board opens the card palette at the cursor; the same
  // click also deselects nodes and closes any open context menu.
  function onPaneClick(e: React.MouseEvent) {
    setCtxMenu(null);
    const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    insertPosRef.current = flow;
    setPalette({ x: e.clientX, y: e.clientY });
  }

  // Close the palette when clicking elsewhere or pressing Escape.
  useEffect(() => {
    if (!palette) return;
    function onDown(e: PointerEvent) {
      if (paletteRef.current?.contains(e.target as Element)) return;
      setPalette(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPalette(null);
    }
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [palette]);

  // Double-click empty space → a text card right there, ready to type.
  function onBoardDoubleClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (
      !target.closest(".react-flow__pane") &&
      !target.closest(".react-flow__background")
    ) {
      return;
    }
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    void addTextNode(pos);
  }

  function takeInsertPos(): { x: number; y: number } | undefined {
    const pos = insertPosRef.current;
    insertPosRef.current = null;
    return pos ?? undefined;
  }

  function openNotePicker(clearPos = false) {
    if (clearPos) insertPosRef.current = null;
    setNotePickerOpen(true);
  }

  function onFilesPicked(files: FileList | null) {
    const pos = takeInsertPos();
    for (const file of Array.from(files ?? [])) {
      void addMediaNodeFromFile(file, pos);
    }
  }

  /* ── Keyboard shortcuts ─────────────────────────────────────────────────── */

  useCanvasShortcuts({
    onNewText: () => void addTextNode(),
    onDuplicate: () => {
      for (const id of selectedNodeIds) void duplicateNode(id);
    },
    onGroup: () => addGroupNode(),
    onSelectAll: () => {
      setNodesState((ns) => ns.map((n) => ({ ...n, selected: true })));
    },
  });

  /* ── AI context seam ────────────────────────────────────────────────────── */
  // Register imperative operations so the chat agent / workflow pipeline can
  // manipulate the canvas without coupling to the board's internals. Cleaned
  // up on unmount so a stale context is never left behind.
  useEffect(() => {
    const ctx: CanvasAIContext = {
      canvasId,
      canvasName: currentCanvas?.name ?? "Canvas",
      nodeCount: nodes.length,
      edgeCount: edges.length,
      nodes: nodes.map((n): CanvasNodeSummary => ({
        id: n.id,
        type: n.type ?? "text",
        title:
          (n.data as { title?: string }).title ??
          (n.data as { text?: string }).text?.split("\n")[0] ??
          "Untitled",
        position: n.position,
      })),
      addTextCard: async (text, pos) => {
        await addNode("text", { text }, pos);
        return nodes[nodes.length - 1]?.id ?? "";
      },
      addNoteCard: async (noteId, title, excerpt) => {
        await addNode("note", { noteId, title, excerpt, mode: "preview" });
        return nodes[nodes.length - 1]?.id ?? "";
      },
      addWebCard: async (url) => {
        await addWebNode(url);
        return nodes[nodes.length - 1]?.id ?? "";
      },
      addGroup: async (label) => {
        await addNode("group", { label });
        return nodes[nodes.length - 1]?.id ?? "";
      },
      autoArrange: (selectedOnly) => applyAutoGrid(selectedOnly ?? false),
      connect: async (fromId, toId, label) => {
        if (!canvasId) return "";
        const edge = await canvasRepo.addEdge({
          canvasId,
          source: fromId,
          target: toId,
          label: label ?? "",
        });
        setEdgesState((es) =>
          addEdge(
            { id: edge.id, source: fromId, target: toId, ...EDGE_DEFAULTS },
            es,
          ),
        );
        return edge.id;
      },
      deleteNode: (id) => deleteNode(id),
      summarize: () =>
        nodes.map((n): CanvasNodeSummary => ({
          id: n.id,
          type: n.type ?? "text",
          title:
            (n.data as { title?: string }).title ??
            (n.data as { text?: string }).text?.split("\n")[0] ??
            "Untitled",
          position: n.position,
        })),
    };
    setCanvasAIContext(ctx);
    return () => setCanvasAIContext(null);
  }, [
    canvasId,
    currentCanvas,
    nodes,
    edges,
    addNode,
    addWebNode,
    applyAutoGrid,
    deleteNode,
    setEdgesState,
  ]);

  /* ── Lifecycle ──────────────────────────────────────────────────────────── */

  async function createFirstCanvas() {
    if (!projectId) return;
    const canvas = await canvasRepo.create({
      projectId,
      name: `Canvas ${(canvases?.length ?? 0) + 1}`,
    });
    router.replace(`/brain/canvas?canvas=${canvas.id}`);
  }

  if (!projectId) return null;

  if ((canvases?.length ?? 0) === 0) {
    return (
      <EmptyState
        icon={LayoutTemplate}
        title="No canvas yet"
        description="Create a visual canvas to arrange notes, text cards, media, web embeds, and connections. Export and import Obsidian-compatible .canvas files."
        className="h-full"
        action={
          <Button onClick={createFirstCanvas}>
            <Plus className="h-4 w-4" /> New canvas
          </Button>
        }
      />
    );
  }

  const ctxTargetNode = ctxMenu?.nodeId
    ? {
        id: ctxMenu.nodeId,
        type: nodes.find((n) => n.id === ctxMenu.nodeId)?.type ?? "text",
      }
    : null;
  const ctxLocked = ctxMenu?.nodeId
    ? !!nodes.find((n) => n.id === ctxMenu.nodeId)?.data?.locked
    : false;

  return (
    <div className="masarflow-canvas relative flex h-full flex-col overflow-hidden">
      <CanvasToolbar
        projectId={projectId}
        canvases={canvases ?? []}
        canvasId={canvasId}
        currentName={currentCanvas?.name ?? "Canvas"}
        onAddWeb={() => {
          insertPosRef.current = null;
          setWebDialogOpen(true);
        }}
      />

      {/* Left quick-add rail (Milanote-style) */}
      <div className="absolute top-[3.75rem] left-3 z-20 flex flex-col gap-0.5 rounded-xl border border-border bg-card/85 p-1 shadow-lg backdrop-blur">
        <RailButton
          icon={Type}
          label="Add text card"
          onClick={() => void addTextNode()}
        />
        <RailButton
          icon={FileText}
          label="Add note card"
          onClick={() => openNotePicker(true)}
        />
        <RailButton
          icon={ImageIcon}
          label="Add image"
          onClick={() => {
            insertPosRef.current = null;
            imageInputRef.current?.click();
          }}
        />
        <RailButton
          icon={Paperclip}
          label="Add file"
          onClick={() => {
            insertPosRef.current = null;
            fileInputRef.current?.click();
          }}
        />
        <RailButton
          icon={Globe}
          label="Add web page"
          onClick={() => {
            insertPosRef.current = null;
            setWebDialogOpen(true);
          }}
        />
        <RailButton
          icon={Box}
          label="Add group"
          onClick={() => void addGroupNode()}
        />
      </div>

      <div
        ref={boardRef}
        className={
          "min-h-0 flex-1 " +
          (dragOver ? "ring-2 ring-primary/40 ring-inset" : "")
        }
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={(e) => void onDrop(e)}
        onDoubleClick={onBoardDoubleClick}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onNodesDelete={(deleted) =>
            deleteWithChildren(deleted.map((n) => n.id))
          }
          onEdgesDelete={(deleted) =>
            deleted.forEach((e) => void canvasRepo.removeEdge(e.id))
          }
          onPaneContextMenu={onPaneContextMenu}
          onNodeContextMenu={onNodeContextMenu}
          onPaneClick={onPaneClick}
          nodeTypes={canvasNodeTypes}
          snapToGrid={settings.snapToGrid}
          snapGrid={[settings.gridSize, settings.gridSize]}
          minZoom={0.1}
          maxZoom={4}
          deleteKeyCode={["Delete", "Backspace"]}
          multiSelectionKeyCode={["Meta", "Control"]}
          selectionKeyCode="Shift"
          colorMode={resolvedTheme === "light" ? "light" : "dark"}
          fitView
          zoomOnScroll={false}
          proOptions={{ hideAttribution: true }}
        >
          {settings.showGrid ? (
            <Background
              variant={BackgroundVariant.Dots}
              gap={settings.gridSize}
              size={1}
            />
          ) : null}
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>

      {/* Context menu overlay */}
      <CanvasContextMenu
        coords={ctxMenu ? { x: ctxMenu.x, y: ctxMenu.y } : null}
        onClose={() => setCtxMenu(null)}
        onAddText={(pos) => void addTextNode(pos ?? undefined)}
        onAddNote={() => openNotePicker(true)}
        onAddWeb={() => {
          insertPosRef.current = null;
          setWebDialogOpen(true);
        }}
        onAddGroup={addGroupNode}
        targetNode={ctxTargetNode}
        onDuplicate={(id) => void duplicateNode(id)}
        onDelete={(id) => deleteNode(id)}
        onChangeColor={(id, c) => changeNodeColor(id, c)}
        onToggleLock={(id) => toggleNodeLock(id)}
        onBringForward={(id) => bringForward(id)}
        onSendBackward={(id) => sendBackward(id)}
        locked={ctxLocked}
        multiSelect={ctxMenu?.multiSelect ?? false}
        selectedCount={selectedNodeIds.length}
        onAlign={(mode) => applyAlignment(mode)}
        onDistribute={(axis) => applyDistribute(axis)}
        onAutoGrid={() => applyAutoGrid(true)}
        onGroupSelection={() => void groupSelection()}
        onUngroup={ungroup}
      />

      {/* Empty-board hint */}
      {nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 z-10 flex justify-center">
          <div className="rounded-full border border-border bg-card/80 px-4 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
            Click anywhere to add a card · Double-click for a text card ·
            Drag files in to drop them on the board
          </div>
        </div>
      ) : null}

      {/* Click-to-add palette */}
      {palette ? (
        <div
          ref={paletteRef}
          className="mf-pop fixed z-30"
          style={{ left: palette.x, top: palette.y }}
        >
          <div className="w-44 rounded-xl border border-border bg-popover/95 p-1 shadow-2xl backdrop-blur">
            <PaletteItem
              icon={Type}
              label="Text"
              onClick={() => {
                void addTextNode(takeInsertPos());
                setPalette(null);
              }}
            />
            <PaletteItem
              icon={FileText}
              label="Note"
              onClick={() => {
                setPalette(null);
                setNotePickerOpen(true);
              }}
            />
            <PaletteItem
              icon={ImageIcon}
              label="Image"
              onClick={() => {
                setPalette(null);
                imageInputRef.current?.click();
              }}
            />
            <PaletteItem
              icon={Paperclip}
              label="File"
              onClick={() => {
                setPalette(null);
                fileInputRef.current?.click();
              }}
            />
            <PaletteItem
              icon={Globe}
              label="Link"
              onClick={() => {
                setPalette(null);
                setWebDialogOpen(true);
              }}
            />
            <PaletteItem
              icon={Box}
              label="Group"
              onClick={() => {
                void addGroupNode(takeInsertPos());
                setPalette(null);
              }}
            />
          </div>
        </div>
      ) : null}

      {/* Hidden pickers for palette/rail image & file cards */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          onFilesPicked(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          onFilesPicked(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Add link dialog */}
      {webDialogOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/60 backdrop-blur-sm"
          onClick={() => {
            setWebDialogOpen(false);
            insertPosRef.current = null;
          }}
        >
          <div
            className="w-96 rounded-xl border border-border bg-popover p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-sm font-semibold">Add web page card</h3>
            <input
              type="url"
              placeholder="https://example.com"
              value={webUrl}
              onChange={(e) => setWebUrl(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && webUrl.trim()) {
                  void addWebNode(webUrl.trim(), takeInsertPos());
                  setWebUrl("");
                  setWebDialogOpen(false);
                }
              }}
              className="mb-3 w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setWebDialogOpen(false);
                  insertPosRef.current = null;
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!webUrl.trim()}
                onClick={() => {
                  void addWebNode(webUrl.trim(), takeInsertPos());
                  setWebUrl("");
                  setWebDialogOpen(false);
                }}
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Note picker (palette/rail/context-menu "Add note") */}
      <Dialog
        open={notePickerOpen}
        onOpenChange={(v) => {
          if (!v) insertPosRef.current = null;
          setNotePickerOpen(v);
        }}
        position="top"
        ariaLabel="Add note card"
      >
        <DialogHeader>
          <DialogTitle>Add note card</DialogTitle>
        </DialogHeader>
        <div className="scrollbar-thin max-h-72 overflow-y-auto px-5 pb-5">
          {(projectNotes ?? []).length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">
              No notes yet — create one in the Notes tab first.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {(projectNotes ?? []).map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      addNoteNode(n.id, n.title, n.excerpt, takeInsertPos());
                      setNotePickerOpen(false);
                    }}
                    className="w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    {n.title || "Untitled note"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>
    </div>
  );
}

export function CanvasBoard() {
  return (
    <ReactFlowProvider>
      <CanvasBoardInner />
    </ReactFlowProvider>
  );
}

/* ── Small floating UI helpers ────────────────────────────────────────────── */

function RailButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Type;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function PaletteItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Type;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm text-popover-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      {label}
    </button>
  );
}
