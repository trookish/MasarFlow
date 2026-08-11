import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { projectsRepo } from "@/lib/db/repos/projects";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("projectsRepo", () => {
  it("fills defaults for identity fields on create", async () => {
    const project = await projectsRepo.create({ name: "Pulse" });
    expect(project.icon).toBe("box");
    expect(project.iconImage).toBe("");
    expect(project.accent).toBe("violet");
    expect(project.tags).toEqual([]);
    expect(project.category).toBe("");
    expect(project.description).toBe("");
    expect(project.banner).toBe("");
    expect(project.bannerMode).toBe("none");
    expect(project.bannerBlur).toBe(0);
    expect(project.bannerBrightness).toBe(100);
    expect(project.slug).toBe("pulse");
  });

  it("persists icon, accent, tags, and category", async () => {
    const project = await projectsRepo.create({
      name: "Lumen",
      icon: "rocket",
      accent: "amber",
      tags: ["web", "realtime"],
      category: "web-app",
      description: "A live dashboard.",
    });
    const stored = await projectsRepo.get(project.id);
    expect(stored).toMatchObject({
      name: "Lumen",
      icon: "rocket",
      accent: "amber",
      tags: ["web", "realtime"],
      category: "web-app",
      description: "A live dashboard.",
    });
  });

  it("persists custom icon image and banner settings", async () => {
    const project = await projectsRepo.create({
      name: "Atlas",
      iconImage: "data:image/png;base64,AAAA",
      banner: "https://example.com/banner.png",
      bannerMode: "background",
      bannerBlur: 8,
      bannerBrightness: 60,
    });
    const stored = await projectsRepo.get(project.id);
    expect(stored).toMatchObject({
      iconImage: "data:image/png;base64,AAAA",
      banner: "https://example.com/banner.png",
      bannerMode: "background",
      bannerBlur: 8,
      bannerBrightness: 60,
    });
  });

  it("counts projects", async () => {
    expect(await projectsRepo.count()).toBe(0);
    await projectsRepo.create({ name: "A" });
    await projectsRepo.create({ name: "B" });
    expect(await projectsRepo.count()).toBe(2);
  });

  it("updates identity fields without clobbering others", async () => {
    const project = await projectsRepo.create({
      name: "Draft",
      icon: "box",
      accent: "violet",
    });
    await projectsRepo.update(project.id, {
      name: "DraftDeck",
      icon: "layers",
      accent: "emerald",
      tags: ["deck"],
    });
    const stored = await projectsRepo.get(project.id);
    expect(stored).toMatchObject({
      name: "DraftDeck",
      icon: "layers",
      accent: "emerald",
      tags: ["deck"],
      category: "",
    });
  });
});
