# MasarFlow

> **Every feature has a path.**

AI-native development workflow platform. The central intelligence layer of a software project, where ideas evolve into knowledge, knowledge into specifications, specifications into implementation, and implementation into permanent project memory.

## Philosophy

```
Idea → Knowledge → Specification → Context Retrieval → Planning
     → Architecture Analysis → Implementation → Documentation
     → Reflection → Persistent Memory
```

## Stack

- **Next.js 15** (App Router, React 19, Turbopack)
- **TypeScript** (strict)
- **Tailwind CSS v4** (OKLCH tokens, `@theme inline`)
- **shadcn/ui** (new-york v4) on **Radix Primitives**
- **Motion** (formerly Framer Motion) for animations
- **Zustand v5** for client state
- **Dexie.js (IndexedDB)** for offline-first persistence
- **cmdk** for the command palette
- **Lucide** icons, **Inter** + **JetBrains Mono** fonts
- **MiniSearch** for global search

## Getting Started

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Run production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm run format` | Prettier write |
| `npm run seed:reset` | Clear IndexedDB seed data |

## Project Structure

```
src/
  app/                  # Next.js App Router routes
    (workspace)/        # Authenticated 3-pane shell
      layout.tsx
      page.tsx          # Dashboard
      brain/            # Notes
      specs/            # Specifications
      standards/        # Personal standards
      architecture/     # Architecture
      knowledge-graph/  # Cross-module graph
      tasks/            # Task system
      agents/           # AI agents
      docs/             # Documentation
      dev-logs/         # Timeline
      search/           # Global search
      settings/         # Preferences
  components/
    ui/                 # shadcn/ui primitives
    shell/              # 3-pane shell, nav, top bar, right rail, status bar
    motion/             # Reusable motion wrappers
    common/             # Shared composed components
  lib/
    db/                 # Dexie schema, repos, seed
    stores/             # Zustand slices
    ai/                 # Simulated + optional real LLM
    hooks/              # Custom hooks
    utils.ts            # cn(), formatters
  styles/
    globals.css         # Tokens, theme
```

## Keyboard

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette |
| `⌘P` / `Ctrl+P` | Project switcher |
| `⌘/` / `Ctrl+/` | Global search |
| `⌘B` / `Ctrl+B` | Toggle left nav |
| `⌘.` / `Ctrl+.` | Toggle right rail |
| `G` then `D` | Go to Dashboard |
| `G` then `S` | Go to Specifications |
| `G` then `B` | Go to Brain |
| `G` then `T` | Go to Tasks |
| `G` then `A` | Go to Architecture |
| `G` then `K` | Go to Knowledge Graph |
| `G` then `L` | Go to Dev Logs |
| `G` then `C` | Go to Commands |
| `?` | Shortcut cheatsheet |

## Roadmap

| Session | Theme |
|---|---|
| **S1** | Foundation, shell, all modules routable, seed data |
| **S2** | Brain, Standards, Documentation, Dev Logs (Tiptap) |
| **S3** | Specifications, Tasks, AI Workflow, Command Palette, Search |
| **S4** | Knowledge Graph, Architecture, AI Agents |
| **S5** | Dashboard full, Git, Unity, Memory, Automation |
| **S6** | Polish, keyboard, plugins, settings |

## License

UNLICENSED — private project.
