# Form custom-component seam

The workflows form-builder (`makeActionsForm`) currently advertises three ways to put a field in an action `form:` block: a bare library-component name, a raw inline Lowdefy block, and a namespaced `component: <plugin>:<name>` "custom component". The namespaced path is documented as the official way to add an app-specific field, but it is dead code — it emits an invalid block, has never rendered, and structurally cannot. This design removes that path and re-documents raw inline blocks as the real escape hatch, leaving two honest ways to define a field: the curated library, and a raw block for everything else.

## Proposed change

1. Remove the namespaced `component:` branch from `modules/workflows/resolvers/makeActionsForm.js` (the `isNamespaced` helper and its passthrough case), and delete the no-op test that only asserted passthrough.
2. Keep two field-definition paths: **bare name → library component** (the curated `components/fields/*` set) and **raw inline Lowdefy block** (`{ id, type, properties }`) for anything custom — already first-class in the resolver's id-collision pass.
3. Re-document the custom-field story in `docs/workflows/reference/form-components.md`: replace the "Custom components" section (and the line-12 note) with guidance that steers authors to the library first and presents the raw inline block as the last-resort escape hatch.
4. Correct the source-of-truth concept design (`designs/workflows-module-concept/action-authoring/design.md` Decision 7 and `spec.md`) so the override mechanism reads as "raw inline block", not the namespaced passthrough.

## Why the namespaced path is broken

A field entry only becomes a renderable Lowdefy block because _something_ maps the authoring vocabulary (`component:`, `key:`, `title:`) onto real block keys (`type:`, `id:`, `properties:`). For a **bare** name, that mapping is hand-coded in the library YAML — e.g. `components/fields/text_input.yaml`:

```yaml
config:
  id: { _var: key } # key  → id
  type: TextInput # supplies the block type
  properties:
    title: { _var: title } # title → properties.title
```

The **namespaced** branch returns the entry _verbatim_ — `{ component: "my-plugin:device_selector", key: "device", title: "Device" }` — with no mapping step. That node has no `type:` and no `id:`, and `component:`/`key:` are not Lowdefy block keys, so Lowdefy cannot render it. Three independent signals confirm the path is dead:

- **No downstream translation.** Nothing between the resolver output and the page block tree maps `component:` → `type:` or `key:` → `id:`. Confirmed by grep across `templates/*.njk` and the resolvers.
- **The id-collision pass ignores it.** `collectIdsFromNode` in `makeActionsForm.js` handles exactly two node shapes — `_ref` wrappers (library components) and _"Raw inline block (no `_ref` wrapper) … read its id directly"_. A namespaced entry has neither an `id` nor a `_ref`, so its key is never registered. The surrounding code was never written with this branch in mind.
- **The test asserts nothing real.** `makeActionsForm.test.js:71-75` only checks `expect(out).toEqual([entry])` — that the function returns its input unchanged. There is no test, and structurally cannot be one without a render, that the result is a working field.

### Root cause

The branch was specced on a factual error. Part 15's design (`designs/workflows-module/parts/_completed/15-resolver-form-builder/design.md:64`) states:

> A `component:` value containing `:` … is Lowdefy plugin-component syntax; the resolver leaves the entry unchanged … Lowdefy resolves the plugin at runtime.

That premise is wrong. Lowdefy plugin-block syntax lives in a block's **`type:`** field (`type: my-plugin:device_selector`), not in a `component:` key. Leaving the entry unchanged therefore never yields a plugin block. The misunderstanding is _where_ plugin types resolve.

### Why it can't be "fixed" instead of removed

One could imagine making the branch emit `{ id: key, type: component, properties: { … } }`. It still wouldn't work as a _generic_ shim, because every plugin block has its own property schema — the resolver has no way to know that `title` belongs at `properties.title` for an arbitrary third-party block, or that the block even has a title. A generic `{ component, key, title }` shim over arbitrary plugin blocks is not merely unimplemented; it is unimplementable without per-plugin knowledge. The raw inline block already covers this case correctly, because the author writes the block's real config directly.

## Current state — the three branches

`makeActionsForm.js` walks each `form:` entry through `substituteEntry`:

```js
if (!component) return stripped; // (1) raw inline block — emitted verbatim
if (isNamespaced(component)) return stripped; // (2) namespaced — emitted verbatim (BROKEN)
return {
  _ref: { path: `components/fields/${component}.yaml`, key: "config", vars },
}; // (3) bare → library
```

- **(1) Raw inline block** — an entry with no `component:` key is a standard Lowdefy block (`id`, `type`, `properties`, …) emitted as-is. Intended and supported: `collectIdsFromNode` reads its `id` directly and recurses its `blocks`.
- **(2) Namespaced `component:`** — broken, as above.
- **(3) Bare name → library** — `_ref`'d to `components/fields/<name>.yaml`, resolved against the **module root** (the build forbids module refs from escaping the package root, so the app cannot shadow or supply these files). This is the curated field library and the core feature.

Removing (2) collapses this to a clean two-way split.

## After: two ways to define a field

| Need                                           | Path                  | Shape                                              |
| ---------------------------------------------- | --------------------- | -------------------------------------------------- |
| A common field (text, date, selector, file, …) | **Library component** | `{ component: <name>, key, title, … }`             |
| An app-specific field a plugin block renders   | **Raw inline block**  | `{ id, type: <plugin>:<name>, properties: { … } }` |

The raw block is strictly _more_ capable than the namespaced sugar pretended to be: the author supplies the block's real `type` and `properties`, so any plugin block — with any property schema — works, and binds to state through the same `id`-as-state-path convention the library components use (`id: form.device`).

Worked example — a custom device selector as a raw inline block in an action `form:`:

```yaml
form:
  - component: section
    key: device_section
    title: Device
    form:
      - id: form.device # state path, same convention as library `key`
        type: my-plugin:device_selector # plugin block type — resolved by the plugin registry
        properties:
          collection: devices
```

## Documentation changes

`docs/workflows/reference/form-components.md` (steer-to-library framing, per decision):

- **Line-12 note** — drop the "ship it as a custom block plugin and reference it as `component: <plugin>:foo` … the resolver passes through any name it does not recognise" sentence. Replace with: domain-specific fields are added either by contributing a library component or, as an escape hatch, by writing a raw Lowdefy block inline.
- **"## Custom components" section** — keep the heading but rewrite the body: (1) prefer a library component / plugin-backed field for anything reused; (2) for a one-off, drop a raw Lowdefy block directly into the `form:` array (`id` + `type` + `properties`), shown with the `my-plugin:device_selector` example above. Remove the `component: my-plugin:device_selector` snippet and the "resolver passes through any `component:` name it does not recognise" claim.

## Files changed

- `modules/workflows/resolvers/makeActionsForm.js` — remove `isNamespaced` (lines 23-25) and its branch + comment (lines 63-64).
- `modules/workflows/resolvers/makeActionsForm.test.js` — remove the namespaced passthrough test (lines 71-75).
- `docs/workflows/reference/form-components.md` — line-12 note and "Custom components" section (see above); regenerate `docs/llms.txt` via `pnpm docs:gen` if front-matter/derived content shifts.
- `designs/workflows-module-concept/action-authoring/design.md` — Decision 7: rewrite the "Override + extension" paragraph and the trailing namespaced-passthrough sentence in "v1 ships the full v0 set" to describe the raw-block seam.
- `designs/workflows-module-concept/action-authoring/spec.md` — line 663: same correction.

`designs/workflows-module/parts/_completed/15-resolver-form-builder/` and `_completed/14-form-components-library/` are read-only history (per project convention); their substance is not edited. Each carries a short deviation note at the top of its `design.md` recording that the namespaced-passthrough decision was based on a false premise and is superseded here.

## Non-goals

- **No change to the library mechanism.** Bare-name → `components/fields/*` substitution, module-root rooting, and var validation are unchanged.
- **No new override-by-shadowing.** Apps still cannot supply or shadow library files; module refs remain rooted at the module package. Customization is per-instance vars (on library components) or a raw block (for new field types).
- **No demo migration sweep.** No app currently relies on the namespaced path (it never rendered), so there is nothing to migrate. If a `component: <plugin>:<name>` entry exists anywhere, it was already non-functional; converting it to a raw block is a separate, app-side fix.
