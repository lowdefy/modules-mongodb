---
"@lowdefy/modules-mongodb-deals": minor
---

`deals` takes a `hooks` var with `pre_insert` and `post_insert` — routine steps spliced into the `create-deal` API around the deal insert. With the var unset (`[]`), the routine is unchanged.

Deal creation was closed to host extension. `create-deal` persists host `fields` generically through `attributes`, so a host that only needs to *store* something needs nothing more — but a host that needs create to also *do* something had no way in. The motivating case: a create form that captures Company Size when the linked company has none on record, and writes it back to the company. The only workarounds were forking the API or bolting a second call onto the client, both of which re-fork the create path the module exists to own.

The two slots differ in what is in scope and in how they fail:

- `pre_insert` sees the whole create payload (`_payload: form.*`, `_payload: attributes.*`) but not the deal id. A step that fails aborts the create — nothing has been written yet.
- `post_insert` adds `_step: insert_deal.insertedId`, and runs **before** the workflow starts rather than after. That ordering is deliberate: a failing hook then leaves a deal with no workflow, which a host can detect and repair, instead of a workflow pointing at a deal that was never created, which it cannot.

Hooks are host-supplied routine steps, so they run server-side inside the same request as the insert — not a client action list like the activities module's `hooks.on_created`. The naming follows that module's `hooks:` convention.
