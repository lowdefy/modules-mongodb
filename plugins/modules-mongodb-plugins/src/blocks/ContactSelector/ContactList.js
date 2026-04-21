import React from "react";
import { Skeleton } from "antd";
import { type } from "@lowdefy/helpers";

import ContactListItem from "./ContactListItem.js";

const ContactList = ({
  components,
  loading,
  methods,
  properties,
  contactManager: { selectedContacts, editContact, removeContact },
  allowEdit,
  allowDelete,
  contactsData,
}) => {
  const getContactData = (contact) => {
    if (!type.isArray(contactsData)) return contact;

    const contactData = contactsData.find(
      (cData) => cData.contact_id === contact.contact_id,
    );

    return contactData || contact;
  };

  return loading ? (
    <div className="contact-selector-list" style={{ padding: 12 }}>
      <Skeleton active paragraph={{ rows: 3 }} title={false} />
    </div>
  ) : (
    <div className="contact-selector-list">
      <div
        className="contact-selector-scroll"
        style={selectedContacts?.length ? { padding: "0px 12px" } : {}}
      >
        <table className="contact-selector-table">
          {selectedContacts?.length > 0 && (
            <thead className="secondary">
              <tr>
                <th style={{ padding: 8, textAlign: "left", width: "75%" }}>
                  {properties?.title ?? "Details"}
                </th>
                {allowEdit && <th>Edit</th>}
                {allowDelete && <th>Remove</th>}
              </tr>
            </thead>
          )}
          <tbody>
            {selectedContacts?.length > 0 &&
              selectedContacts.map((contact, index) => (
                <ContactListItem
                  key={index}
                  components={components}
                  contact={getContactData(contact)}
                  editContact={editContact}
                  removeContact={removeContact}
                  methods={methods}
                  properties={properties?.item}
                  allowEdit={allowEdit}
                  allowDelete={allowDelete}
                />
              ))}
            {selectedContacts?.length === 0 && (
              <tr className="secondary" style={{ textAlign: "center" }}>
                <td>{properties?.placeholder ?? "No contacts selected"}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ContactList;
