# UI budget (MasarFlow desktop app)

Numbers, not adjectives. The packaged e2e suite measures these; a change must not regress them.

## Interaction latency (measured in the packaged app, median of 10 runs)
| Interaction | Budget | How it is measured |
|---|---|---|
| Switch to a mounted project tab | < 50 ms | `performance.now()` around the tab click in Playwright, assert the tab's `[data-testid="dock-panel"]` is visible |
| Open the command palette (⌘/Ctrl+K) until the input is focused | < 150 ms | Playwright: keypress → `document.activeElement` is the palette input |
| Cycle tabs (Ctrl+Tab) | < 60 ms | Playwright: keypress → the next tab has `aria-selected="true"` |
| Streamed chat first token | < 800 ms (unchanged from P5) | P5's existing Playwright spec |

## Keyboard reachability (assert once per route)
- Every tab's close button and the inspector toggle are reachable with Tab and operable with Enter/Space.
- The tab strip follows the WAI-ARIA tabs pattern: ArrowLeft/ArrowRight/Home/End move, Delete closes.
- The palette traps focus and restores it to the previously focused element on close.
- No keyboard trap anywhere else: `Escape` always closes the top overlay.

## Accessibility (axe-core via `@axe-core/playwright`)
- Zero violations on every surface and with the palette open (`reports/v0.3/a11y/summary.json`, no allow-list).
- Every icon-only button has an `aria-label` (checked at review time; P9's axe run catches regressions).
- Colour is never the only signal: overdue rows carry the word "Overdue", errors carry the word "error".

## Copy rules (formal, self-explanatory — the house style)
- No unexplained symbols or abbreviations in UI copy; every control names its effect.
- Destructive actions state the consequence and offer undo or a confirmation — never both a silent wipe and a "success" toast.
- Empty states say what to do next ("Link a folder in Chat → Linked folders"), never just "No data".
- Page errors name the page and offer exactly one recovery action ("Reload panel").

## What will NOT be measured
- Bundle size per route (the desktop app loads from localhost).
- Availability with no linked folder (the terminal/logs panels are desktop-only by design and must *say so*, not degrade silently).
