# ContactSelector

A multi-select contact picker. Search the contact pool, add a new contact inline (with a custom form rendered into the modal slot), edit or verify selected contacts, and remove them. Used by the [`contacts` module](../../../../../modules/contacts/README.md) to back its `contact-selector` component.

The block stores the selected contact ids as its value (an array). It owns three requests — search, fetch one for editing, fetch enrichment data for the list — that the consumer wires by name.

## Usage

```yaml
- id: subscribers
  type: ContactSelector
  requests:
    - id: search_contacts
      type: MongoDBAggregation
      connectionId: contacts-collection
      payload:
        input:
          _state: subscribers_input
      properties:
        pipeline: [...]   # match against `input`, return [{ value: <id>, label: <html>, contact: {...} }]
    - id: get_contact
      type: MongoDBAggregation
      connectionId: contacts-collection
      payload:
        user_id:
          _state: subscribers_contact_id
      properties:
        pipeline: [...]   # return one contact for the edit form
    - id: get_contacts_data
      type: MongoDBAggregation
      connectionId: contacts-collection
      payload:
        contact_ids:
          _state: subscribers_fetch_contacts
      properties:
        pipeline: [...]   # enrich each selected id with display fields
  events:
    onAddContact:
      - id: create
        type: CallAPI
        params:
          endpointId: contacts-create-contact
          payload:
            _state: subscribers_contact
      - id: append
        type: CallMethod
        params:
          blockId: subscribers
          method: appendContact
          args:
            - contact:
                _state: subscribers_contact
              contactId:
                _actions: create.response.response.contact_id
    onEditContact:
      - id: update
        type: CallAPI
        params:
          endpointId: contacts-update-contact
          payload:
            _state: subscribers_contact
  properties:
    title: Subscribers
    placeholder: Search contacts...
    allowNewContacts: true
    allowEdit: true
    allowDelete: true
    searchContactsRequest: search_contacts
    getContactRequest: get_contact
    getContactsDataRequest: get_contacts_data
    options:
      _request: search_contacts
    data:
      _request: get_contacts_data
    list:
      title: Subscribers
      placeholder: No subscribers selected
      item:
        title: "{{ name }}"
        description: "{{ email }}"
  blocks:
    # The form rendered inside the add/edit modal.
    - id: subscribers_contact.given_name
      type: TextInput
    # ... other input blocks read/written at `subscribers_contact.*`
```

The form rendered inside the modal lives in the block's children. Inputs should write to state under `{blockId}_contact.*`. The block reads those values back when the user submits and supplies them as the modal's working contact.

The pre-wired `contact-selector` component on the `contacts` module sets all of this up — most consumers should reach for that instead of using the block directly.

## Properties

| Property | Type | Default | Description |
|---|---|---|---|
| `title` | string | — | Header rendered above the list of selected contacts. |
| `placeholder` | string | `Select item` | Placeholder for the search input. |
| `notFoundContent` | string | `Not found` | Empty-results text shown in the dropdown. |
| `size` | `"small"` \| `"middle"` \| `"large"` | — | Antd `Select` size. |
| `bordered` | boolean | `true` | Borderless variant when `false`. |
| `variant` | string | — | Antd `Select` `variant` (e.g. `"outlined"`, `"filled"`). |
| `autoFocus` | boolean | `false` | Focus the search input on mount. |
| `disabled` | boolean | `false` | Disable the search input. Also disabled automatically when `max` is reached. |
| `showSearch` | boolean | `true` | Enable client-side filter on the dropdown options. |
| `suffixIcon` | object | — | Lowdefy `Icon` properties for the suffix slot. |
| `max` | number | — | Maximum number of contacts that can be selected. |
| `allowNewContacts` | boolean | `true` | Show an "Add … as new contact" row in the dropdown when the search has no exact match. |
| `allowEdit` | boolean | `true` | Show the edit button on each row. |
| `allowVerify` | boolean | `false` | Replace the edit button with a `Verify` button on rows where `contact.verified !== true`. Submitting still fires `onEditContact`. |
| `allowDelete` | boolean | `true` | Show the delete button on each row. |
| `options` | array | `[]` | Search results from the `searchContactsRequest`, optionally concatenated with extra ad-hoc options. Each item: `{ value, label, contact }`. |
| `optionsLoading` | boolean | `false` | Show a loading indicator on the dropdown. |
| `data` | array | — | Result of `getContactsDataRequest`. Provides display fields (`name`, `email`, …) for each selected contact id. |
| `searchContactsRequest` | string | — | Request id used for searches. Required. |
| `getContactRequest` | string | — | Request id used to load a contact for editing. Required. |
| `getContactsDataRequest` | string | — | Request id used to enrich the selected list. Required. |
| `list` | object | — | Configuration for the list of selected contacts (see below). |
| `list.title` | string | — | Title rendered above the list. |
| `list.placeholder` | string | — | Text shown when no contact is selected. |
| `list.item.title` | string (Nunjucks) | `{{ name }}` | Per-row title template. Receives the contact's enrichment fields. |
| `list.item.description` | string (Nunjucks) | `{{ email }}` | Per-row description template. |
| `modal` | object | — | Configuration for the add/edit contact modal (see below). |
| `modal.title` | string | `Add contact` | Modal title in add mode. |
| `modal.editTitle` | string | `Edit contact` | Modal title in edit mode. |
| `modal.okText` | string | `Save` | Submit button label. |
| `label` | object | — | Forwarded to the Antd `Label` wrapper (extra, tooltip, …). |

## Events

| Event | When | Payload |
|---|---|---|
| `onChange` | Selected contact set changes (add or remove). | — |
| `onFocus` | Search input gains focus. | — |
| `onBlur` | Search input loses focus. | — |
| `onClear` | Search input is cleared. | — |
| `afterSearch` | A search query runs. | `{ value }` — the query string. |
| `onOpen` | Add/edit modal opens. | — |
| `onClose` | Add/edit modal closes. | — |
| `onCancel` | Modal is dismissed via Cancel. | — |
| `afterClose` | Modal close animation completes. | — |
| `onAddContact` | Add-contact form is submitted. | The form state at `{blockId}_contact` (read by the actions you attach). |
| `onEditContact` | Edit-contact form is submitted. | Same as `onAddContact`, with `{blockId}_contact._id` set. |

## Methods

| Method | Args | Effect |
|---|---|---|
| `appendContact` | `{ contact, contactId }` | Add a contact to the selection after `onAddContact` resolves with the new id. Call from the action chain on `onAddContact`. |

## Slots

| Slot | Purpose |
|---|---|
| `content` | The form rendered inside the add/edit contact modal. Input blocks should bind to `{blockId}_contact.*` state. |
| `footer` | Optional replacement for the default modal OK / Cancel buttons. |

## CSS Keys

| Key | Element |
|---|---|
| `element` | Outer container. |
| `selector` | Search/select input wrapper. |
| `list` | Selected-contacts list container. |
| `listItem` | Individual selected-contact row. |
| `modal` | Add/edit contact modal wrapper. |

The block also imports `style.less` from this directory for its base styling.

## Notes

- **Instance-scoped state.** The block reads form state at `{blockId}_contact`, the search query at `{blockId}_input`, and the editing-contact id at `{blockId}_contact_id`. Multiple ContactSelectors on one page must have different `blockId`s. The `contacts/contact-selector` Lowdefy component handles this for you.
- **Search debounce.** Search queries are debounced 500 ms before they call the request.
- **Add-new option.** With `allowNewContacts: true`, the dropdown shows an "Add `<query>` as new contact" row only when the search has text and is non-empty. Selecting it opens the modal in add mode and seeds the new contact.
- **Verify variant.** When `allowVerify: true`, rows where `contact.verified !== true` swap their Edit button for a danger-styled `Verify` button. The button still fires `onEditContact` — there's no separate `onVerify` event. The consumer's update API decides what verification means.
