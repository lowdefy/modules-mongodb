import { type } from "@lowdefy/helpers";

function createAppendContact({ blockId, methods, properties: { verified } }) {
  methods.registerEvent({
    name: "__appendContact",
    actions: [
      {
        id: "__setContactsData",
        type: "SetState",
        params: {
          [blockId]: {
            "_array.concat": [
              [{ _event: "contact" }],
              {
                "_array.filter": [
                  { _if_none: [{ _state: blockId }, []] },
                  {
                    _function: {
                      __ne: [
                        { __args: "0.contact_id" },
                        { __event: "contact.contact_id" },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    ],
  });

  return function appendContact(contact, contactId) {
    if (!type.isObject(contact)) throw new Error("Contact must be an object");
    const newContact = {
      contact_id: contactId,
      name: `${contact.profile?.given_name} ${contact.profile?.family_name}`,
      email: contact?.email,
      verified: !!verified,
    };
    methods.triggerEvent({
      name: "__appendContact",
      event: {
        contact: newContact,
      },
    });
  };
}

export default createAppendContact;
