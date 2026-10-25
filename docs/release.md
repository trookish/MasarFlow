# Releasing MasarFlow

MasarFlow ships as an unsigned Windows installer from GitHub Releases. Tags use the 4-part display version
(`v0.3.0.0`); `package.json` carries the semver form (`0.3.0`). `scripts/release-verify.mjs` checks the two agree.

## Release checklist

Every item needs evidence (a command's exit code or a committed report). A release is not cut while any item is open.

1. **Static gate** — `pnpm lint && pnpm typecheck && pnpm desktop:typecheck && pnpm test` exits 0 on the release commit.
2. **Security gate** — `pnpm build:app && pnpm security:check` exits 0 (guard denial matrix, development-mode guard,
   fail-closed roots, server-side fetch policy).
3. **Packaged gate** — `pnpm desktop:dist:dir && pnpm smoke:desktop && pnpm e2e:desktop` exits 0. Every feature in
   `tests/e2e/feature-matrix.json` has a passing packaged spec.
4. **Data doctor** — `pnpm doctor:data` reports zero for every check (`reports/v0.3/data-doctor.json`).
5. **Layout** — `reports/v0.3/layout.json` lists no clipped interactive element at 1000/1280/1440/1920 px.
6. **Accessibility** — `reports/v0.3/a11y/summary.json` has zero axe violations; there is no allow-list.
7. **Upgrade** — a profile created by the previous release opens in the new build with its data intact.
8. **Version** — `pnpm release:verify <tag>` (or `node scripts/release-verify.mjs <tag>`) passes; `CHANGELOG.md` has a
   dated section for the version.
9. **Docs** — README, `SECURITY.md` and `docs/development.md` describe the shipped behaviour.
10. **CI** — the `verify` and `desktop-e2e` jobs are green on the release commit; the Release workflow's `gate`
    job passes before `build` packages anything.

## Cutting the release

```bash
git tag v0.3.0.0 && git push origin v0.3.0.0
```

The Release workflow runs the gate, packages, writes `release-notes.md` from the CHANGELOG section (the upgrade banner
names the previous tag from `git describe`), uploads the installer, `latest.yml` and the blockmap, and opens a **draft**
release. Review the draft, then publish it; the in-app updater only sees published releases.
