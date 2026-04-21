import { useState } from "react";

const useModal = ({ methods, contactActions }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [edit, setEdit] = useState(false);
  const { setNewContact, setEditContact, resetContact } = contactActions;

  const setOpen = async (contact, edit) => {
    setEdit(!!edit);
    setIsOpen(true);
    if (edit) await setEditContact(contact);
    else setNewContact(contact);

    methods.triggerEvent({ name: "onOpen" });
  };

  const setClosed = () => {
    setIsOpen(false);
    setEdit(false);

    resetContact();
    methods.triggerEvent({ name: "onClose" });
  };

  const toggleModal = async (contact, edit) => {
    if (isOpen) setClosed();
    else await setOpen(contact, edit);
  };
  return { edit, isOpen, toggleModal };
};

export default useModal;
