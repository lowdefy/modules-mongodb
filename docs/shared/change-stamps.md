---
type: shared
module: shared
title: Change stamps
concepts:
  - change_stamp
  - audit
  - write metadata
---

# Change stamps

Audit metadata stamped onto every database write so we know **when** something changed and **who** changed it. The same shape is used across `events`, `files`, `companies`, `contacts`, `user-account`, and `user-admin`.

## Default schema

The default lives in `modules/events/defaults/change_stamp.yaml` and resolves to the `change_stamp` var on the `events` module entry:

```yaml
timestamp:
  _date: now
user:
  name:
    _user: profile.name
  id:
    _user: id
```

The operators (`_date: now`, `_user: profile.name`, `_user: id`) are **runtime operators** — they evaluate per request, not at build time. That's why the stamp is a configuration template rather than a literal value: the build inlines the template, and the request handler fills in the user and timestamp at the moment the write executes.

## How modules consume it

Modules don't reach for the stamp directly — they reference the `change_stamp` component exported by the `events` module:

```yaml
created:
  _ref:
    module: events
    component: change_stamp
```

Inside that component the body is a single line: `_module.var: change_stamp`. So the value the consumer sets via `vars.change_stamp` on the `events` module entry is what every other module ends up writing.

## Overriding

To extend the stamp (e.g. add `app_name` to track which app produced the write), set `change_stamp` on the `events` module entry:

```yaml
- id: events
  source: "github:lowdefy/modules-mongodb/modules/events@v0.8.1"
  vars:
    display_key: my-app
    change_stamp:
      timestamp:
        _date: now
      user:
        name:
          _user: profile.name
        id:
          _user: id
      app_name: my-app
```

Every module that writes via `events.change_stamp` will pick up the override automatically.

## Why a runtime template

A literal value baked at build time would freeze the user and timestamp at deploy. A function reference would be opaque to the build. A configuration template made of runtime operators is the smallest thing that lets us:

- inspect the shape statically (build can validate),
- evaluate it per request (request handler resolves `_user` and `_date`),
- override it from the consumer app without touching module code.
