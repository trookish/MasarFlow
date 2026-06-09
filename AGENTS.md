# AGENTS.md — Working Notes for AI Agents

## Project

**MasarFlow** — AI-native development workflow platform. See README.md for the full product brief.

## Stack (locked)

- Next.js 15 (App Router, Turbopack), React 19, TypeScript strict
- Tailwind CSS v4, shadcn/ui new-york v4, Radix Primitives
- Motion (formerly Framer Motion), Zustand v5, Dexie.js
- cmdk, lucide-react, next-themes, sonner, zod

## Commands

- `npm run dev` — dev server (Turbopack)
- `npm run build` — production build
- `npm run typecheck` — TypeScript check
- `npm run lint` — ESLint
- `npm run format` — Prettier

Always run `typecheck` and `lint` after non-trivial changes.

## Conventions

- Path alias `@/*` → `./src/*`
- All app routes under `src/app/(workspace)/`
- Components colocated; UI primitives in `src/components/ui/`
- Data: Dexie tables in `src/lib/db/schema.ts`; repos in `src/lib/db/repos/*`
- State: Zustand slices in `src/lib/stores/*`
- No code comments unless asked
- No emojis in code unless asked
- No new dependencies without confirmation

## Roadmap

Six-session staged build. **S1 (Foundation)** is in progress. Do not jump ahead — instead, deepen S1 until it ships. See README.md for the per-session breakdown.

## Design tokens

All defined in `src/styles/globals.css` via Tailwind v4 `@theme inline`. Never hardcode colors. Always use tokens (`bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, etc.) so theme switching works.

## Theme

Dark-first. Default `class="dark"` on `<html>`. `next-themes` with `attribute="class"`. Avoid `prefers-color-scheme` heuristics that fight the explicit class.

## Animation defaults

Use Motion's `layoutId` for shared element transitions (active nav, command palette highlight, graph node focus). Page transitions: 200ms cross-fade + 4px Y. Durations: 150ms hover, 250ms layout, springs only on physical-feeling interactions.
