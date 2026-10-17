import { useDockStore } from "@/lib/stores/dock";
import { entityHref, type EntityRef } from "./registry";

/** Show an entity: focus-or-open its page in the dock with the entity selected.
 * The URL <-> dock sync (use-dock-sync) mirrors the new focus into the address bar. */
export function openEntity(ref: EntityRef): void {
  useDockStore.getState().open(entityHref(ref));
}
