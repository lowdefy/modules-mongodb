# Field Schemas for Shared Module Config

## Problem

`user-admin`, `user-account`, and `contacts` each let consumers configure extended fields for three user-side data objects:

- **`profile`** — user-editable, cross-app. Surfaced by all three modules.
- **`global_attributes`** — admin-editable, cross-app. Surfaced by `user-admin`.
- **`app_attributes`** — admin-editable, scoped to one app. Surfaced by `user-admin`.

For each, the consumer today writes three overrides — the form input blocks, the `DataDescriptions` view `formConfig`, and the API set-fields payload map — all describing the same fields from three angles. Each module bakes its own state root into those overrides (`user.profile.*` vs `contact.profile.*`), so a consumer who uses `profile` in multiple modules duplicates the list with diverging IDs. Any divergence is a silent bug.

The goal: a single declarative schema per data object, authored once, with state roots hidden inside each module.

## Non-Goals

- Unifying the modules' internal state roots. `contacts` keeps `contact.*` for the contact-modal overlay case; `user-admin`/`user-account` keep `user.*`. The design hides the divergence, doesn't remove it.
- Non-shared overrides (table columns, filters, sidebar tiles) stay raw YAML.
- Backwards compatibility. Nothing is released; consumers migrate their overrides.

## Consumer Interface

### Schema shape

A schema is a YAML list of field entries. Each entry describes one field across three concerns:

- **Input** — which form block renders the field.
- **View** — how `DataDescriptions` renders the read-only value.
- **Save** — how the submitted payload is transformed before the write.

```yaml
# apps/demo/modules/shared/profile/fields.yaml
- key: phone_number
  title: Phone Number
  block:
    type: PhoneNumberInput
    properties:
      defaultRegion: US

- key: department
  title: Department
  block:
    type: TextInput
  set:
    transform: trim
    default: ""

- key: start_date
  title: Start Date
  block:
    type: DateSelector
  view:
    component: date_display
```

| field            | required | purpose                                                                                            |
| ---------------- | :------: | -------------------------------------------------------------------------------------------------- |
| `key`            |    ✓     | Field name within the data object. Module prepends its own state root.                             |
| `title`          |    ✓     | Used as both the form block label and the `DataDescriptions` entry title.                          |
| `block`          |    ✓     | Form block spec, minus `id`. Spliced through; `properties.title` auto-fills from `title`.          |
| `view.component` |          | Renderer hint for the `DataDescriptions` `formConfig` entry. Omit for plain text.                  |
| `set.transform`  |          | `trim` \| `raw` (default). Wraps the `_payload` value before the DB write.                         |
| `set.default`    |          | Default applied when the payload is nullish. Honored only when a transform is set.                 |
| `set.raw`        |          | Operator tree that replaces the generated set entry wholesale. Escape hatch for custom save logic. |

### Wiring a schema into a module

Each module exposes one var per data object. The consumer `_ref`s a schema file into `<group>.fields`:

```yaml
# apps/demo/modules/user-admin/vars.yaml
profile:
  show_title: true
  fields:
    _ref: modules/shared/profile/fields.yaml
global_attributes:
  fields:
    _ref: modules/user-admin/global_attributes_fields.yaml
app_attributes:
  fields:
    _ref: modules/user-admin/app_attributes_fields.yaml
```

The same `modules/shared/profile/fields.yaml` file is wired into all three modules that surface profile. One authoring, no duplicated IDs, no `_payload: user.profile.x` vs `_payload: contact.profile.x` split.

### Escape hatches

When a field doesn't fit the schema shape:

- **`set.raw`** on an entry — author the save operator tree by hand for that one field.
- **`<group>.extra_fields`** — a raw YAML block list appended after the schema-generated form fields. Use for conditional sections or composite blocks that aren't a single labeled input. Does not project into view or set — use when the field is presentation-only or handles its own save.

## Module Internals

Three small JS resolvers under `modules/shared/field-group/resolvers/` project each schema into the shape one call site expects. Module authors (not consumers) call them at three points.

| resolver           | consumed by                     | output shape                           |
| ------------------ | ------------------------------- | -------------------------------------- |
| `make_form_fields` | form component `blocks`         | `[{ id, type, properties, ... }]`      |
| `make_view_config` | `DataDescriptions` `formConfig` | `[{ key, title, component? }]`         |
| `make_set_fields`  | API set-fields payload          | `{ <subtree>.<key>: <operator-tree> }` |

Each call site passes the module's `root` (state path prefix, e.g. `user.profile`) and `subtree` (set-field path prefix, e.g. `profile`) explicitly.

```yaml
# modules/user-admin/components/form_profile.yaml
blocks:
  _build.array.concat:
    -  # core fields — unchanged
    - _ref:
        resolver: ../shared/field-group/resolvers/make_form_fields.js
        vars:
          fields:
            _module.var: profile.fields
          root: user.profile
```

| Module         | `profile` `root`  | `profile` `subtree` |
| -------------- | ----------------- | ------------------- |
| `user-admin`   | `user.profile`    | `profile`           |
| `user-account` | `user.profile`    | `profile`           |
| `contacts`     | `contact.profile` | `profile`           |

`global_attributes` and `app_attributes` reuse the same resolvers with their own `root`/`subtree` (e.g. `root: user.global_attributes`, `subtree: global_attributes`).

Resolver implementations:

```js
// make_form_fields.js
export default function makeFormFields(_, { fields, root }) {
  return fields.map(({ key, title, block }) => ({
    id: `${root}.${key}`,
    ...block,
    properties: { title, ...(block.properties || {}) },
  }));
}
```

```js
// make_view_config.js
export default function makeViewConfig(_, { fields }) {
  return fields.map(({ key, title, view = {} }) => ({
    key,
    title,
    ...(view.component ? { component: view.component } : {}),
  }));
}
```

```js
// make_set_fields.js
function wrap(payload, transform, def) {
  if (transform == null || transform === "raw") return payload;
  const value = def !== undefined ? { _if_none: [payload, def] } : payload;
  if (transform === "trim") return { "_string.trim": value };
  return value;
}

export default function makeSetFields(_, { fields, root, subtree }) {
  return Object.fromEntries(
    fields.map(({ key, set = {} }) => {
      const path = `${subtree}.${key}`;
      if (set.raw !== undefined) return [path, set.raw];
      return [
        path,
        wrap({ _payload: `${root}.${key}` }, set.transform, set.default),
      ];
    }),
  );
}
```

## Key Decisions

**Pass-through `block`, not per-type templates.** Each entry's `block` is a full form-block spec minus `id`. Consumers can use any block type — `TextInput`, `PhoneNumberInput`, custom plugins — without the module maintaining a per-type template set. An earlier prototype used a constrained DSL with per-type `.yaml.njk`; rejected as too limiting.

**`title` lifted above `block`.** Form label and `DataDescriptions` title always match, so a top-level `title` avoids duplication. `block.properties.title` still wins as an override when the form-side needs to differ.

**JS resolvers over inline `_build.*`.** Set-field generation needs operator-tree construction driven by `transform` + `default` — awkward in YAML, clean in JS. Three single-purpose resolvers keep each short and their output shape obvious.

**`root`/`subtree` passed explicitly at call sites.** Resolvers stay pure; module call sites self-document where state lives. The alternative (module-level constants via metadata) added indirection for strings that appear at only a few sites.

**One set of resolvers across all three data objects.** `profile`, `global_attributes`, `app_attributes` differ in ownership and scope but are structurally identical. Parameterizing by `root`/`subtree` is enough.

**Only two escape hatches: `set.raw` and `extra_fields`.** Together they cover fields whose save logic outgrows `transform` and form blocks that aren't a single labeled input. The schema shape stays focused on the 95% case.
