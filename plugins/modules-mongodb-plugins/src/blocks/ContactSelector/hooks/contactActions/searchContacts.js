function createSearchContacts({
  statePrefix,
  methods,
  properties: { searchContactsRequest },
}) {
  methods.registerEvent({
    name: "__searchContacts",
    actions: [
      {
        id: "__setSearchInput",
        type: "SetState",
        params: {
          [statePrefix("input")]: { _event: "searchText" },
        },
      },
      {
        id: "__searchContactsRequest",
        type: "Request",
        params: searchContactsRequest,
      },
    ],
  });

  return async function searchContacts(searchText) {
    if (!searchContactsRequest) return;
    await methods.triggerEvent({
      name: "__searchContacts",
      event: { searchText },
    });
  };
}

export default createSearchContacts;
