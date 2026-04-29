function createResetContact({ statePrefix, methods }) {
  methods.registerEvent({
    name: "__resetContact",
    actions: [
      {
        id: "__setContactNull",
        type: "SetState",
        params: { [statePrefix("contact")]: null },
      },
    ],
  });

  function resetContact() {
    methods.triggerEvent({
      name: "__resetContact",
    });
  }

  return resetContact;
}

export default createResetContact;
