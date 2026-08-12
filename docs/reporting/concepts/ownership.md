---
title: Report ownership, visibility and retirement
module: reporting
type: concept
concepts:
  [
    ownership,
    visibility,
    share-roles,
    favourites,
    soft-delete,
    duplicate,
    spec-version,
  ]
---

# Report ownership, visibility and retirement

A saved report has an owner, an audience and a life cycle. This page covers who can see a report, who can change it, and what happens when it is retired.

Every rule below is enforced **server-side, in the endpoint**. The list and report pages hide actions a viewer cannot take, but a hidden menu item is a UX affordance — the match inside the endpoint is the authorization.

## Reports are private until deliberately published

`visibility` is `private` or `shared`, and new reports are `private`. An absent `visibility` reads as `private`, so nothing needs migrating.

`shared` means the whole app: the report is listed in everyone's Shared scope and openable by everyone. There are no per-person or per-team grants, no groups and no share links. Anything finer needs an access model this module does not have.

## `share_roles` is the publish privilege, and the two directions differ

Set the [`share_roles`](../reference/vars.md) var to the roles whose holders may publish. **Unset means nothing can be published** — every publish call is rejected and no publish control renders.

The two directions are gated differently, and this is deliberate:

| Act           | Requires                           |
| ------------- | ---------------------------------- |
| **Publish**   | owner **and** a `share_roles` role |
| **Unpublish** | owner **or** a `share_roles` role  |

Requiring both in both directions reads tidier and is the version that breaks. It makes a publish reversible only while _both_ halves still hold, and three ordinary situations dissolve one of them: a publisher whose role is revoked can no longer retract their own app-wide report; an app that switches publishing off freezes every already-shared report in place; and an author who leaves takes the only retraction path with them. In each case the content stays in front of the whole app and deleting it is the only remaining exit.

Two consequences worth stating plainly:

- **A `share_roles` holder can retract a report they do not own.** That is a moderation power, and it is intentional — anyone trusted to decide what the whole app sees is trusted to decide it should stop seeing something. There is no equivalent power to publish, rename, delete or edit someone else's report.
- **Removing the var is not retroactive.** Reports already shared stay listed and readable, and their owners can still unpublish them — precisely because unpublish falls back to the owner.

## What `shared` does and does not promise

This is the one thing to get right, because the natural reading is wrong.

There are **two independent role concepts** in this module. `share_roles` governs who may publish a report. The catalog's per-collection [`roles`](../reference/catalog.md#roles-semantics) govern who may query the data underneath it, and that gate is enforced against the **viewing** user on every resolve, section by section — a report is revalidated for whoever opens it, never trusted because it was valid when saved. **Nothing checks the two against each other**, and they are not meant to be the same thing.

So `visibility: "shared"` promises exactly this: the report is listed in everyone's Shared scope and openable by everyone. **It does not promise every viewer sees numbers.** A `share_roles` holder can publish a report over a role-gated collection to an app where few others hold that role, and those viewers get the report with its gated sections failing.

In the common case there is nothing to explain: catalog role-gating is opt-in, and a collection with an absent or empty `roles` list is queryable by any authenticated user, so an app that gates nothing has the two layers coincide exactly.

## The five list scopes

| Scope        | Returns                                                                      |
| ------------ | ---------------------------------------------------------------------------- |
| `mine`       | Your reports, any visibility. Publishing does not remove a report from Mine. |
| `shared`     | Every published report, including your own.                                  |
| `favourites` | Reports you starred **that you can still read**.                             |
| `all`        | Everything you can read — yours plus everything published. The widest scope. |
| `deleted`    | Your soft-deleted reports. Owner-only, and never anyone else's.              |

`deleted` is the only scope that inverts the soft-delete test, and the only one that is owner-only regardless of visibility: you never see anyone else's deleted reports, including ones that had been published to you.

`all` is a tab alongside Mine, Shared and Favourites — the place to search across scopes at once, for when someone knows they saved something and not which scope it is in. It _is_ the readable predicate with nothing added, so it widens nothing the other scopes already allow.

## Favourites are per-user

A star is yours alone. Favourites are stored as user ids on the report and projected to a boolean for whoever is reading, so **a caller never learns who else favourited a report**.

They work on reports you do not own, which has one consequence worth knowing: **a favourite is not a grant.** The marker outlives the sharing that allowed it. Nothing clears it when a report is unpublished — the read filters instead, so the star sits dormant, drops out of your Favourites scope, and works again if the report is republished.

## Non-owners get read-plus-duplicate

On someone else's published report you can open it, star it, download a section, and duplicate it. The edit actions are **absent, not disabled**.

**Duplicate is the escape hatch** that makes read-only comfortable: rather than a request-access dance, copy the report into one you own and change it freely. The copy is always private, owned by you, with favourites reset and **no conversation link inherited** — that last is confidentiality, not tidiness, since the original author's chat transcript is not yours to open. The original is untouched.

Where the copy opens depends on where you duplicated from. From the reports list you stay put and the copy appears in Mine. From the report page it **opens in a new tab**, leaving the original where it is — you are usually duplicating precisely because you want to keep referring to it, and refreshing the page you are on would show you the original again with nothing to indicate a copy was made.

## Soft delete is the only retirement

There is no archive state and no purge endpoint. **Nothing in this module hard-deletes** — and the delete confirmation says so truthfully, because the module never writes to your source collections at all. Deleting only ever writes a `deleted` stamp on the report document.

One soft delete buys a consequence for free: because every read filters the stamp, **deleting a published report drops it from everyone's Shared scope** with no separate unpublish step.

**Restore returns a report to `private`**, in the same update that clears the stamp. Silently re-publishing something deleted months ago would hand it back to the whole app before anyone re-read the numbers, so republishing is one deliberate act afterwards.

## Which writes update the timestamp

The repo convention is a [change stamp](../../shared/change-stamps.md) on every write, and reporting narrows it in one place — because the list sorts on `updated.timestamp`, so the stamp is not only an audit record, it is the list's order.

| Write                        | Stamps `updated`? |
| ---------------------------- | ----------------- |
| Create, rename, drop-section | Yes               |
| Favourite / unfavourite      | **No**            |
| Publish / unpublish          | **No**            |
| Restore                      | **No**            |

A favourite is one user's read-side marker, and stamping it would jump the report to the top of _every_ user's list each time anyone starred it. Publishing and restoring change who may see a report, not what it is — and the report page's provenance line states when the **spec** last changed, so stamping a restore would make that line assert an edit that never happened.

The visible cost is that a report last edited in March and restored today returns to its March position rather than the top. That is paid for by handing you the restored report directly instead of returning you to a list to find it.

## `spec_version` and the compatibility rule

Every report carries `spec_version: 1`. Nothing branches on it yet; it exists so a future compatibility branch or migration has something to key on, and it cannot be backfilled meaningfully later — an existing document gives no way to tell which grammar it was written against.

It matters because the stored spec is **re-validated on every read**. A tightening of the spec grammar therefore retroactively invalidates documents already saved, so the rule is that **the validator may loosen for persisted shapes and never tighten**. That is forced rather than chosen: nothing in this repo can migrate a module-owned collection, so a tightening that needs a migration needs the mechanism built first.

## Editing a report

Deliberately narrow. An owner can edit a report's **title and description** and drop a section from it; there is no add-section, reorder, or edit-a-section path, and no general spec write.

Title and description are document fields rather than spec fields, which is why editing them is a one-field write that never touches the compiled report. Both are reachable from the same **⋯** menu on two surfaces — a row in the reports list, and the report page's own header — and it is one menu: the same ownership gates, the same endpoints, the same copy. What differs is only what happens after a write, since the list refetches in place while the report page re-navigates to re-resolve.

The description is optional and distinguishes _not sent_ from _emptied_: the list's rename modal sends the title alone and leaves any stored description untouched, while clearing the field on the report page clears it for real.

Re-deriving a spec is the assistant's job: ask it to change something and it produces a **new** report. Dropping a section is the one exception, and it cascades — removing a filter unbinds it from the sections that used it, and removing the last section bound to a filter removes that filter too. It refuses exactly one thing: leaving the report with no sections, and it points you at deleting the report instead.
