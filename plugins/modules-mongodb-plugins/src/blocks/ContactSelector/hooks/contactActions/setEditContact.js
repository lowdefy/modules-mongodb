function createSetEditContact({
  statePrefix,
  methods,
  properties: { getContactRequest },
}) {
  methods.registerEvent({
    name: "__setEditContact",
    actions: [
      {
        id: "__setContactId",
        type: "SetState",
        params: {
          [statePrefix("contact_id")]: { _event: "contact_id" },
        },
      },
      {
        id: "__fetchContact",
        type: "Request",
        params: getContactRequest,
      },
      {
        id: "__setContact",
        type: "SetState",
        params: {
          [statePrefix("edit")]: true,
          [statePrefix("contact")]: { _request: getContactRequest },
        },
      },
    ],
  });

  // Returns the setEditContact function
  return async function setEditContact(contact) {
    if (!getContactRequest) return;
    await methods.triggerEvent({
      name: "__setEditContact",
      event: { contact_id: contact.contact_id },
    });
  };
}

export default createSetEditContact;
