import React, { useEffect, useState } from "react";
import { blockDefaultProps } from "@lowdefy/block-utils";
import { Label } from "@lowdefy/blocks-antd/blocks";

import Selector from "./Selector.js";
import ContactList from "./ContactList.js";
import ContactModal from "./ContactModal.js";

import useContactManager from "./hooks/useContactManager.js";
import useModal from "./hooks/useModal.js";
import useContactActions from "./hooks/useContactActions.js";

const ContactSelector = ({
  blockId,
  components,
  content,
  events,
  loading,
  methods,
  properties,
  required,
  validation,
  value,
}) => {
  const contactActions = useContactActions({
    blockId,
    methods,
    properties,
    value,
  });
  const modal = useModal({ methods, contactActions });
  const contactManager = useContactManager({ methods, modal, value });

  const [contactsData, setContactsData] = useState([]);

  useEffect(() => {
    contactActions.searchContacts(null);

    methods.registerMethod("appendContact", (args) => {
      if (!args) return;
      const { contact, contactId } = args;
      contactActions.appendContact(contact, contactId);
    });
  }, []);

  useEffect(() => {
    contactActions.getContactsData();
  }, [JSON.stringify(properties.options), JSON.stringify(value)]);

  useEffect(() => {
    if (!properties.data) return;
    setContactsData(properties.data);
  }, [JSON.stringify(properties.data)]);

  return (
    <Label
      blockId={blockId}
      components={components}
      events={events}
      properties={{
        title: properties.title,
        size: properties.size,
        ...properties.label,
      }}
      validation={validation}
      required={required}
      content={{
        content: () => (
          <div>
            <Selector
              blockId={`${blockId}_selector`}
              components={components}
              events={events}
              loading={properties.optionsLoading}
              methods={methods}
              properties={properties}
              required={required}
              validation={validation}
              value={value}
              contactManager={contactManager}
              contactActions={contactActions}
            />
            <ContactList
              components={components}
              loading={loading}
              methods={methods}
              properties={properties.list}
              contactManager={contactManager}
              contactsData={contactsData}
              allowEdit={properties.allowEdit ?? true}
              allowDelete={properties.allowDelete ?? true}
            />
            <ContactModal
              blockId={`${blockId}_modal`}
              content={content}
              events={events}
              methods={methods}
              properties={properties.modal}
              modal={modal}
              contactManager={contactManager}
              contactActions={contactActions}
              options={properties.options}
            />
          </div>
        ),
      }}
    />
  );
};

ContactSelector.defaultProps = blockDefaultProps;
ContactSelector.meta = {
  valueType: "array",
  category: "input-container",
  icons: [...Label.meta.icons, "AiOutlineDelete", "AiOutlineEdit"],
  styles: ["blocks/ContactSelector/style.less"],
};

export default ContactSelector;
