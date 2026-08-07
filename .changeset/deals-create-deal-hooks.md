---
"@lowdefy/modules-mongodb-deals": minor
---

`deals` takes a `hooks` var with `pre_insert` and `post_insert` — routine steps spliced into the `create-deal` API around the deal insert. With the var unset (`[]`), the routine is unchanged.

Deal creation was closed to host extension. `create-deal` persists host `fields` generically through `attributes`, so a host that only needs to *store* something needs nothing more — but a host that needs create to also *do* something had no way in. The motivating case: a create form that captures Company Size when the linked company has none on record, and writes it back to the company. The only workarounds were forking the API or bolting a second call onto the client, both of which re-fork the create path the module exists to own.

Pick a slot by what the steps need to do, not by what they need to see:

- `pre_insert` runs before anything is written, and is the only point at which a create can still be stopped. A `:reject: <message>` there surfaces the message on the page and writes no deal. This is what the slot is mainly for.
- `post_insert` adds `_step: deals_insert_deal.insertedId`, and is the right slot for side effects — including ones that do not need the deal id. There is no transaction around the routine, so a write made from `pre_insert` stays behind if the insert then fails; from `post_insert` the deal is already committed and nothing can strand it. Nothing rolls back from here either, so keep these steps idempotent.

`post_insert` runs **before** the workflow starts rather than after. That ordering is deliberate: a failing hook then leaves a deal with no workflow, which a host can detect and repair, instead of a workflow pointing at a deal that was never created, which it cannot.

Host steps are spliced into the module's own routine and share its step namespace, so **step ids beginning `deals_` are reserved** — the module's own steps were renamed to that prefix. A host step reusing one builds without complaint and shadows the module's step at runtime.

Hooks are host-supplied routine steps, so they run server-side inside the same request as the insert — not a client action list like the activities module's `hooks.on_created`. The naming follows that module's `hooks:` convention.
