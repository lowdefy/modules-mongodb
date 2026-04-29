function createSetNewContact({ statePrefix, methods }) {
  methods.registerEvent({
    name: "__setNewContact",
    actions: [
      {
        id: "__setContact",
        type: "SetState",
        params: {
          [statePrefix("edit")]: false,
          [statePrefix("contact")]: { _event: "contact" },
        },
      },
    ],
  });

  function setNewContact(contact) {
    const spaceIndex = contact.indexOf(" ");
    const firstName =
      spaceIndex === -1 ? contact : contact.slice(0, spaceIndex);
    const lastName =
      spaceIndex === -1 ? undefined : contact.slice(spaceIndex + 1);
    methods.triggerEvent({
      name: "__setNewContact",
      event: {
        contact: { profile: { given_name: firstName, family_name: lastName } },
      },
    });
  }

  return setNewContact;
}

export default createSetNewContact;
