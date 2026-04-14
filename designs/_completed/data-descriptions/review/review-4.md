# Review 4 — Component Rendering Gaps

## Unused Property

### 1. `properties.title` declared in schema and YAML but never read by the component

> **Resolved.** Dropped the `title` property entirely rather than adding a conditional fallback. Section titles come from `formConfig` sections — a block-level title that only renders for single-group data would be inconsistent. Removed from properties YAML, schema.json in task 2, acceptance criteria, and "same as Descriptions" lists. Documented as an intentional divergence from standard Descriptions API.

Design.md line 138 declares `title: Section Title` in the properties YAML. The schema (task 2 line 211) defines it as a string. Design.md line 174 lists it as "the same as Descriptions." Line 196 says: "Root-level fields get wrapped in a single `<Descriptions>` group using the block's `title` property."

But the component code (design.md lines 287–380, task 2 lines 23–123) never reads `properties.title`. The `title` variable inside `renderGroup` comes from `group.title` — which is the preprocessing section title, not the block-level property:

```jsx
const title = group.title || null;
```

When data has no formConfig sections (auto-detected fields), `wrapItemsInSections` wraps orphan fields in a section with `title: null`. The resulting `<Descriptions>` renders without a title. `properties.title` has no effect.

The Lowdefy Descriptions block (source at `@lowdefy/blocks-antd/dist/blocks/Descriptions/Descriptions.js` line ~33) passes `properties.title` directly to `<Descriptions title={...}>`. DataDescriptions claims API parity but doesn't implement it.

**Fix:** When there's a single untitled group (the common case for flat data), use `properties.title` as fallback:

```jsx
// In renderGroup at depth 0:
const groupTitle =
  group.title || (groups.length === 1 ? properties.title : null);
```

Or apply it unconditionally as the first group's title when `group.title` is null. Either way, the component needs to read `properties.title` somewhere.

## React Key Collisions

### 2. Duplicate React keys when groups share titles or have null titles

> **Resolved.** Changed keys to `${depth}-${index}` pattern. Added `index` parameter to `renderGroup` and pass map index through all call sites.

The `renderGroup` function (design.md line 343, task 2 line 86) uses `group.title ?? depth` as the React key:

```jsx
<React.Fragment key={group.title ?? depth}>    // depth 0 groups
<Card type="inner" title={title} key={group.title ?? depth}>  // depth 1+ groups
```

Problems:

- Two untitled top-level groups → both get `key={0}` (since `null ?? 0` = `0`)
- Two untitled children at depth 1 → both get `key={1}`
- Array items from `controlled_list` expansion commonly produce multiple child groups — if any share a title or are untitled, keys collide

The `.map()` calls capture the index `i` but don't use it:

```jsx
group.children.map((child, i) => renderGroup(child, 1))   // i unused
groups.map((group, i) => renderGroup(group, 0, ...))       // i only used for extra guard
```

React will warn about duplicate keys and may incorrectly reuse DOM nodes when groups reorder.

**Fix:** Pass the map index into `renderGroup` and use it as the key:

```jsx
function renderGroup(group, depth, index, extra) {
  ...
  <React.Fragment key={`${depth}-${index}`}>
  ...
  <Card ... key={`${depth}-${index}`}>
  ...
  group.children.map((child, i) => renderGroup(child, depth + 1, i))
}

// Called as:
groups.map((group, i) => renderGroup(group, 0, i, ...))
```

## Rendering Gap

### 3. Parent section title dropped when section has only children (no direct fields)

> **Resolved.** Added empty `<Descriptions>` with title (and extra) when `!hasFields && title` at depth 0. Matches DataView behavior — Section.js always renders the title header when `title != null`, regardless of direct field children. Updated both design.md and task 02 component code.

The `renderGroup` function at depth 0 (design.md lines 348–356, task 2 lines 91–98) only passes the title to `renderDescriptions`, which is conditioned on `hasFields`:

```jsx
if (depth === 0) {
  return (
    <React.Fragment key={group.title ?? depth}>
      {hasFields && renderDescriptions(group, title, extra)}
      {hasChildren && group.children.map((child, i) => renderGroup(child, 1))}
    </React.Fragment>
  );
}
```

If a top-level section has only sub-sections and no direct fields (`hasFields` = false), its title is silently dropped. The design mapping table (line 190) says `section (level 0)` → `<Descriptions title={title}>`, implying the title always renders.

Example formConfig that triggers this:

```yaml
formConfig:
  component: section
  title: "Contact Details"
  form:
    - component: section
      title: "Personal"
      form:
        - key: name
    - component: section
      title: "Work"
      form:
        - key: company
```

After preprocessing: group `{ title: "Contact Details", fields: [], children: [Personal, Work] }`. The "Contact Details" title vanishes — only "Personal" and "Work" render as inner Cards.

Real-world impact is low — both profile view formConfigs use flat field lists. But if a module defines a deeply structured formConfig via `_module.var: components.profile_view_config`, this would surface.

**Fix:** When `!hasFields && hasChildren && title`, render the title as a standalone element before children. Options:

```jsx
if (depth === 0) {
  return (
    <React.Fragment key={...}>
      {hasFields && renderDescriptions(group, title, extra)}
      {!hasFields && title && <Descriptions {...descProps} title={renderHtml({ html: title, methods })} extra={extra} />}
      {hasChildren &&
        group.children.map((child, i) => renderGroup(child, 1))}
    </React.Fragment>
  );
}
```

Or render an empty `<Descriptions>` with just the title to get the standard header styling.
