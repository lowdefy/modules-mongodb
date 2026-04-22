import { type } from "@lowdefy/helpers";

function createGetContactsData({
  statePrefix,
  methods,
  value,
  properties: { getContactsDataRequest, options },
}) {
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
      {
        id: "__setContactsData",
        type: "SetState",
        params: {
          [statePrefix()]: {
            "_array.filter": [
              { _request: getContactsDataRequest },
              {
                _function: {
                  "__array.includes": [
                    { __event: "selectedContactIds" },
                    { __args: "0.contact_id" },
                  ],
                },
              },
            ],
          },
        },
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
