import { useDockStore } from "@/lib/stores/dock";
import { useProjectStore } from "@/lib/stores/project";
import { useRecentStore } from "@/lib/stores/recent";
import { KIND_META, entityHref, type EntityRef } from "./registry";
import { titleOfEntity } from "./resolve";

/** Show an entity: focus-or-open its page in the dock with the entity selected.
 * The URL <-> dock sync (use-dock-sync) mirrors the new focus into the address bar.
 * The visit is recorded for the palette's Recent lane (fire-and-forget: the open
 * itself is synchronous, and the title read only improves the row's label). */
export function openEntity(ref: EntityRef): void {
  const href = entityHref(ref);
  useDockStore.getState().open(href);

  const projectId = useProjectStore.getState().activeProjectId;
  if (!projectId) return;
  void titleOfEntity(ref)
    .catch(() => null)
    .then((title) =>
      useRecentStore.getState().rememberEntity(projectId, {
        id: ref.id,
        label: title ?? KIND_META[ref.kind].label,
        href,
      }),
    );
}
