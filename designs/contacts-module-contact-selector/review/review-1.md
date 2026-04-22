# Review 1 — Correctness, load-bearing details from the prior branch

The design is coherent and the scope is well-bounded. Most findings are about load-bearing details discovered on the abandoned `feat/contact-selector-block` branch (commits `4e072de`, `93a5294`) that the current design drops or leaves implicit. Ignoring them will block the picker's edit/add flows end-to-end even though the wrapper renders fine.

## Correctness — will block the feature

### 1. `update-contact.yaml` has an unconditional `updated.timestamp` filter; the picker won't save edits

> **Resolved — stronger fix than proposed.** The `updated.timestamp` filter clause is removed entirely, not made conditional. Concurrent edits lose their last-write-wins guard; trade-off accepted. See decision #8a. `update-contact.yaml` added to Files changed → Modified.

`modules/contacts/api/update-contact.yaml:13-14` unconditionally includes `updated.timestamp` in the `MongoDBUpdateOne.filter`:

```yaml
filter:
  _object.assign:
    - _id:
        _payload: _id
      updated.timestamp: # ← unconditional
        _payload: updated.timestamp
    - ...
```

The prior branch's `93a5294` commit message explicitly called this out:

> `update-contact` filter: the `updated.timestamp` clause is conditional on payload presence, so the picker can edit without supplying a timestamp (detail/edit page still sends it).

The design's decision #4 and data-flow diagram show `onEditContact` calling `contacts/update-contact` but do not state what `updated.timestamp` goes into the payload. Two failure modes in the current shape:

1. The picker's `{id}_contact` only gets populated from `get_contact` after the user clicks edit. If the user waits, then saves, the stale timestamp fails the filter (ISO-string vs BSON-Date mismatch is also possible, per the prior commit).
2. If the picker deliberately omits `updated.timestamp`, the `updated.timestamp: { _payload: updated.timestamp }` filter evaluates to `{ updated.timestamp: undefined }`, which MongoDB will not match against existing docs.

**Proposed fix.** Add explicit to decision #4 (or a new sub-decision "Optimistic-concurrency on edit"):

- `update-contact.yaml` wraps the `updated.timestamp` filter clause in `_build.if` conditional on payload presence (port from `93a5294`).
- Design states that the picker's `onEditContact` payload omits `updated.timestamp` — the detail/edit page continues to send it.
- Add a line under "Files changed → Modified" for `modules/contacts/api/update-contact.yaml`.

### 2. `create-contact.yaml` `upsertedId` response shape isn't guaranteed to reach `appendContact`

> **Resolved — port prior-branch fix.** Decision #8b added; `:return: contactId` uses `_if_none` fall-through from `insert.upsertedId` to `insert.lastErrorObject.upserted`. `create-contact.yaml` added to Files changed → Modified.

`modules/contacts/connections/contacts-collection.yaml:7-11` configures `changeLog`:

```yaml
changeLog:
  collection: log-changes
  meta:
    user:
      _user: true
```

Per the project memory `mongodb_updateone_response.md`, when `changeLog` is set, `upsertedId` is at `lastErrorObject.upserted` (community-plugin-mongodb switches between `updateOne` and `findOneAndUpdate` based on changeLog presence; the keys differ). `modules/contacts/api/create-contact.yaml:147-157`:

```yaml
:return:
  contactId:
    _if:
      test:
        _ne: [{ _step: check-existing }, null]
      then:
        _step: check-existing._id
      else:
        _step: insert.upsertedId # ← only works WITHOUT changeLog
```

The prior branch's `93a5294` patched this to fall through both shapes:

> `create-contact` :return: contactId falls through `upsertedId` → `lastErrorObject.upserted` to support connections with and without changeLog.

Without the fall-through, the picker's `onAddContact` chain fires `CallMethod appendContact { contactId: _actions: create_contact.response.response.contactId }` with `contactId: null` — the newly-created contact is appended with a null id and the "edit the just-added contact" flow opens an empty modal (the first of the two symptoms the prior branch hit).

**Proposed fix.** Add a sub-decision "`create-contact` upsertedId fall-through" under Key decisions, and list `modules/contacts/api/create-contact.yaml` under "Files changed → Modified". Exact patch from `93a5294`:

```yaml
:return:
  contactId:
    _if_none:
      - _if:
          test:
            _ne: [{ _step: check-existing }, null]
          then: { _step: check-existing._id }
          else: { _step: insert.upsertedId }
      - _step: insert.lastErrorObject.upserted
```

### 3. Dynamic form override via `_ref: { path: _module.var: form }` is unproven

> **Resolved — option B.** Dropped the `form` module var and the `_ref.path: _module.var` pattern. Consumers now override per-call via a `form_blocks` var on the wrapper (defaults to the shipped `form_contact_short.yaml.njk`). Decision #8 rewritten; module-vars table pruned.

Decision #8 proposes:

```yaml
blocks:
  - _ref:
      path:
        _module.var: form # path-as-operator
      vars: { ... }
```

`_ref` is a build-time operator (`packages/docs/operators/_ref.yaml:16`). Its `path` argument is documented as a `string`. Whether the build walker resolves `_module.var` before `_ref`'s `path` is inspected is not guaranteed by any doc I could find. The the reference implementation wrapper does not do this — it hard-codes the path and exposes no override.

Three safer options to consider:

- **A. Drop the override.** Hardcode `components/form_contact_short.yaml.njk`. Apps needing a different form fork the wrapper. Simplest, loses a goal.
- **B. Override via nested blocks slot on the wrapper.** Consumer passes `blocks:` to the wrapper `_ref` call, and the wrapper defaults to the form when none is supplied. Closer to how block content slots work in Lowdefy. Per-call rather than per-module, which is actually what the reference implementation has (the form is inlined at every wrapper usage there — they just didn't expose the override).
- **C. Module var holds the entire block subtree.** `form_block` defaults to the full `_ref { path, vars }` object; the wrapper emits it as `blocks: [_module.var: form_block]`. But the wrapper's runtime vars (`key`, `new_contact`, `get_contact` etc.) can't reach it from inside a module-var-resolved subtree — those vars are wrapper-local. Likely unworkable.

**Recommendation.** Switch to **B**. Change goal #3 to "default modal form shipped; consumers can pass `blocks:` to the wrapper to replace it, receiving the wrapper's state keys as \_vars". Removes the `form` module var and the unproven `_ref.path: _module.var` pattern.

### 4. `get_contact` unification is more complex than necessary

> **Resolved — subsequently revised.** Initial resolution adopted the two-var pattern (`id` + `user_id`) with `MongoDBFindOne`. That FindOne choice was later reversed based on in-session feedback ("prefer MongoDB aggregations over FindOne — enables project-stage injects"). Final shape: keep `MongoDBAggregation`, parameterise `id` + `user_id`, add a `request_stages.get_contact` hook. Consumers keep `.0` reads unchanged; the 18-site sweep dropped from scope. Block's `setEditContact.js` unwraps the array with `` `${getContactRequest}.0` `` to absorb the aggregation response. See decision #4.

Decision #4 proposes:

```yaml
payload:
  _id:
    _if:
      test:
        _build.eq: [{ _var: { key: id_source, default: url_query } }, state]
      then:
        _var: state_key_for_id
      else:
        _url_query: _id
```

Three vars (`id`, `id_source`, `state_key_for_id`), a build-time branch, and a magic string `state`. the reference implementation solves the same problem in four lines (`apps/shared/contacts/requests/get_contact.yaml:5-7`):

```yaml
payload:
  _id:
    _var: user_id
```

Consumer-side:

```yaml
# detail/edit page (default)
_ref: requests/get_contact.yaml
# vars defaults to empty; id defaults to 'get_contact', user_id defaults to { _url_query: _id }

# picker wrapper
_ref:
  path: requests/get_contact.yaml
  vars:
    id: {{ id | replace(".", "_") }}_get_contact
    user_id:
      _state: {{ id | replace(".", "_") }}_contact_id
      ~ignoreBuildChecks: true
```

The `_var: user_id` gets a `_state` operator node as its value for the picker case, or `{ _url_query: _id }` (via `default:` in the request) for detail pages. `_var` preserves operator nodes through the build, so this works. The request only needs two vars: `id` and `user_id`.

**Proposed fix.** Rewrite decision #4 to match the reference implementation's single-var pattern. Keep the `MongoDBFindOne` conversion and the 18 `.0` drops — those are still needed.

## Clarity — won't block, but confuses readers

### 5. Form override pseudocode uses invalid Nunjucks syntax

> **Resolved — obsoleted by #3.** Decision #8 was rewritten under finding #3 to use the consumer-supplied `form_blocks` pattern. The offending `{{ _module.var: form }}` snippet no longer exists.

Decision #8 shows:

```yaml
blocks:
  - _ref: { { _module.var: form } } # evaluated at build time via _module.var
```

`{{ ... }}` is Nunjucks; `_module.var:` is YAML/Lowdefy. The two don't compose. Even in `.yaml.njk`, this would render as literal text then fail YAML parsing. The confusion is probably: "this is a placeholder, real YAML would be `_module.var: form` with no `{{ }}`". Replace the snippet with a real YAML example and remove the `{{ }}` wrapper.

### 6. "FindOne-less enrichment pipeline" is a typo

> **Resolved.** Updated the `get_contacts_data.yaml` description in Files changed → New to "MongoDBAggregation that enriches selected + option contacts by id…".

"Files changed → New" says `get_contacts_data.yaml` is a "FindOne-less enrichment pipeline". Presumably meant "aggregation-based enrichment pipeline" — `get_contacts_data` is a `MongoDBAggregation` (the reference implementation's version is at `apps/shared/contacts/requests/get_contacts_data.yaml:3`). Not "FindOne-less", just Aggregation.

### 7. `all_contacts: false` default needs a runtime guard against empty `company_ids`

> **Resolved.** Decision #5 expanded with a paragraph documenting the conditional `in` filter: only included when the user has ≥1 `company_id`, else the picker shows no options for that user.

the reference implementation's `contacts_selector_search_contacts.yaml:22-27`:

```yaml
else:
  - in:
      path: global_attributes.company_ids
      value:
        _user: global_attributes.company_ids
```

The prior branch's `4e072de` commit message called out:

> `all_contacts` filter guards against null user.global_attributes.company_ids at runtime: Atlas rejects "in.value: null", so the filter is only added when the user has at least one company_id.

The design's "Atlas `$search`" decision (#5) inherits the reference implementation pipeline without noting this runtime guard. Users who log in without any company_ids will hit a 500 from Atlas. Add to decision #5: "the `in` filter is conditionally added only when the user has a non-empty `global_attributes.company_ids`; users with no companies see no options when `all_contacts` is `false`."

## Minor

### 8. Decision #7's `allowVerify` prop on the block — unverified

> **Resolved — port to block.** `allowVerify` rendering added to this design's scope. `ContactListItem.js`, `ContactList.js`, `ContactSelector.js`, `meta.js` listed under Files changed → Modified. Non-goals updated with the exception.

Decision #7 says "Wrapper passes `allowVerify` (boolean) to the block when mode is `trusted`; the block's `ContactListItem` already supports this (from the `93a5294` prior-branch work)". That prior-branch work never landed on the v5 block — `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/ContactListItem.js` (this branch, `dfa11d5`) has no `allowVerify` code path; only `allowEdit` / `allowDelete`. The design assumes a block feature that doesn't exist yet.

**Proposed fix.** Either scope-out the verify-button UI (verified mode still writes `global_attributes.verified`, but no UI changes until the block gains `allowVerify` in a later change), or add a sub-task "port `allowVerify` rendering in `ContactListItem.js`" to the design's Files changed / downstream steps. The cleaner path is the first — keep this design focused on the wrapper; ship verify UI as a follow-up.

### 9. 18 `.0` drops — one site missed from the count

> **Resolved.** Added a paragraph to decision #4 noting that `modules/contacts/pages/contact-edit.yaml:73`'s bare `_ref: requests/get_contact.yaml` stays unchanged after unification (default `id` still evaluates to `get_contact`).

Design decision #4 enumerates 18 consumers of `get_contact.0.*`. Grep of `modules/contacts/**` surfaces the same count, but note that `modules/contacts/pages/contact-edit.yaml:73` is a `requests:` entry (`- _ref: requests/get_contact.yaml`) that also needs its `id` kept explicit for clarity post-unification (consumers now share the name `get_contact` with no prefix). Worth a sentence: "the edit-page request entry stays as a bare `_ref` — the default `id` from the parameterised request evaluates to `get_contact`."

### 10. `keyword` templating path — clarify where the njk happens

> **Resolved.** Added a line under decision #2 clarifying `keyword` is rendered via Nunjucks in the wrapper's title/placeholder strings, not a Lowdefy operator.

Decision #3's table lists `keyword` as rendered in "titles/placeholders (e.g. 'Subscribers details')". Mechanically, this is a Nunjucks expression in the wrapper's `title`/`placeholder` strings (the reference implementation: `title: {% if keyword != null %}{{ keyword }} details{% else %}Contact details{% endif %}`). Add one line in decision #3 so readers don't wonder whether it's a Lowdefy operator.

---

## Summary

Four correctness findings (1-4) block the edit/add flow and should be resolved before `/r:design-task`:

1. `update-contact.yaml` `updated.timestamp` filter needs the conditional guard.
2. `create-contact.yaml` `upsertedId` needs the `lastErrorObject.upserted` fall-through.
3. Form override mechanism needs a proven pattern (recommend: consumer-supplied `blocks:` slot).
4. `get_contact` unification can match the reference implementation's two-var pattern instead of the three-var branch.

Three clarity (5-7) and three minor (8-10) items are polish but worth addressing in the same pass.

The design's core thesis — port the reference implementation's wrapper, unify `get_contact`, wire to existing APIs — is sound. None of the findings question the approach; they all land on "the design under-specifies load-bearing details from the prior branch's discoveries."

Next: `/r:design-action-review contacts-module-contact-selector`.
