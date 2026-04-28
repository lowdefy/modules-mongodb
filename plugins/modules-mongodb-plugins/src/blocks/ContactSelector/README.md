# ContactSelector Block

The `ContactSelector` block is a customizable React component for selecting, adding, editing, and removing contacts within Lowdefy-based applications. It provides a user-friendly interface for managing a list of contacts, supporting search, multi-select, and modal-based editing.

## Features

- **Contact Search & Select:** Search and select one or multiple contacts from a list.
- **Add New Contacts:** Add new contacts directly from the selector if enabled.
- **Edit & Remove Contacts:** Edit or remove selected contacts using a modal dialog.
- **Customizable UI:** Supports custom styles, icons, and placeholder texts.
- **Integration:** Designed for use with Lowdefy blocks and event methods.

## Usage

### Lowdefy YAML Example

Below is a recommended way to configure the `ContactSelector` block in a Lowdefy YAML file, focusing on the required requests, events, and main properties:

```yaml
id: contact_selector_example
block:
  type: ContactSelector
  requests:
    # Used to search contacts in the database
    - _ref:
        path: ../shared/contacts/requests/contacts_selector_search_contacts.yaml
    # Fetches a contact to populate the form
    - _ref:
        path: ../shared/contacts/requests/get_contact.yaml
    # Fetches all contact options and selected contacts for the list
    - _ref:
        path: ../shared/contacts/requests/get_contacts_data.yaml
  events:
    onOpen:
      # This example request fires when the new/edit contact modal opens
      - id: get_companies
        type: Request
        params: get_companies
    onEditContact:
      # Fires on submit of the edit form
      - id: update_contact
        type: CallAPI
        params:
          endpointId: contacts-update-contact
          payload:
            contact:
              _state: contact_selector_example_contact
            verified: true
    onAddContact:
      # Fires when a new contact is submitted
      - id: create_contact
        type: CallAPI
        params:
          endpointId: contacts-add-contact
          payload:
            contact:
              _state: contact_selector_example_contact
            global_company_id:
              _global: global_company_id
            verified: true
      - id: append_contact
        type: CallMethod
        params:
          blockId: contact_selector_example
          method: appendContact
          args:
            - contact:
                _state: contact_selector_example_contact
              contactId:
                _actions: create_contact.response.response.contact_id
  properties:
    allowNewContacts: true
    allowEdit: true
    allowDelete: true
    title: Select Contact
    placeholder: Select a contact...
    label: {}
    max: 5
    # Add additional properties as needed for your use case
```

### Key Properties

Below is a description of each field under the `properties` key, including the `list` field and its subfields:

| Property                   | Description                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **allowNewContacts**       | Enables the ability to add new contacts directly from the selector. If set to `true`, users will see an option to add a new contact if their search does not match existing contacts. |
| **allowEdit**              | Enables editing of selected contacts. If `true`, an edit button will appear for each contact in the list, opening the edit modal.                                                     |
| **allowDelete**            | Enables removal of contacts from the selected list. If `true`, a delete/remove button will appear for each contact.                                                                   |
| **title**                  | The title displayed above the contact selector input. This helps users understand what the selector is for (e.g., "Select Contact").                                                  |
| **placeholder**            | The placeholder text shown when no contact is selected. Useful for guiding users (e.g., "Select a contact...").                                                                       |
| **label**                  | An object to customize the label for the selector input (e.g., formatting, style, additional text).                                                                                   |
| **max**                    | The maximum number of contacts that can be selected at once. If omitted, there is no upper limit.                                                                                     |
| **optionsLoading**         | A boolean or expression indicating whether the options dropdown should show a loading state (e.g., while fetching contacts).                                                          |
| **options**                | The array of contact options to display in the selector. Typically, this is built from the results of the contact search request and any extra options you want to provide.           |
| **list**                   | Configuration for how selected contacts are displayed in the list below the selector.                                                                                                 |
| **list.title**             | The title displayed above the list of selected contacts (e.g., "Contact details").                                                                                                    |
| **list.placeholder**       | The text shown in the list area when no contact is selected (e.g., "No Contacts Selected").                                                                                           |
| **list.item**              | Configuration for each list item (i.e., each selected contact).                                                                                                                       |
| **list.item.title**        | The title for each contact in the list (e.g., contact name).                                                                                                                          |
| **list.item.description**  | The description for each contact in the list (e.g., email or phone).                                                                                                                  |
| **data**                   | Must be a direct reference to the `get_contacts_data` request. This field provides the block with all available contact details and the selected contacts to render in the list.      |
| **verified**               | Boolean indicating whether newly created or edited contacts should be marked as verified. If `true`, the block will treat these contacts as verified.                                 |
| **searchContactsRequest**  | The name of the request used to search for contacts. This must match the request defined in the `requests` array and is required for the block to perform searches.                   |
| **getContactRequest**      | The name of the request used to fetch a single contact for editing. This must match the request defined in the `requests` array and is required for editing functionality.            |
| **getContactsDataRequest** | The name of the request used to fetch all contacts' data for the list. This must match the request defined in the `requests` array and is required for rendering the contact list.    |

**Notes:**

- The `data` field must always point directly to the result of the `get_contacts_data` request.
- The `verified` field ensures that contacts created or edited through this block are marked as verified according to your business logic.
- The three request fields (`searchContactsRequest`, `getContactRequest`, `getContactsDataRequest`) are required for the block to function correctly, as they tell the block which requests to call for searching, editing, and listing contacts.

- `options`: Array of contacts to select from.
- `allowNewContacts`: Enable adding new contacts from the selector.
- `allowEdit`: Enable editing of selected contacts.
- `allowDelete`: Enable removal of selected contacts.
- `title`, `placeholder`, `size`, etc.: UI customization options.

### Events & Methods

Below are the main events and methods triggered by the ContactSelector block and its hooks. These are invoked via `methods.triggerEvent` and can be listened to or extended in your Lowdefy configuration:

| Event Name      | When It Is Triggered                                                      | Purpose / Effect                                                                                  |
| --------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `onOpen`        | When the new contact or edit contact modal is opened (via `toggleModal`). | Allows you to run logic or requests when the modal opens, e.g. fetch related data.                |
| `onClose`       | When the contact modal is closed (via `toggleModal`).                     | Allows you to run logic or cleanup when the modal closes.                                         |
| `onChange`      | When the selected contacts change (add or remove contact).                | Notifies listeners that the selection has changed so you can update state, trigger requests, etc. |
| `onEditContact` | When the user submits the edit contact form in the modal.                 | Used to trigger backend updates or validation on contact edit.                                    |
| `onAddContact`  | When the user submits the new contact form in the modal.                  | Used to trigger backend creation or validation on contact add.                                    |
| `onCancel`      | When the user cancels (closes) the modal dialog.                          | Allows you to handle cleanup or rollback logic on cancel.                                         |
| `onBlur`        | When the selector input loses focus.                                      | Allows you to run logic when the selector is blurred.                                             |
| `onFocus`       | When the selector input gains focus.                                      | Allows you to run logic when the selector is focused.                                             |
| `onClear`       | When the selector input is cleared.                                       | Allows you to run logic when the selector is cleared.                                             |

**Notes:**

- These events are triggered from various places in the block, including modal open/close, selector input actions, and contact add/edit/remove.
- You can use these events in your Lowdefy configuration to trigger requests, update state, or run custom logic as needed.
