# Task 6: Resend preserves the org tier and app roles server-side

## Context

The org-authority migration added the org-authority tier to invitations and re-sends
it on resend — but wired only one of the two resend callers to carry it (D-resend).

- `modules/user-admin/api/resend-invitation.yaml` sends `orgRole: { _payload: org_role }`
  with no default; the `InviteMember` step defaults an absent `orgRole` to `member`,
  so a resend that omits it silently strips the tier. It also builds `appRoles` and
  `attributes` as `_if_none: [{ _payload: … }, []] / {}`, so an absent payload blanks
  them.
- The pending-panel resend (`pages/invite.yaml`) sends `org_role`; **the
  Invitations-list Resend button (`all_invitations_table.yaml`) does not** — it
  sends `email`, `roles` (`row.role_ids`), `member_attributes` only. Resending a
  pending `admin`/`owner` invitation from the list silently downgrades it to
  `member` and reports success.

The invitation row cannot carry the tier for the caller to re-send:
`invitations_base.yaml` produces no org-tier alias, and `row-contract.md` states
`org_role` is deliberately **not** on the Invitations row. So the fix is
server-side — every resend caller becomes correct-by-construction.

`modules/user-admin/api/check-invite-email.yaml` already does the same
`MongoDBFindOne` read against `user-invitations` (its `find_invitation` step,
projecting `appRoles`, `role`, `attributes`) — mirror that shape.

## Interfaces

- **Consumes:** the stored invitation fields `appRoles`, `role`, `attributes` from a
  scoped `MongoDBFindOne` on `user-invitations`.
- **Produces:** a resend endpoint that preserves the stored tier/roles/attributes
  when the payload omits them — so task 7 can drop `role_ids` from the invitations
  row (this task removes the button's last read of it).

## Task

### `modules/user-admin/api/resend-invitation.yaml`

1. **Add a `find_invitation` step** ahead of the `resend` step — a `MongoDBFindOne`
   on the `user-invitations` connection, scoped
   `{ email, organizationId: { _module.var: org_slug }, status: pending }`,
   projecting `appRoles`, `role`, `attributes`. Mirror `check-invite-email.yaml`'s
   `find_invitation` (connectionId, case-normalised email match as appropriate).
2. **Default each preserved field to the stored value** on the `InviteMember` step:

```yaml
appRoles:
  _if_none:
    - _payload: roles
    - _request: find_invitation.appRoles
orgRole:
  _if_none:
    - _payload: org_role
    - _if_none: [{ _request: find_invitation.role }, member]
attributes:
  _if_none:
    - _payload: member_attributes
    - _request: find_invitation.attributes
```

(`_request` vs `_step` — use whichever the routine engine exposes the prior
step's result under in this Api routine; `check-invite-email.yaml` reads prior
steps via `_step`, so prefer `_step: find_invitation.*` if that is the routine
convention. Confirm against the existing step-reference style in the file's
routine.) 3. **Update the header comment** to state the endpoint preserves the stored
`orgRole` / `appRoles` / `attributes` when the payload omits them — no caller can
blank or downgrade by forgetting a field. Remove the framing that the callers
re-send them.

### `modules/user-admin/components/all_invitations_table.yaml` (Resend `onCellClick`)

1. **Drop the `roles: { _event: row.role_ids }` payload** from the
   `resend_invitation` action. `role_ids` leaves the invitations row in task 7, and
   the endpoint now preserves the roles server-side. The button sends only `email`
   (and any other still-valid existing fields). Reassess `member_attributes:
{ _event: row.member_attributes }` — the endpoint now defaults `attributes` from
   the stored invitation too, so the button need not send it; leave `member_attributes`
   only if the row still carries it and there is a reason to override. Prefer sending
   `email` alone, matching the "endpoint preserves by construction" intent.
2. **Correct the comment** claiming the button "re-send[s] them rather than blank
   them" — the endpoint, not the caller, now preserves.

## Acceptance Criteria

- `resend-invitation.yaml` reads the existing invitation and defaults `orgRole`,
  `appRoles`, `attributes` to the stored values when the payload omits them.
- The list Resend button no longer sends `roles: row.role_ids`.
- Header comment / button comment describe server-side preservation.
- `pnpm ldf:b` succeeds.

## Notes

Runtime verification (resend a pending `admin`/`owner` from both callers with each
field omitted in turn and read the invitation back unchanged) is a live-DB check —
it lands in task 11, not here.
