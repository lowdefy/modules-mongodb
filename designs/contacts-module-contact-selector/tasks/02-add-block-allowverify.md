# Task 2: Add `allowVerify` prop to the `ContactSelector` block

## Context

The `verified` module var (design decision #7) is tri-state: `off` | `trusted` | `untrusted`. When set to `trusted`, the wrapper will pass `allowVerify: true` down to the block, and the block needs to render a distinct Verify (danger) button in place of Edit for rows where `contact.verified !== true`.

The block currently lives at `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/` on this branch (`dfa11d5`, v5-migrated). Its `ContactListItem.js` only renders `allowEdit` / `allowDelete` buttons — no verify UI exists yet. This task adds it.

The prop is plumbed: `ContactSelector.js` reads `properties.allowVerify` and passes it to `ContactList.js`, which forwards it to each `ContactListItem.js`. `meta.js` gains a documented property entry so the block's published schema reflects the new surface.

## Task

**`plugins/modules-mongodb-plugins/src/blocks/ContactSelector/ContactListItem.js`** — accept a new `allowVerify` prop. Replace the single Edit button with conditional rendering:

- When `allowVerify === true` and `!contact.verified`: render a Verify (danger-styled) button that still calls `editContact(contact)` on click. Use antd's `Button` with `danger`, `type="primary"`, label "Verify" (or icon + label at your discretion — match the existing button sizing / layout).
- Otherwise (including `allowVerify !== true`, or contact is verified): render the existing Edit button as-is, gated on `allowEdit`.

The delete button behaviour is unchanged.

**`plugins/modules-mongodb-plugins/src/blocks/ContactSelector/ContactList.js`** — add `allowVerify` to the destructured props, forward it to each `ContactListItem`. Also include the "Verify" column in the actions header width calculation if the header text needs to widen (current width is 88px; may need to grow to 120px or similar).

**`plugins/modules-mongodb-plugins/src/blocks/ContactSelector/ContactSelector.js`** — pass `allowVerify={properties.allowVerify ?? false}` down to the `<ContactList>` alongside the existing `allowEdit` / `allowDelete`.

**`plugins/modules-mongodb-plugins/src/blocks/ContactSelector/meta.js`** — this module is loaded at build time for the block's public schema. It exports an object with `category`, `valueType`, `icons`, `cssKeys`, `events`, `slots`. Today properties aren't enumerated here — add a short description for `allowVerify` alongside other per-row controls in a comment or in the `cssKeys` / events documentation so readers discover the prop.

## Acceptance Criteria

- `pnpm build` in `plugins/modules-mongodb-plugins` succeeds.
- The demo page at `apps/demo/pages/contact-selector-demo/` still renders correctly with no behavioural change (the demo doesn't set `allowVerify`, so Edit stays).
- Manual visual test: temporarily set `properties.allowVerify: true` on the demo's `ContactSelector` block and confirm that unverified-looking contacts (where `verified !== true` in the selected data) show a Verify button; verified contacts still show Edit.
- No regressions on `allowEdit: false` or `allowDelete: false` paths.

## Files

- `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/ContactListItem.js` — modify — add `allowVerify` prop and conditional Verify/Edit rendering
- `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/ContactList.js` — modify — destructure + forward `allowVerify`
- `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/ContactSelector.js` — modify — pass `properties.allowVerify` down
- `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/meta.js` — modify — document the new `allowVerify` property
- `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/hooks/contactActions/setEditContact.js` — modify — change `{ _request: getContactRequest }` to ``{ _request: `${getContactRequest}.0` }`` so the block unwraps the aggregation array into a single-doc state value (design decision #4)

## Notes

- Verify button's click action is the **same** as Edit — it calls `editContact(contact)`. The distinction is purely visual (danger styling + "Verify" label) to signal that the action is about resolving an unverified contact.
- Don't introduce a new `onVerify` event. The wrapper handles verification via the existing `onEditContact` chain with the `global_attributes.verified: true` payload.
- The `contact.verified` field is projected at top level by the new `search_contacts` and `get_contacts_data` requests (Task 4) from `global_attributes.verified`. Don't read `contact.global_attributes.verified` in the block — the request shape already flattens it.
