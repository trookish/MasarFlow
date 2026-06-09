import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "../schema";
import type {
  Standard,
  DevLog,
  Doc,
  Commit,
  Memory,
  Agent,
  System,
  ArchNode,
  ArchEdge,
  Folder,
  Tag,
} from "../schema";

export { useTasks } from "./tasks";

export const useStandards = (projectId: string | undefined) =>
  useLiveQuery(
    () =>
      projectId
        ? getDb().standards.where("projectId").equals(projectId).toArray()
        : Promise.resolve([] as Standard[]),
    [projectId],
    [] as Standard[],
  );

export const useDevLogs = (projectId: string | undefined) =>
  useLiveQuery(
    () =>
      projectId
        ? getDb().devLogs.where("projectId").equals(projectId).reverse().sortBy("createdAt")
        : Promise.resolve([] as DevLog[]),
    [projectId],
    [] as DevLog[],
  );

export const useDocs = (projectId: string | undefined) =>
  useLiveQuery(
    () =>
      projectId
        ? getDb().docs.where("projectId").equals(projectId).toArray()
        : Promise.resolve([] as Doc[]),
    [projectId],
    [] as Doc[],
  );

export const useCommits = (projectId: string | undefined) =>
  useLiveQuery(
    () =>
      projectId
        ? getDb().commits.where("projectId").equals(projectId).reverse().sortBy("date")
        : Promise.resolve([] as Commit[]),
    [projectId],
    [] as Commit[],
  );

export const useMemories = (projectId: string | undefined) =>
  useLiveQuery(
    () =>
      projectId
        ? getDb().memories.where("projectId").equals(projectId).toArray()
        : Promise.resolve([] as Memory[]),
    [projectId],
    [] as Memory[],
  );

export const useAgents = () =>
  useLiveQuery(() => getDb().agents.toArray(), [], [] as Agent[]);

export const useSystems = (projectId: string | undefined) =>
  useLiveQuery(
    () =>
      projectId
        ? getDb().systems.where("projectId").equals(projectId).toArray()
        : Promise.resolve([] as System[]),
    [projectId],
    [] as System[],
  );

export const useArchGraph = (projectId: string | undefined) =>
  useLiveQuery(
    async () => {
      if (!projectId) return { nodes: [] as ArchNode[], edges: [] as ArchEdge[] };
      const [nodes, edges] = await Promise.all([
        getDb().archNodes.where("projectId").equals(projectId).toArray(),
        getDb().archEdges.toArray(),
      ]);
      const nodeIds = new Set(nodes.map((n) => n.id));
      const filteredEdges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
      return { nodes, edges: filteredEdges };
    },
    [projectId],
    { nodes: [] as ArchNode[], edges: [] as ArchEdge[] },
  );

export const useFolders = (projectId: string | undefined) =>
  useLiveQuery(
    () =>
      projectId
        ? getDb().folders.where("projectId").equals(projectId).toArray()
        : Promise.resolve([] as Folder[]),
    [projectId],
    [] as Folder[],
  );

export const useTags = () => useLiveQuery(() => getDb().tags.toArray(), [], [] as Tag[]);
