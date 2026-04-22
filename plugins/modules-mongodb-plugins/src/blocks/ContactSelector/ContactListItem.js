import React, { useEffect, useState } from "react";
import { Avatar, Button, Space, theme } from "antd";
import { renderHtml } from "@lowdefy/block-utils";

import parseNunjucks from "./parseNunjucks.js";

const ContactListItem = ({
  className,
  style,
  components: { Icon },
  contact,
  methods,
  properties,
  removeContact,
  editContact,
  allowEdit,
  allowDelete,
  isLast,
}) => {
  const { token } = theme.useToken();
  const [title, setTitle] = useState("Contact Name");
  const [description, setDescription] = useState("");

  useEffect(() => {
    let parsedTitle = null;
    let parsedDescription = null;

    try {
      parsedTitle = parseNunjucks(properties?.title, contact);
    } catch (error) {
      console.error("Error parsing title template:", error);
    }
    try {
      parsedDescription = parseNunjucks(properties?.description, contact);
    } catch (error) {
      console.error("Error parsing description template:", error);
    }
    setTitle(parsedTitle ?? contact.name);
    setDescription(parsedDescription ?? contact.email ?? "");
  }, [properties?.description, properties?.title, JSON.stringify(contact)]);

  const showActions = allowEdit || allowDelete;

  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderBottom: isLast
          ? "none"
          : `1px solid ${token.colorBorderSecondary}`,
        ...style,
      }}
    >
      <Avatar
        size="small"
        src={contact.picture}
        alt={`User avatar for ${contact.name ?? contact.email}`}
      >
        {(contact.name ?? contact.email ?? "?").charAt(0).toUpperCase()}
      </Avatar>
      <div style={{ flex: 1, minWidth: 0 }}>
        {renderHtml({ div: true, html: title, methods })}
        <div
          style={{
            color: token.colorTextSecondary,
            fontSize: token.fontSizeSM,
          }}
        >
          {renderHtml({ div: true, html: description, methods })}
        </div>
      </div>
      {showActions && (
        <Space size={4} style={{ width: 88, justifyContent: "flex-end" }}>
          {allowEdit && (
            <Button
              size="small"
              type="default"
              icon={
                <Icon properties={{ name: "AiOutlineEdit" }} />
              }
              onClick={() => editContact(contact)}
            />
          )}
          {allowDelete && (
            <Button
              size="small"
              type="default"
              danger
              icon={
                <Icon properties={{ name: "AiOutlineDelete" }} />
              }
              onClick={() => removeContact(contact)}
            />
          )}
        </Space>
      )}
    </div>
  );
};

export default ContactListItem;
