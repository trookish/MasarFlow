# UI audit P0 findings (packaged app, demo data, 1000/1280/1600 wide)

Evidence: `tab-trace.json` (111 snapshots), 82 screenshots in this folder.

## Reported defects, reproduced
1. **Duplicate "tab"** — NOT a second tab. Max tabs open = 6 (one per surface) after 2 repeat clicks per surface. The name repeats 4x on one screen: tab strip ("Today"), SurfaceView header ("Today" + description), page heading ("Today — Wednesday…"), Inspector ("TODAY / Focus" + same description). Fix = remove the repeated surface header + description; make the inspector show the selection, not a copy of the header.
2. **Inspector** — fixed ~320px at >=1280 (board shows 2.5 columns); fully hidden at 1000 (no way to open it). Empty state on every page is a generic "Nothing selected … select a commit or memory" (wrong kinds on Today/Canvas/Graph/Architecture). It duplicates the surface description.
3. Logo gradient — see logo.tsx (reads only accentColor).

## Per page
- Today: Repository card is a dead-end hint; cards are text-only; right column empty below Inbox.
- Task board: header "Work" + "Task Boards" + toolbar = 3 stacked headers (~150px before content). 4th column cut off at 1280 with inspector docked.
- Knowledge graph: nodes bunched at right edge and partly off-screen, labels overlap and are tiny (<12px), no filters/forces/local-graph panel, legend overlaps bottom, big empty canvas.
- Canvas: demo canvas renders empty at load (no fit-to-content), left tool rail floats over the board, minimap is a blank grey box, hint pill at bottom.
- Architecture: opens on the Systems list; the Diagram is hidden behind a sub-tab; right pane is a big empty state. Double sub-navigation (surface section tabs + Systems/Diagram).
- Chat: "Ask" title; sessions list shows one truncated item; empty state says "Pick a backend from the header" but no model/permission controls visible; no composer visible in empty state.
- Chrome: "Desktop 0.2.0.0" pill takes ~90px of the topbar and wraps at 1000px ("Search everything…" wraps to 2 lines); inspector toggle sits next to theme toggle with no label.

## References gathered
- Linear: dense list, grouped, minimal chrome; Notion side peek: title + property rows (icon, label, value) + comment + body; Claude Code desktop: transcript with collapsed tool runs, composer footer "Accept edits · + · mic · model · effort"; Obsidian graph: Filters / Groups / Display / Forces panel + local graph depth; Obsidian canvas: grouped cards with labelled frames, dotted grid.
