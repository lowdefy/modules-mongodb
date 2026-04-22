import React, { useEffect, useState } from "react";
import { Avatar, Button } from "antd";
import parseNunjucks from "../utils/parseNunjucks.js";
import HtmlComponent from "../utils/HtmlComponent.js";

const ContactListItem = ({
  components: { Icon },
  contact,
  methods,
  properties,
  removeContact,
  editContact,
  allowEdit,
  allowDelete,
}) => {
  const [AVATAR_API_URL] = useState(
    "https://api.dicebear.com/6.x/initials/svg?backgroundType=gradientLinear&scale=75&seed=",
  );
  const [title, setTitle] = useState("Contact Name");
  const [description, setDescription] = useState("");

  useEffect(() => {
    let parsedTitle = null;
    let parsedDescription = null;

    try {
      parsedTitle = parseNunjucks(properties?.title, contact);
    } catch (error) {
      console.error("Error parsing title Nunjucks:", error);
    }
    try {
      parsedDescription = parseNunjucks(properties?.description, contact);
    } catch (error) {
      console.error("Error parsing description Nunjucks:", error);
    }
    setTitle(parsedTitle ?? contact.name);
    setDescription(parsedDescription ?? contact.email ?? "");
  }, [properties.description, properties.title, JSON.stringify(contact)]);

  return (
    <tr className="list-item">
      <td style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar
            id={`contact_avatar_${contact.contact_id ?? contact.email}`}
            alt={`User avatar for ${contact.name ?? contact.email}`}
            size="small"
            src={`${AVATAR_API_URL}${contact.name ?? contact.email}`}
          />
          <div style={{ flex: 1 }}>
            <HtmlComponent
              div={true}
              html={title}
              id="contact_title_html"
              methods={methods}
            />
            <div className="secondary">
              <HtmlComponent
                div={true}
                html={description}
                id="contact_description_html"
                methods={methods}
              />
            </div>
          </div>
        </div>
      </td>
      {allowEdit && (
        <td>
          <Button
            id="edit_button"
            icon={
              <Icon
                blockId="delete_icon"
                properties={{ name: "AiOutlineEdit" }}
              />
            }
            style={{ textAlign: "center" }}
            type="default"
            onClick={() => {
              editContact(contact);
            }}
          />
        </td>
      )}
      {allowDelete && (
        <td>
          <Button
            id="delete_button"
            danger
            icon={
              <Icon
                blockId="delete_icon"
                properties={{ name: "AiOutlineDelete" }}
              />
            }
            style={{ textAlign: "center" }}
            type="default"
            onClick={() => {
              removeContact(contact);
            }}
          />
        </td>
      )}
    </tr>
  );
};

export default ContactListItem;
