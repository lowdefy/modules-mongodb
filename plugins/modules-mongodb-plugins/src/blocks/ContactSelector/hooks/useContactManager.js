import { useEffect, useState } from "react";

const useContactManager = ({ methods, modal: { toggleModal }, value }) => {
  const [selectedContacts, setSelectedContacts] = useState([]);

  useEffect(() => {
    if (value && Array.isArray(value)) {
      setSelectedContacts(value);
    } else {
      setSelectedContacts([]);
    }
  }, [JSON.stringify(value)]);

  const contactSelected = (contact) => {
    return selectedContacts.find(
      (selected) => selected.contact_id === contact.contact_id,
    );
  };

  const createNewContact = (name) => {
    toggleModal(name, false);
  };

  const editContact = (contact) => {
    toggleModal(contact, true);
  };

  const addContact = (contact) => {
    if (contactSelected(contact)) return;

    const contacts = [contact, ...selectedContacts];
    setSelectedContacts(contacts);
    methods.setValue(contacts);
    methods.triggerEvent({ name: "onChange" });
  };

  const removeContact = (contact) => {
    const contacts = selectedContacts.filter(
      (selected) => selected.contact_id !== contact.contact_id,
    );
    setSelectedContacts(contacts);
    methods.setValue(contacts);
    methods.triggerEvent({ name: "onChange" });
  };

  return {
    selectedContacts,
    contactSelected,
    editContact,
    createNewContact,
    addContact,
    removeContact,
  };
};

export default useContactManager;
