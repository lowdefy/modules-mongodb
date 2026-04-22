import React, { useEffect, useState } from "react";
import { withBlockDefaults } from "@lowdefy/block-utils";
import { Label } from "@lowdefy/blocks-antd/blocks";

import Selector from "./Selector.js";
import ContactList from "./ContactList.js";
import ContactModal from "./ContactModal.js";

import useContactManager from "./hooks/useContactManager.js";
import useModal from "./hooks/useModal.js";
import useContactActions from "./hooks/useContactActions.js";

const ContactSelector = ({
  blockId,
  classNames = {},
  components,
  content,
  events,
  loading,
  methods,
  properties,
  required,
  styles = {},
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
          <div className={classNames.element} style={styles.element}>
            <Selector
              blockId={`${blockId}_selector`}
              classNames={{ element: classNames.selector }}
              styles={{ element: styles.selector }}
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
              classNames={{
                element: classNames.list,
                item: classNames.listItem,
              }}
              styles={{ element: styles.list, item: styles.listItem }}
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
              classNames={{ element: classNames.modal }}
              styles={{ element: styles.modal }}
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

export default withBlockDefaults(ContactSelector);
