import { describe, it, expect } from "vitest";
import {
  toCanvasFile,
  fromCanvasFile,
  serializeCanvas,
  parseCanvasFile,
} from "./canvas-file";
import type { CanvasNode, CanvasEdge } from "./db/schema";

const ts = Date.now();

const nodes: CanvasNode[] = [
  {
    id: "n1",
    canvasId: "c1",
    type: "text",
    x: 100,
    y: 50,
    width: 240,
    height: 140,
    data: { text: "# Hello" },
    color: "",
    createdAt: ts,
    updatedAt: ts,
  },
  {
    id: "n2",
    canvasId: "c1",
    type: "note",
    x: 400,
    y: 50,
    width: 260,
    height: 160,
    data: { noteId: "note-abc", title: "My Note", excerpt: "lorem" },
    color: "#a882ff",
    createdAt: ts,
    updatedAt: ts,
  },
  {
    id: "n3",
    canvasId: "c1",
    type: "link",
    x: 100,
    y: 300,
    width: 320,
    height: 200,
    data: { url: "https://example.com", title: "Example" },
    color: "",
    createdAt: ts,
    updatedAt: ts,
  },
  {
    id: "g1",
    canvasId: "c1",
    type: "group",
    x: 80,
    y: 20,
    width: 600,
    height: 500,
    data: { label: "Research" },
    color: "",
    createdAt: ts,
    updatedAt: ts,
  },
];

const edges: CanvasEdge[] = [
  {
    id: "e1",
    canvasId: "c1",
    source: "n1",
    target: "n2",
    sourceHandle: "right",
    targetHandle: "left",
    label: "references",
    color: "",
    createdAt: ts,
  },
];

describe("canvas-file adapter", () => {
  it("exports MasarFlow nodes to Obsidian canvas types", () => {
    const file = toCanvasFile(
      { name: "Board", description: "demo" },
      nodes,
      edges,
    );
    expect(file.nodes).toHaveLength(4);
    expect(file.nodes?.[0]).toMatchObject({
      id: "n1",
      type: "text",
      text: "# Hello",
    });
    expect(file.nodes?.[1]).toMatchObject({
      id: "n2",
      type: "file",
      label: "My Note",
    });
    expect(file.nodes?.[2]).toMatchObject({
      id: "n3",
      type: "link",
      url: "https://example.com",
    });
    expect(file.nodes?.[3]).toMatchObject({
      id: "g1",
      type: "group",
      label: "Research",
    });
  });

  it("maps edges fromNode/toNode + sides", () => {
    const file = toCanvasFile({ name: "B" }, nodes, edges);
    expect(file.edges?.[0]).toMatchObject({
      fromNode: "n1",
      toNode: "n2",
      fromSide: "right",
      toSide: "left",
      label: "references",
      toEnd: "arrow",
    });
  });

  it("preserves MasarFlow-only state in the masarflow bag", () => {
    const file = toCanvasFile({ name: "B" }, nodes, edges);
    expect(file.nodes?.[1].masarflow?.data).toEqual(nodes[1].data);
    expect(file.edges?.[0].masarflow).toMatchObject({
      sourceHandle: "right",
      targetHandle: "left",
    });
  });

  it("round-trips MasarFlow → file → MasarFlow losslessly", () => {
    const file = toCanvasFile(
      { name: "Board", description: "demo" },
      nodes,
      edges,
    );
    const imported = fromCanvasFile(file);

    expect(imported.name).toBe("Board");
    expect(imported.description).toBe("demo");
    expect(imported.nodes).toHaveLength(4);
    expect(imported.edges).toHaveLength(1);

    // IDs preserved so edge references stay valid.
    expect(imported.nodes.map((n) => n.id)).toEqual(["n1", "n2", "n3", "g1"]);
    // Types restored.
    expect(imported.nodes[0].type).toBe("text");
    expect(imported.nodes[1].type).toBe("note");
    expect(imported.nodes[2].type).toBe("link");
    expect(imported.nodes[3].type).toBe("group");
    // Payloads restored from the masarflow bag.
    expect(imported.nodes[0].data.text).toBe("# Hello");
    expect(imported.nodes[1].data.noteId).toBe("note-abc");
    expect(imported.nodes[1].data.title).toBe("My Note");
    expect(imported.nodes[2].data.url).toBe("https://example.com");
    expect(imported.nodes[3].data.label).toBe("Research");
    // Edge handles restored.
    expect(imported.edges[0]).toMatchObject({
      source: "n1",
      target: "n2",
      sourceHandle: "right",
      targetHandle: "left",
      label: "references",
    });
  });

  it("imports a foreign Obsidian file (no masarflow bag)", () => {
    const foreign: import("./canvas-file").ObsidianCanvasFile = {
      nodes: [
        { id: "x1", type: "text", x: 0, y: 0, width: 250, height: 150, text: "Hi" },
        {
          id: "x2",
          type: "link",
          x: 300,
          y: 0,
          width: 300,
          height: 200,
          url: "https://obsidian.md",
          label: "Obsidian",
        },
        {
          id: "x3",
          type: "group",
          x: -20,
          y: -20,
          width: 700,
          height: 400,
          label: "Moodboard",
        },
      ],
      edges: [
        {
          id: "xe1",
          fromNode: "x1",
          fromSide: "right",
          toNode: "x2",
          toSide: "left",
        },
      ],
    };
    const imported = fromCanvasFile(foreign, "My import");
    expect(imported.name).toBe("My import");
    expect(imported.nodes).toHaveLength(3);
    expect(imported.nodes[0].type).toBe("text");
    expect(imported.nodes[1].type).toBe("link");
    expect(imported.nodes[2].type).toBe("group");
    // Edges derive handles from sides when no masarflow bag is present.
    expect(imported.edges[0].sourceHandle).toBe("right");
    expect(imported.edges[0].targetHandle).toBe("left");
  });

  it("serializes to pretty, git-friendly JSON and parses back", () => {
    const file = toCanvasFile({ name: "B" }, nodes, edges);
    const text = serializeCanvas(file);
    expect(text).toContain('  "nodes": [\n');
    expect(text.endsWith("\n}")).toBe(true);
    const back = parseCanvasFile(text);
    expect(back.nodes).toHaveLength(4);
  });

  it("rejects non-object input", () => {
    expect(() => parseCanvasFile("[]")).toThrow();
  });
});
