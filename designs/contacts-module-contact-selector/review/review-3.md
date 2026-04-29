# Review 3 — Post-integration fixes (Tasks 1-8 landed, demo smoke test)

Six findings surfaced while running the rich picker end-to-end against the demo app. All are correctness or UX issues the design under-specified; none question the overall approach. All resolved in-session — this review documents them so the design reflects shipped behaviour.

## Findings

### 1. Atlas `$search.compound` must have ≥1 clause; `should: []` on empty input fails at runtime

**Symptom.** First page render threw `"compound" must have at least one clause at contacts/contacts-collection/{id}_contact_search`.

**Cause.** `search_contacts.yaml`'s `$search.compound.should` resolves to `[]` when the user hasn't typed anything yet (we intentionally skip the text/wildcard clauses to avoid an empty-query ranking). Atlas rejects a compound with all four clause categories empty.

**Fix.** Add a baseline clause that always passes:

```yaml
compound:
  filter:
    - exists:
        path: _id
  should:
    _if: ...empty-input guard...
```

`exists: { path: _id }` matches every doc (indexed field, required by schema). Gives compound a minimum viable shape so the pipeline returns all active contacts when input is empty, ranked text when input has content.

**Design impact.** Decision #5 under-specified the empty-input case. Added a sentence to the decision describing the baseline filter clause. `search_contacts.yaml` file-body comment updated.

### 2. `$project` used `$lowercase_email` but that field isn't in the Atlas stored source

**Symptom.** Dropdown showed "No email" for every contact, even ones with valid email addresses.

**Cause.** `returnStoredSource: true` returns only fields declared as stored in the Atlas search index config. For `user-contacts`, `email` is stored (the contacts list table reads `email` directly — confirmed at `modules/contacts/components/table_contacts.yaml:31`). `lowercase_email` is used for case-insensitive *search paths* but isn't in the index's storedSource declaration, so `$project { email: "$lowercase_email" }` produced null on every row.

**Fix.** Project `$email` first, fall back to `$lowercase_email` as secondary. Apply to both `search_contacts.yaml` and `get_contacts_data.yaml` (both feed the picker's row rendering; shape parity matters):

```yaml
email:
  $ifNull:
    - "$email"
    - "$lowercase_email"
```

**Design impact.** The two requests' "shape must match the block's `value`" contract was right; the field choice was wrong. Design doesn't enumerate projected fields at the field-name level — no change needed there, just the request YAML.

### 3. Dropdown closed on every keystroke — root cause was the wrapper's `optionsLoading`, not the block

**Symptom.** Typing in the picker's search input closed the dropdown ~1 second after each keystroke. Previously marked unresolved on branch `93a5294`; the v5 migration (`dfa11d5`) did *not* fix it despite design Resolved-questions #4 assuming otherwise.

**Cause.** The wrapper set `optionsLoading: _request_details: {id}_contact_search.0.loading & input-non-empty`. `ContactSelector.js:78` passes that as the `loading` prop to `<Selector>`. `Selector.js:72-76`:

```js
disabled={
  properties.disabled ||
  loading ||                // ← toggles true during in-flight search
  (properties.max && selectedContacts.length >= properties.max)
}
```

antd `<Select>` closes its dropdown when it transitions to `disabled`. So every keystroke → debounced search fires → `loading` flips true → Select becomes disabled → dropdown closes → search returns → Select re-enables with dropdown already gone.

The old inlined demo page (pre-Task-8) didn't pass `optionsLoading`, so `loading` was undefined and the Select never got disabled during search. The wrapper reintroduced the bad wiring.

**Fix.**

1. **Root cause.** Remove `loading` from the `disabled` expression in `Selector.js`. The "Fetching Contacts..." indicator via `fetchState` (local state) + `notFoundContent` remains the loading signal. Drop the `optionsLoading` property from the wrapper's emitted properties.

2. **Defense in depth.** Control the dropdown's `open` state explicitly in `Selector.js` (focus → open, blur → close, `onSearch` explicitly re-opens). Memoize the Label's `content` prop with `useCallback` + `useMemo` in `ContactSelector.js` to stop churning identity on every parent re-render. Both changes cost nothing and guard against similar cascades from future props.

**Design impact.** Resolved-questions #4's assumption that the v5 migration resolved this was wrong. Updating to "resolved at review-3 via root-cause fix: `optionsLoading` was gating `Select disabled`, which antd reads as dropdown-close trigger."

### 4. `form_contact_short`: only email should be locked on edit, not names

**Symptom.** User couldn't edit first/last name on existing contacts.

**Cause.** Task 6's spec said "disabled unless `new_contact === true`" on given_name, family_name, and email. But `design.md:270` only called out email as intentionally locked (it's the dedup key). Names were locked by over-application of the same pattern.

**Fix.** Remove the `disabled: _not: _var: new_contact` from the given_name and family_name blocks. Keep email locked. Note the `update-contact` pipeline's stage-2 `$set: profile.name: $concat` recomputes the derived `profile.name` from the edited given/family pair, so table display stays consistent.

**Design impact.** Task 6's acceptance criterion was "Opening the Edit modal disables email, first name, last name inputs" — narrow to email only.

### 5. `form_blocks` replace-whole-form was the wrong contract

**Symptom.** (Not a bug — user-driven refinement.) The design let consumers swap the default modal form entirely via `form_blocks`. User wanted append-style extension instead: keep name+email defaults, add fields.

**Cause.** Decision #8 picked full-replace as the override mechanism. Other contacts-module forms (`form_profile.yaml` / `fields.profile` module var, `form_email.yaml`) use the opposite pattern: a fixed core set with an extension slot via `_build.array.concat`. Replacing-vs-extending was a style mismatch; extending is more consistent with the module's existing conventions.

**Fix.** Swap wrapper var `form_blocks` → `form_extra_blocks`; form accepts `extra_blocks` var appended via `_build.array.concat` to the core three inputs. Consumers who want a radically different form fork this file (or call the block directly) — deliberately no longer first-class.

**Phones dropped from defaults** at the same time: they're now an example of what consumers would pass via `form_extra_blocks`, not part of the default. Keeps the default focused on what every contact needs (name + email).

**Design impact.** Decision #8 rewritten: "Consumers append fields via `form_extra_blocks` rather than replace the whole form". Module-vars table pruned (phones, `form_blocks`). Form file's header comment and var list updated.

### 6. Quickly selecting contacts clears the entire block value — `__getContactsData`'s third action races

**Symptom.** Clicking two dropdown options quickly (rapid adds) cleared the block value — sometimes to a single stale contact, sometimes to `[]`.

**Cause.** `getContactsData.js` registered three actions: (a) SetState `{id}_fetch_contacts = contactIds`, (b) Request the enrichment, (c) SetState **`[statePrefix()]` (the block's own value)** to `_array.filter` of the response keyed on `selectedContactIds`. That third action overwrites the block value with the filter of whatever the most-recent `{id}_contacts_data` cache entry is. Two clicks in rapid succession:

1. Click A → `useContactManager.addContact` sets value to `[A]` → `useEffect` on value fires → `getContactsData({contactIds: [A], selectedContactIds: [A]})`. Request for `[A]` fires.
2. Click B (before A's enrichment returns) → value is `[B, A]` → `useEffect` fires again → `getContactsData({contactIds: [B, A], selectedContactIds: [B, A]})`. Request for `[B, A]` fires. Request name is the same, so the cache is shared.
3. The first event's third action runs with response = `[A]` (if that event's Request finished), but filters on `selectedContactIds = [A]`, resulting in `[A]` — wiping B.

More rigorously: the third action lives in a `registerEvent` action chain. Between event invocations, React's batching + Lowdefy's event queue don't guarantee that the response cache belongs to "this" event invocation. The filter is keyed on stale `selectedContactIds` from whichever triggerEvent snapshot ran last.

The abandoned prior branch (commit `93a5294`) hit this bug and patched it:

> Plugin ContactList no longer overwrites block value with `__setContactsData` — the third step of `__getContactsData` was wiping new stubs when the backfill response didn't include them. Enrichment flows through `properties.data` → `contactsData` for display only.

The v5 migration (Task 2 predecessor `dfa11d5`) lost this fix.

**Fix.** Remove the third action from `getContactsData.js`. Enrichment flow is already correct: the request result lands on `properties.data` (the wrapper sets `data: _request: {id}_contacts_data`), `ContactSelector.js` copies that into local `contactsData`, `ContactList.js`'s `getContactData(contact)` merges it at render time for display. Block value management stays owned by `useContactManager.addContact` / `removeContact` — a single path per click, no race.

**Design impact.** Task 2's scope didn't call out the getContactsData logic; this is a block-internal bug the port missed. Adding `hooks/contactActions/getContactsData.js` to Files-changed and a note that the plugin's enrichment pipeline is display-only.

---

## Summary

Three correctness bugs (1, 2, 6), one major UX bug (3), one spec over-reach (4), one deliberate contract refinement (5). All six resolved in-session. The design's core approach still holds — these are implementation-details-matter findings, not "the wrapper doesn't work" findings.

Files touched by this review's fixes:

- `modules/contacts/requests/search_contacts.yaml` — baseline `exists: _id` filter clause; project `$email` not `$lowercase_email`.
- `modules/contacts/requests/get_contacts_data.yaml` — project `$email` not `$lowercase_email`.
- `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/Selector.js` — drop `loading` from `disabled` (root-cause fix); add controlled `open` state (defense-in-depth).
- `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/ContactSelector.js` — memoize Label `content` prop with `useCallback` + `useMemo` (defense-in-depth).
- `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/hooks/contactActions/getContactsData.js` — drop the third action (`__setContactsData` writing back to the block value) — enrichment is display-only; value stays owned by `useContactManager`.
- `modules/contacts/components/contact-selector.yaml.njk` — drop `optionsLoading` property; swap `form_blocks`/replace-default to `form_extra_blocks`/append.
- `modules/contacts/components/form_contact_short.yaml.njk` — unlock name fields on edit; delete phone blocks; accept `extra_blocks` var with `_build.array.concat` at end.

Next: update `design.md` Decisions #5, #8, and Resolved-questions #4; add this review to the consistency pass.
