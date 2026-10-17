# UI budget (MasarFlow desktop app)

Numbers, not adjectives. P9 measures these; P8 must not regress them.

## Interaction latency (measured in the packaged app, median of 10 runs)
| Interaction | Budget | How P9 measures |
|---|---|---|
| Open a dock panel (already mounted) | < 50 ms | `performance.now()` around the tab click in Playwright, assert the panel's `data-testid="panel-active"` is visible |
| Switch a tab in a group | < 50 ms | same, between two tabs |
| Open the command palette (⌘/Ctrl+K) until the input is focused | < 150 ms | Playwright: keypress → `document.activeElement` is the palette input |
| Focus movement (Alt+Shift+→) | < 60 ms | Playwright: keypress → the neighbour tab has `aria-selected="true"` |
| Split resize drag (60 frames) | no frame > 32 ms | `requestAnimationFrame` deltas collected in the page, assert p95 < 32 ms |
| Streamed chat first token | < 800 ms (unchanged from P5) | P5's existing Playwright spec |

## Keyboard reachability (assert once per route)
- Every panel header control (close, actions menu, all-tabs menu) is reachable with Tab and operable with Enter/Space.
- The tab strip follows the WAI-ARIA tabs pattern: ArrowLeft/ArrowRight/Home/End move, Delete closes.
- Split dividers are focusable and resizable with arrows; `aria-valuenow` changes.
- The palette traps focus and restores it to the previously focused element on close.
- No keyboard trap anywhere else: `Escape` always closes the top overlay.

## Accessibility (axe-core via `@axe-core/playwright`, P9 adds the dep)
- Zero `critical`/`serious` violations on `/today`, `/dashboard`, `/tools/logs`, `/tools/system`, and the palette open.
- Every icon-only button has an `aria-label` (checked at review time; P9's axe run catches regressions).
- Colour is never the only signal: overdue rows carry the word "Overdue", errors carry the word "error".

## Copy rules (formal, self-explanatory — the house style)
- No unexplained symbols or abbreviations in UI copy; every control names its effect.
- Destructive actions state the consequence and offer undo or a confirmation — never both a silent wipe and a "success" toast.
- Empty states say what to do next ("Link a folder in Chat → Linked folders"), never just "No data".
- Panel errors name the panel and offer exactly one recovery action ("Reload panel").

## What will NOT be measured
- Bundle size per route (the desktop app loads from localhost; the P10 perf pass owns this).
- Availability with no linked folder (the terminal/logs panels are desktop-only by design and must *say so*, not degrade silently).
