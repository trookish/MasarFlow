"use client";

/**
 * Re-export of Dexie's live query hook. Subscribes a Client Component to an
 * IndexedDB query and re-renders on any change. SSR-safe: returns `undefined`
 * on the server and during the first client render.
 */
export { useLiveQuery } from "dexie-react-hooks";
