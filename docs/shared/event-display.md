---
type: shared
module: shared
title: Event display
concepts:
  - event_display
  - timeline titles
  - Nunjucks templates
---

# Event display

Modules that write to the `log-events` collection store **per-app display titles** alongside each event document. The `event_display` var on each module is a map from `app slug → { event_type → Nunjucks template }`. The events module renders the template that matches the current `display_key`.

> **Auth-upgrade exception.** The `user-account` and `user-admin` modules, rebuilt on the BetterAuth-based auth engine, are not app-scoped (one instance = one pinned org). Their `event_display` is a **flat `{ event-type: template }` map — no app-slug key**, and the override fully replaces the defaults. `user-account` templates receive `user` (the acting user); `user-admin` templates receive `user` (the acting admin) and `target` (the edited/invited user). Everything below describes the app-keyed shape the other modules still use.

## Wording convention

Timeline titles read **`{actor} {past-tense verb} {type} {object}`** — sentence case, **no trailing period**. They are headlines in a feed, not sentences:

```
Alex Smith created company Acme Corp
Alex Smith updated contact Jane Doe
Alex Smith created lead Test 4
Alex Smith converted lead Test 4 to a customer
```

- **Always lead with the actor** (`{{ user.profile.name }}`). Never write object-first ("Test 4 created") or passive ("Lead converted to customer.").
- **Name the entity type after the verb** (`created company …`, `updated user …`). The timeline interleaves entity kinds, so the bare object name doesn't say _what_ was touched. Skip the type word only when the verb already implies it (e.g. `invited Jane Doe` — you only invite people) or when the template already carries a type label (`activities` titles render `logged a {{ target.type_label }}: …`).
- **No trailing period** — these are fragments, not full sentences. (Contrast with workflow `status_map` messages, which _are_ full sentences and _do_ end with a period: "Qualify the lead.", "Lead qualified.")
- **Use the standard variable shape** even for app-level events rendered inline: pass `user: { _user: true }` and `target: { name: … }`, then template with `{{ user.profile.name }}` / `{{ target.name }}` — identical to module-rendered titles, so the wording reads the same everywhere.

## Why per-app

Multi-tenant deployments share a single `log-events` collection but render events in different chrome per app. The same event document might appear as "Alex created Company X" in the CRM app and "C-0001 created by Alex" in the back-office app. Storing pre-rendered titles per app at write time keeps the timeline render path query-only (no template engine on read).

## Default file shape

Each module ships a default at `modules/{name}/defaults/event_display.yaml`:

```yaml
create-company: "{{ user.profile.name }} created {{ target.name }}"
update-company: "{{ user.profile.name }} updated {{ target.name }}"
```

- Keys are event types (matching the `type` field on event documents).
- Values are Nunjucks templates rendered against the event payload.

When the consumer doesn't override `event_display`, the build wraps these templates under the app's slug (read via `_build.app: slug` — a build-time key, see [App slug scoping](app-name.md)). The `new-event` endpoint flattens the rendered display block onto the event document's top level (keyed by slug), so an event written in an app with `slug: my-app` ends up with a top-level `my-app.title` field set to the rendered template — and the events module's `display_key`, which defaults to that same slug, reads it back (`$my-app.title`, not `$display.my-app.title`).

## Variables available to templates

- `user` — the full user object loaded via `_user: true` at the moment the event is written.
- `target` — the entity being changed. The shape is **module-specific** — each module's write API decides which fields to pass into the template. For example, `companies` passes `{ name }` where `name` is the field configured by the `name_field` var. Per-module READMEs document the exact `target` shape for each event type.

## Overriding

`event_display` is a **per-module var**, consumed only by that module's own write APIs. The keys you can put under each app name are restricted to the event types that module emits — other keys are silently ignored. Set `event_display` on the consuming module entry:

```yaml
- id: companies
  source: "github:lowdefy/modules-mongodb/modules/companies@v0.8.1"
  vars:
    event_display:
      my-app:
        create-company: "Created {{ target.name }}"
        update-company: "Updated {{ target.name }}"
```

**Override fully replaces the defaults — no merge.** Whatever you write under `event_display` is exactly what's stored on the event document. List every app and event type you want rendered. If you want only the override-the-wording case (single app), the file shape is just `{ [slug]: { event-type: template } }` — spelled out with the app's own slug, since the override is authored config, not an operator position. To render titles for multiple apps, list them all explicitly.

## Display metadata vs templates

`event_display` covers titles only. Color, icon, and human-readable type names live in the separate `event_types` component on the events module — see [Events module README](../../modules/events/README.md).
