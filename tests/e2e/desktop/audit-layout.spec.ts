import { test, expect } from "./_harness";
import { navRoutes, openRoute, setDockMode, writeAudit } from "./_audit";

/**
 * P0.T6 layout harness. For each window width and shell mode, visit every nav route and record each
 * visible interactive element whose box leaves the viewport or its nearest scroll container.
 * Records only: P5 turns a non-empty `clipped` list into a failure.
 */
const WIDTHS = [1000, 1280, 1440, 1920];
const HEIGHT = 800;

interface Clip {
  selector: string;
  overflowPx: number;
}

test("harness: layout matrix", async ({ desktop }) => {
  test.setTimeout(30 * 60_000);
  const { app, page } = desktop;
  const routes = navRoutes();
  expect(routes.length).toBeGreaterThan(5);
  const records: Array<{ width: number; mode: "dock" | "rail"; route: string; clipped: Clip[] }> = [];

  for (const mode of ["dock", "rail"] as const) {
    await setDockMode(page, mode === "dock");
    for (const width of WIDTHS) {
      await app.evaluate(({ BrowserWindow }, size) => {
        const win = BrowserWindow.getAllWindows()[0];
        win.unmaximize();
        win.setContentSize(size.width, size.height);
      }, { width, height: HEIGHT });
      for (const { href } of routes) {
        await openRoute(page, href);
        const clipped = await page.evaluate(() => {
          const out: Array<{ selector: string; overflowPx: number }> = [];
          const vw = document.documentElement.clientWidth;
          const vh = document.documentElement.clientHeight;
          const describe = (el: Element) => {
            const label = el.getAttribute("aria-label") || (el.textContent ?? "").trim().slice(0, 40);
            const id = el.id ? `#${el.id}` : "";
            return `${el.tagName.toLowerCase()}${id}[${label}]`;
          };
          const scrollParent = (el: Element): Element | null => {
            for (let p = el.parentElement; p; p = p.parentElement) {
              const s = getComputedStyle(p);
              if (/(auto|scroll|hidden)/.test(s.overflowX + s.overflowY)) return p;
            }
            return null;
          };
          for (const el of document.querySelectorAll("button, a[href], input, select, textarea, [role=button], [role=tab]")) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (getComputedStyle(el).visibility === "hidden") continue;
            let over = Math.max(0, r.right - vw, -r.left);
            if (r.top < vh && r.bottom > vh) over = Math.max(over, 0); // below-the-fold is scrolling, not clipping
            const parent = scrollParent(el);
            if (parent) {
              const pr = parent.getBoundingClientRect();
              const ps = getComputedStyle(parent);
              // Only a container that cannot scroll horizontally clips.
              if (!/(auto|scroll)/.test(ps.overflowX)) over = Math.max(over, r.right - pr.right, pr.left - r.left);
            }
            if (over > 1) out.push({ selector: describe(el), overflowPx: Math.round(over) });
          }
          return out.slice(0, 50);
        });
        records.push({ width, mode, route: href, clipped });
      }
    }
  }
  const file = writeAudit("layout.json", records);
  const total = records.reduce((n, r) => n + r.clipped.length, 0);
  test.info().annotations.push({ type: "layout", description: `${total} clipped elements → ${file}` });
  expect(records.length).toBe(routes.length * WIDTHS.length * 2);
});
