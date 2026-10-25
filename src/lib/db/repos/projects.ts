import { db } from "@/lib/db";
import type { Project } from "@/lib/db/schema";
import { uuid, now, slugify } from "@/lib/utils/ids";
import { removeProject } from "@/lib/domain/commands";

export const projectsRepo = {
  all(): Promise<Project[]> {
    return db.projects.orderBy("updatedAt").reverse().toArray();
  },

  get(id: string): Promise<Project | undefined> {
    return db.projects.get(id);
  },

  count(): Promise<number> {
    return db.projects.count();
  },

  async create(
    input: Pick<Project, "name"> & Partial<Project>,
  ): Promise<Project> {
    const ts = now();
    const project: Project = {
      id: input.id ?? uuid(),
      name: input.name,
      slug: input.slug ?? slugify(input.name),
      description: input.description ?? "",
      icon: input.icon ?? "box",
      iconImage: input.iconImage ?? "",
      tags: input.tags ?? [],
      category: input.category ?? "",
      banner: input.banner ?? "",
      bannerMode: input.bannerMode ?? "none",
      bannerBlur: input.bannerBlur ?? 0,
      bannerBrightness: input.bannerBrightness ?? 100,
      health: input.health ?? 100,
      archScore: input.archScore ?? 100,
      techDebt: input.techDebt ?? 0,
      accent: input.accent ?? "violet",
      createdAt: input.createdAt ?? ts,
      updatedAt: ts,
    };
    await db.projects.add(project);
    return project;
  },

  async update(id: string, patch: Partial<Project>): Promise<void> {
    await db.projects.update(id, { ...patch, updatedAt: now() });
  },

  /** Delete a project and every record that belongs to it (tables discovered from the schema). */
  async remove(id: string): Promise<void> {
    await removeProject(id);
  },

  /**
   * Guarantee at least one project exists so the workspace is always usable.
   * Returns the id of an existing project (most recently updated) or a freshly
   * created empty one. This is infrastructure, not demo data.
   */
  async ensureDefault(): Promise<string> {
    const existing = await db.projects.orderBy("updatedAt").last();
    if (existing) return existing.id;
    const project = await this.create({
      name: "My Project",
      description: "Your first MasarFlow project.",
    });
    return project.id;
  },
};
