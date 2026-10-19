# Task 2: `get_user_passkeys` — per-credential admin read for the revoke picker

## Context

The revoke-passkeys confirm dialog (task 5) offers a per-key choice where the target holds more than one
passkey. The existing detail read cannot feed it: `get_user_detail.yaml` `$lookup`s `user-passkeys`
only to `$size` them into the integer `passkey_count`, and `requests/stages/close_row.yaml` `$unset`s
the whole `passkeys` array before the row reaches the browser — only the count survives.

So the dialog needs a dedicated read (Decision 2). It is the **admin-side mirror** of the self-service
`modules/user-account/requests/get_passkeys.yaml`, which reads the identical shape scoped to `_user.id`;
this one is scoped to the target `userId` from the urlQuery, over the same read-only `user-passkeys`
connection (`write: false`).

## Interfaces

- **Produces:** request `get_user_passkeys`, returning an array of `{ passkey_id, name, device, created_str }`
  rows for the target user — consumed by task 5's dialog and added to `pages/view.yaml`'s request set in task 6.

## Task

Create `modules/user-admin/requests/get_user_passkeys.yaml`, a `MongoDBAggregation` over the
`user-passkeys` connection (`_module.connectionId: user-passkeys`). Model it on
`modules/user-account/requests/get_passkeys.yaml` but match the target user from the urlQuery rather than
the caller:

```yaml
id: get_user_passkeys
type: MongoDBAggregation
connectionId:
  _module.connectionId: user-passkeys
payload:
  user_id:
    _url_query: userId
properties:
  pipeline:
    - $match:
        userId:
          _payload: user_id
    - $sort:
        createdAt: -1
    - $project:
        _id: 0
        passkey_id: "$_id"
        name:
          $ifNull:
            - "$name"
            - Passkey
        device:
          $ifNull:
            - "$deviceType"
            - ""
        created_str:
          $dateToString:
            date: "$createdAt"
            format: "%Y-%m-%d"
            onNull: ""
```

`passkey_id` (the passkey row `_id`) is the value `RevokeUserPasskeys({ passkeyId })` takes, mirroring
self-service `PasskeyDelete`.

## Acceptance Criteria

- File exists and compiles (`pnpm ldf:b`).
- Read is matched on the urlQuery `userId` (the target), over the `write: false` `user-passkeys`
  connection.
- `passkey_id` is projected (needed as the `RevokeUserPasskeys` `passkeyId` in task 5).

## Files

- `modules/user-admin/requests/get_user_passkeys.yaml` — create.

## Notes

The `user-passkeys` read connection already exists in the module (`connections/user-passkeys.yaml`,
exported in the manifest) — no connection change is needed. This task does **not** wire the read into
`pages/view.yaml`; task 6 does that (adding it to `requests:` and the `onMount` fetch).
