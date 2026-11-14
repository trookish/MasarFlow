<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Feature truth (enforced in `pnpm test`)

Four guards fail the build when the code and its claims drift apart. Their allow-lists shrink with every
fix and must end **empty**. Adding an entry requires a written reason in the commit message and a task that removes it.

| Rule | Test |
|---|---|
| Every catalog plugin id is referenced by real code | `tests/unit/lib/plugins-consumers.test.ts` |
| Every API route is called; every page is a dock page | `tests/unit/repo-truth/dead-routes.test.ts` |
| Every page setting is consumed outside the settings screen | `tests/unit/repo-truth/setting-consumers.test.ts` |
| Every feature in `tests/e2e/feature-matrix.json` has a passing packaged-app spec titled `<route>: <feature>` | `tests/unit/e2e/feature-matrix.test.ts` + `pnpm e2e:desktop` |

A new feature adds its title to `tests/e2e/feature-matrix.json` **in the same commit as its spec**.
A spec that only asserts "the page rendered" is not a test. The packaged app is the target:
`pnpm desktop:dist:dir && pnpm e2e:desktop`. MasarFlow is desktop-only: there is no browser build and no browser test suite.
