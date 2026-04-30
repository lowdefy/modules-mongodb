# Release Notes

Single-page Markdown renderer for `CHANGELOG.md`. Drops a release-notes link into your menu and renders whatever Markdown you pass in via the `content` var.

This is the smallest module in the repo — a page, a menu, and one var.

## Dependencies

| Module | Why |
|---|---|
| [layout](../layout/README.md) | Page wrapper |

## How to Use

```yaml
modules:
  - id: release-notes
    source: "github:lowdefy/modules-mongodb/modules/release-notes@v0.1.1"
    vars:
      content:
        _ref: ../../CHANGELOG.md
```

Loading the changelog with `_ref` reads the file at build time and inlines it as a string. Use any path that resolves from your app — the demo points at the repo's `CHANGELOG.md`.

## Exports

### Pages

| ID | Description | Path |
|---|---|---|
| `release-notes` | Renders `vars.content` as Markdown | `/{entryId}/release-notes` |

### Menus

| ID | Contents |
|---|---|
| `default` | Single link to the release-notes page |

## Vars

### `content`

`string` — Markdown content to render. Typically loaded from `CHANGELOG.md` via `_ref`.

## Secrets

None.

## Plugins

None.
