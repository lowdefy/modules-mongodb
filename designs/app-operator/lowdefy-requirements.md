# Lowdefy `_app` — requirements from the modules-mongodb migration

This document describes two capabilities the modules-mongodb repo needs from Lowdefy's `_app` operator before the `_app` migration in this repo can ship. It states the use cases and required behaviour only — implementation in Lowdefy is for the Lowdefy team to design.

## Context

modules-mongodb is migrating six modules (`contacts`, `companies`, `notifications`, `user-account`, `user-admin`, `workflows`) from a per-module `app_name` manifest var to the built-in `_app: slug` operator. Today consumers pass the same slug value to six module entries; the migration replaces that with one declaration on `lowdefy.yaml` and reads via `_app: slug` everywhere the modules need it. The migration removes a class of drift (six independent strings that can go out of sync) and consolidates display metadata (`name`, `description`) onto the same operator.

## Requirement 1 — `_app` must be evaluable at build time

### Current state

`_app` is documented and implemented as runtime-only. The operator evaluates on the client and server at request time, against app metadata captured in the build output.

### What we need

`_app` must resolve during the build, against the root `slug` / `name` / `description` / `version` / `license` / `lowdefyVersion` declared in `lowdefy.yaml`, in addition to its current runtime behaviour. The build-time and runtime values must be identical.

`gitSha` does not need to be available at build time for our use cases; build-time `null` is acceptable.

### Use cases in modules-mongodb that need this

Three classes of consumer in this repo require the slug as a string at build time:

1. **Build-time map key construction.** `modules/{companies,contacts,user-account}/api/{create,update}-*.yaml` build per-app event-display maps with `_build.object.fromEntries`, using the slug as the entry key:

    ```yaml
    display:
      _build.object.fromEntries:
        - - { _app: slug }              # ← entry key, must be a string at build time
          - _ref: defaults/event_display.yaml
    ```

    `_build.object.fromEntries` requires string keys. Passing an unevaluated operator object produces an unusable key.

2. **Build-time string composition in page chrome.** `modules/user-admin/pages/{all,new,view,edit,check}.yaml` and `components/excel_download.yaml` compose page titles, breadcrumbs and filenames at build time:

    ```yaml
    label:
      _build.string.trim:
        _build.string.concat:
          - { _app: name }              # ← must be a string at build time
          - " User Admin"
    ```

    These cannot move to runtime: page IDs, breadcrumb labels and similar chrome are resolved when the page tree is built.

3. **Resolver vars.** `modules/workflows/module.lowdefy.yaml` passes the slug to a `_ref` resolver (`makeActionPages.js`) that enumerates `action.access?.[slug]` and emits per-action pages:

    ```yaml
    pages:
      - _ref:
          resolver: resolvers/makeActionPages.js
          vars:
            slug: { _app: slug }        # ← must be a string at build time
    ```

    Page generation is fundamentally build-time. If the resolver receives an unevaluated operator object, every per-action page is silently dropped.

### Naming

We do not require a specific operator name. If the Lowdefy team prefers a separate `_build.app` to mark the build-time call site explicitly, that works for us — we will adjust our YAML accordingly. The semantics matter more than the name.

### Out of scope for our migration

- Build-time access to `gitSha` (current behaviour is fine — `LOWDEFY_GIT_SHA` or runtime resolution).
- Build-time access to fields not currently on the metadata object.

## Requirement 2 — Build must fail when `slug:` is missing and required

### Current state

`buildApp.js` resolves a missing root `slug:` to `null`. The kebab-case format check only runs when `slug` is set. An app that mounts modules-mongodb modules and forgets to declare `slug:` builds successfully; every `_app: slug` reference resolves to `null`; every MongoDB filter scoped by slug silently becomes `created.app_name: null`, returning either no documents or only legacy null-stamped documents.

This is undetectable from logs and represents a regression versus the per-module `app_name: required: true` we are removing — today, a missing slug fails the build on the first module entry that forgets to wire it.

### What we need

A way for the build to fail fast when `_app: slug` would resolve to `null` (or other nullish values) and the app's configuration depends on a real value being present. Two reasonable shapes:

- **A.** Lowdefy makes root `slug:` required globally — the build fails if `slug:` is absent from `lowdefy.yaml`. Simple, explicit, breaks for apps that don't currently use slug.
- **B.** Lowdefy makes `slug:` required when the build tree references `_app: slug` (or any specific `_app` key) — the build fails if any reference would resolve to a value the consumer treats as required. More surgical; only affects apps that actually use the operator.

Either is acceptable for our use case. We would prefer (B) since it does not impose a slug requirement on Lowdefy apps that don't need one.

Equivalent shapes the team might prefer:

- A schema-level enforcement that runs after the build resolves operator values and validates that no `_app: slug` reference resolved to `null`.
- An opt-in `required: true`-style declaration on `_app` consumers, similar to how module manifest vars declare requiredness today.

What we need to **avoid** is the current behaviour where a missing slug silently scopes production reads/writes to `null`.

### Use cases in modules-mongodb that need this

All MongoDB-touching modules (`contacts`, `companies`, `notifications`, `user-account`, `user-admin`, `workflows`) read or write documents scoped by `created.app_name` matching the slug. A null slug:

- On reads — silently returns either empty results or only legacy documents written before the slug was wired. Indistinguishable from normal "no results" responses.
- On writes — silently stamps `created.app_name: null` on every new document, polluting the dataset such that no app's filter will ever match those documents again.

The failure modes are silent and produce data corruption that's hard to detect at the time of writing and expensive to clean up later. The current `app_name: required: true` per-module check catches this at build time; we cannot regress that guarantee as part of the migration.

## Open

- Final operator naming (`_app` at both phases, or `_app` + `_build.app`) — Lowdefy team to decide.
- Whether requirement 2 ships as part of `_app`'s build-time work or as a separate change.
