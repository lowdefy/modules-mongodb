export default {
  valueType: "array",
  category: "input-container",
  icons: ["AiOutlineUser", "AiOutlineDelete", "AiOutlineEdit"],
  events: {
    onOpen: "Triggered when the contact modal is opened.",
    onClose: "Triggered when the contact modal is closed.",
    onChange: "Triggered when the selected contacts change.",
    onEditContact: "Triggered on submit of the edit contact form.",
    onAddContact: "Triggered on submit of the add contact form.",
    onCancel: "Triggered when the contact modal is cancelled.",
    onBlur: "Triggered when the selector input loses focus.",
    onFocus: "Triggered when the selector input gains focus.",
    onClear: "Triggered when the selector input is cleared.",
    afterSearch: {
      description: "Triggered after a search query is issued.",
      event: {
        value: "The search text.",
      },
    },
    afterClose: "Triggered after the modal transition finishes closing.",
  },
};
