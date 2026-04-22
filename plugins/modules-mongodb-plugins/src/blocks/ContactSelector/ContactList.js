import React from "react";
import { Skeleton, theme } from "antd";
import { type } from "@lowdefy/helpers";

import ContactListItem from "./ContactListItem.js";

const ContactList = ({
  classNames = {},
  styles = {},
  components,
  loading,
  methods,
  properties,
  contactManager: { selectedContacts, editContact, removeContact },
  allowEdit,
  allowDelete,
  contactsData,
}) => {
  const { token } = theme.useToken();

  const getContactData = (contact) => {
    if (!type.isArray(contactsData)) return contact;
    const contactData = contactsData.find(
      (cData) => cData.contact_id === contact.contact_id,
    );
    return contactData || contact;
  };

  const containerStyle = {
    marginTop: 8,
    border: `1px solid ${token.colorBorder}`,
    borderRadius: token.borderRadius,
    overflow: "hidden",
    ...styles.element,
  };

  if (loading) {
    return (
      <div className={classNames.element} style={containerStyle}>
        <div style={{ padding: 12 }}>
          <Skeleton active paragraph={{ rows: 3 }} />
        </div>
      </div>
    );
  }

  const hasItems = selectedContacts?.length > 0;
  const showActionsHeader = hasItems && (allowEdit || allowDelete);

  return (
    <div className={classNames.element} style={containerStyle}>
      {hasItems && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "8px 12px",
            fontWeight: 500,
            color: token.colorTextSecondary,
            background: token.colorFillQuaternary,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <span style={{ flex: 1 }}>
            {properties?.title ?? "Details"}
          </span>
          {showActionsHeader && (
            <span style={{ width: 88, textAlign: "center" }}>Actions</span>
          )}
        </div>
      )}

      {!hasItems && (
        <div
          style={{
            padding: "16px 12px",
            textAlign: "center",
            color: token.colorTextTertiary,
          }}
        >
          {properties?.placeholder ?? "No contacts selected"}
        </div>
      )}

      {hasItems && (
        <div style={{ maxHeight: 265, overflowY: "auto" }}>
          {selectedContacts.map((contact, index) => (
            <ContactListItem
              key={contact.contact_id ?? index}
              className={classNames.item}
              style={styles.item}
              components={components}
              contact={getContactData(contact)}
              editContact={editContact}
              removeContact={removeContact}
              methods={methods}
              properties={properties?.item}
              allowEdit={allowEdit}
              allowDelete={allowDelete}
              isLast={index === selectedContacts.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ContactList;
