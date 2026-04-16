# Release Workflow Design

## Problem

The modules-mongodb repo has no release automation. It contains two types of artifacts that need releasing:

1. **Lowdefy modules** (YAML config) — consumers reference these via git tags: `github:lowdefy/modules-mongodb/modules/user-admin@v1.0.0`
2. **Plugin package** (`@lowdefy/modules-mongodb-plugins`) — a custom Lowdefy plugin that needs npm publishing

Currently there are no changesets, no GitHub workflows, no CI, and no release automation. The only tag is `v1.0.0-test` from manual testing.

## Solution

Use Changesets for version management with a GitHub Actions release workflow that publishes the plugin to npm and creates git tags for module consumers.

## Key Decisions

### 1. Fixed (unified) versioning

All packages version together — the root `@lowdefy/modules-mongodb` and `@lowdefy/modules-mongodb-plugins` are in a Changesets `fixed` group.

**Why:** Git tags are repo-wide. A consumer writing `github:lowdefy/modules-mongodb/modules/user-admin@v1.0.0` gets the entire repo at that tag. Modules and plugin are tightly coupled (modules depend on the plugin's blocks and actions). Independent versioning would create confusion — "which plugin version works with which module version?" With fixed versioning, one version number means one coherent release.

**How changesets work with this:** When creating a changeset, developers pick the relevant package:

- Module changes (YAML) → changeset for `@lowdefy/modules-mongodb` (root)
- Plugin changes (JS/React) → changeset for `@lowdefy/modules-mongodb-plugins`
- Both → select both

Either selection bumps both packages to the same version due to `fixed` grouping.

### 2. Dual artifact release: npm publish + GitHub Release

The release workflow produces two artifacts from a single version bump:

1. **npm publish** — `@lowdefy/modules-mongodb-plugins` published to npm registry
2. **GitHub Release** — created with `v{version}` tag (e.g., `v1.2.0`) and changeset-derived release notes

The npm publish is handled by `changeset publish`. The GitHub Release is created by `softprops/action-gh-release@v2` after publish. Changesets' built-in release creation is disabled (`createGithubReleases: false`) — the `softprops` action gives more control (tag format, release notes, draft state). The `v{version}` tag format is what module consumers need in their `source` strings.

Release notes are compiled from per-package CHANGELOGs by `scripts/release-notes.mjs`. The script collects entries from both packages, deduplicates by changeset hash (since fixed versioning means the same changeset appears in multiple changelogs), and groups into "What's New" (minor/major) and "Fixes & Improvements" (patch). Adapted from the [lowdefy/lowdefy release-notes script](https://github.com/lowdefy/lowdefy/blob/main/scripts/release-notes.mjs), minus the Claude AI highlights.

### 3. OIDC trusted publishing for npm

Following the community-plugins pattern, use npm OIDC trusted publishing instead of storing npm tokens in GitHub secrets. This requires:

- `id-token: write` permission in the workflow
- A GitHub `publish` environment configured in the repo
- `NPM_CONFIG_PROVENANCE: 'true'` environment variable
- The npm package configured for OIDC on npmjs.com

### 4. Starting version

Set all packages to `0.0.0`. The first changeset will be a major bump, publishing `1.0.0`. This ensures the first real release has a clean `v1.0.0` tag for module consumers.

### 5. No CI workflow (yet)

This design covers release automation only. CI (lint, build, test on PRs) is a separate concern. The release workflow includes a build step to ensure the plugin compiles before publishing, but there's no PR gate workflow. That can be added later.

## Changeset Configuration

**`.changeset/config.json`:**

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.3/schema.json",
  "changelog": [
    "@changesets/changelog-github",
    { "repo": "lowdefy/modules-mongodb" }
  ],
  "commit": false,
  "fixed": [["@lowdefy/modules-mongodb", "@lowdefy/modules-mongodb-plugins"]],
  "linked": [],
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["@lowdefy/modules-demo"]
}
```

Key choices:

- **`changelog-github`** — generates changelogs with links to PRs and contributors (same as forge)
- **`fixed`** — root + plugin always share the same version
- **`ignore`** — demo app is excluded from versioning (it's a dev-only app, never published)
- **`access: restricted`** — default; the plugin overrides with `publishConfig.access: public`
- **`commit: false`** — changesets creates PRs, not direct commits

## Package Changes

### Root `package.json`

Add scripts and dev dependencies:

```json
{
  "version": "0.0.0",
  "scripts": {
    "build": "pnpm -r --filter '!@lowdefy/modules-demo' run build",
    "changeset": "changeset",
    "release:version": "pnpm changeset version && pnpm install --no-frozen-lockfile",
    "release:publish": "pnpm changeset publish"
  },
  "devDependencies": {
    "@changesets/changelog-github": "0.6.0",
    "@changesets/cli": "2.29.4"
  }
}
```

### Plugin `package.json`

Make publishable:

```json
{
  "version": "0.0.0",
  "private": false,
  "publishConfig": {
    "access": "public"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/lowdefy/modules-mongodb.git",
    "directory": "plugins/modules-mongodb-plugins"
  }
}
```

Changes:

- Remove `"private": true"` (allow npm publish)
- Add `publishConfig.access: public` (scoped packages default to restricted)
- Add `repository` field (required for npm provenance with OIDC)
- Set version to `0.0.0` (reset for initial release)

## Release Workflow

**`.github/workflows/release.yaml`:**

```yaml
name: Release

on:
  push:
    branches: [main]

concurrency: ${{ github.workflow }}-${{ github.ref }}

permissions:
  contents: write
  pull-requests: write
  id-token: write

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    environment: publish
    if: github.repository == 'lowdefy/modules-mongodb'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          registry-url: "https://registry.npmjs.org"

      - run: pnpm install --frozen-lockfile
      - run: pnpm build

      - name: Upgrade npm for OIDC trusted publishing
        run: npm install -g npm@latest

      - name: Create Release Pull Request or Publish
        id: changesets
        uses: changesets/action@v1
        with:
          version: pnpm run release:version
          publish: pnpm run release:publish
          createGithubReleases: false
          commit: "chore: Publish new release"
          title: "Publish new release"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_CONFIG_PROVENANCE: "true"

      - name: Generate release notes
        if: steps.changesets.outputs.published == 'true'
        id: release-notes
        run: |
          node scripts/release-notes.mjs --output-file=/tmp/release-notes.md
          VERSION=$(node -p "require('./package.json').version")
          echo "version=v${VERSION}" >> "$GITHUB_OUTPUT"

      - name: Create GitHub Release
        if: steps.changesets.outputs.published == 'true'
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ steps.release-notes.outputs.version }}
          name: ${{ steps.release-notes.outputs.version }}
          body_path: /tmp/release-notes.md
          target_commitish: ${{ github.sha }}
```

### Flow

```
Push to main
  │
  ├─ Pending changesets exist?
  │   YES → Create/update "Publish new release" PR
  │          (bumps versions, updates CHANGELOGs)
  │
  └─ No pending changesets? (release PR was just merged)
      YES → 1. changeset publish → npm publish plugin
            2. Compile release notes from CHANGELOGs
            3. Create GitHub Release with v{version} tag
```

### Why `version` and `publish` are separate scripts

The `changesets/action` calls `version` when creating the Version PR and `publish` when the PR has been merged. Splitting them lets us:

- **`release:version`**: run `changeset version` + update lockfile (`pnpm install --no-frozen-lockfile`) since version bumps change `package.json` files
- **`release:publish`**: run `changeset publish` to push to npm

### Build step placement

The `pnpm build` runs before the changesets action. The plugin's `prepare` script also runs during `pnpm install`, so dist/ is always fresh. The explicit build step is belt-and-suspenders — it ensures the plugin compiles even if prepare was somehow skipped.

## Release Notes Script

**`scripts/release-notes.mjs`**

Adapted from `lowdefy/lowdefy`'s release notes script. Collects per-package CHANGELOGs, deduplicates changeset entries by hash, and outputs structured release notes.

**What it does:**

1. Discovers CHANGELOG.md files from pnpm workspace packages
2. Parses each changelog for the latest version's entries
3. Filters out dependency-only bumps (e.g., "Updated dependencies")
4. Deduplicates entries by changeset hash — fixed versioning means the same changeset appears in both root and plugin CHANGELOGs
5. Groups into "What's New" (minor/major changes) and "Fixes & Improvements" (patch changes)
6. Writes markdown to the specified output file

**What it doesn't do** (vs the lowdefy/lowdefy version):

- No Claude AI highlights — the raw changeset content is clear enough for a repo with 2 packages
- Uses `@lowdefy/modules-mongodb` as the primary package (instead of `lowdefy`)

**Usage:**

```bash
node scripts/release-notes.mjs                        # latest version → /tmp/release-notes.md
node scripts/release-notes.mjs --output-file=notes.md # custom output path
node scripts/release-notes.mjs --all                   # all versions (backfill)
```

## Developer Workflow

### Adding a changeset

After making changes, before or during PR:

```bash
pnpm changeset
```

Interactive prompts:

1. Select packages: `@lowdefy/modules-mongodb` for module changes, `@lowdefy/modules-mongodb-plugins` for plugin changes
2. Select bump type: patch / minor / major
3. Write summary of changes

This creates a markdown file in `.changeset/` that gets committed with the PR.

### What gets versioned when

| Change                  | Package to select                  | Example                       |
| ----------------------- | ---------------------------------- | ----------------------------- |
| New/updated module page | `@lowdefy/modules-mongodb`         | Added user invite page        |
| Module manifest change  | `@lowdefy/modules-mongodb`         | New exported component        |
| Plugin block/action     | `@lowdefy/modules-mongodb-plugins` | New SmartDescriptions block   |
| Both                    | Both                               | Module + plugin it depends on |

Since packages are `fixed`, selecting either bumps both. The selection determines which CHANGELOG gets the entry.

### Release flow

1. PRs merge to `main` with changeset files
2. Release workflow creates/updates "Version Packages" PR automatically
3. Maintainer reviews and merges the Version PR
4. Release workflow publishes plugin to npm + creates GitHub Release with `v{version}` tag
5. Consumers update their `source` refs: `github:lowdefy/modules-mongodb/modules/user-admin@v1.2.0`

## Files Changed

### New files

| File                             | Purpose                                           |
| -------------------------------- | ------------------------------------------------- |
| `.changeset/config.json`         | Changesets configuration                          |
| `.github/workflows/release.yaml` | Release automation workflow                       |
| `scripts/release-notes.mjs`      | Compile per-package CHANGELOGs into release notes |

### Modified files

| File                                           | Change                                             |
| ---------------------------------------------- | -------------------------------------------------- |
| `package.json`                                 | Add scripts, devDependencies, set version to 0.0.0 |
| `plugins/modules-mongodb-plugins/package.json` | Remove private, add publishConfig + repository     |

## GitHub Setup Required

Before the first release:

1. **Create `publish` environment** in repo settings (Settings → Environments → New)
2. **Configure npm OIDC** — link the `@lowdefy/modules-mongodb-plugins` package on npmjs.com to the GitHub repo for trusted publishing
3. **Ensure `GITHUB_TOKEN` permissions** — the default token needs write access to contents and PRs (usually default for repos in the org)

## Open Questions

### 1. CI workflow

This design intentionally skips CI. A future `ci.yaml` workflow running on PRs could:

- Build the plugin (`pnpm build`)
- Run linting/formatting checks
- Run the demo app Lowdefy build (`pnpm ldf:b` in apps/demo)
- Run Playwright e2e tests

### 3. Pre-release / experimental workflow

Community-plugins has `release:version-experimental` and `release:publish-experimental` scripts for snapshot releases tagged `experimental`. We could add this later if needed for testing module changes before a full release.
