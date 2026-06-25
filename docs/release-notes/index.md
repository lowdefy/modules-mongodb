---
title: Release Notes
module: release-notes
type: index
---

# Release Notes

Single-page Markdown renderer for `CHANGELOG.md`. Drops a release-notes link into your menu and renders whatever Markdown you pass in via the `content` var.

## Dependencies

| Module | Why |
|---|---|
| [layout](../layout/index.md) | Page wrapper |

## When to use

Add `release-notes` when an app needs a changelog or release-notes page. This is the smallest module in the repo — a page, a menu, and one var.

## Quickstart

```yaml
# lowdefy.yaml
modules:
  - id: release-notes
    source: "github:lowdefy/modules-mongodb/modules/release-notes@v0.8.1"
    vars:
      content:
        _ref: ../../CHANGELOG.md
```

Loading the changelog with `_ref` reads the file at build time and inlines it as a string. Use any path that resolves from your app — the demo points at the repo's `CHANGELOG.md`.

## Reference

- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions
