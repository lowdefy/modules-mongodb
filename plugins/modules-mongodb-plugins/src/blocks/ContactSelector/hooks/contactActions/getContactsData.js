import { type } from "@lowdefy/helpers";

function createGetContactsData({
  statePrefix,
  methods,
  value,
  properties: { getContactsDataRequest, options },
}) {
  // Enrichment only fires the request; display flows through properties.data
  // → contactsData → ContactList.getContactData(). A prior iteration wrote
  // the filtered response back to the block's value state key, but that
  // races with concurrent addContact() calls — a second click firing while
  // the first enrichment request is in flight would overwrite the value
  // with the older response's filtered set, clearing recent selections.
  // Leave value management to useContactManager.addContact/removeContact.
  methods.registerEvent({
    name: "__getContactsData",
    actions: [
      {
        id: "__setFetchContacts",
        type: "SetState",
        params: {
          [statePrefix("fetch_contacts")]: { _event: "contactIds" },
        },
      },
      {
        id: "__getContactsData",
        type: "Request",
        params: getContactsDataRequest,
      },
    ],
  });

  // Returns the getContactsData function
  return async function getContactsData() {
    if (!getContactsDataRequest) return;
    const selectedContacts = type.isArray(value)
      ? value.map((contact) => contact.contact_id)
      : [];
    const dropdownOptions = type.isArray(options)
      ? options.map((opt) => opt?.value?.contact_id)
      : [];
    await methods.triggerEvent({
      name: "__getContactsData",
      event: {
        contactIds: [...selectedContacts, ...dropdownOptions],
        selectedContactIds: selectedContacts,
      },
    });
  };
}

export default createGetContactsData;
