---
"@lowdefy/modules-mongodb-contacts": minor
---

contacts: splice `request_stages.selector` before the label projection

`get_contacts_for_selector` concatenated consumer stages onto the **end** of its
pipeline, after `$project` and `$sort`. By that point the only fields left are
`label` and `value`, so the extension point could not do the thing selector
stages exist for — filter the option list on document fields. The base
`hidden`/`disabled` filtering was hardcoded in the first `$match` and there was
no way to add to it.

Consumer stages now run between the base `$match` and the `$project`, so they
can filter or derive on raw document fields. This matches
`get_companies_for_selector`, which has always spliced on that side and whose
own comment states the reason.

The motivating case: an app whose contacts collection also holds its user
records wants those excluded from contact pickers
(`apps.<app>.is_user: {$ne: true}`) while keeping them on the contacts list. That
is a raw-field filter, and it was not expressible in config at all.

**Behaviour is unchanged where `selector` is unset** (the default `[]`
contributes nothing to the concat), which is every consumer in this repo today.
If you already pass `selector` stages, check whether any of them reference
`label` or `value` — those fields no longer exist at the splice point. Stages
that filter or derive on document fields keep working and now actually affect
the result set.

Verified against a demo build with a marker stage configured: the consumer
`$match` lands between the base `$match` and the `$project`, and the rest of the
pipeline is unchanged.
