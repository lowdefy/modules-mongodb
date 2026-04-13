import React from "react";
import { type } from "@lowdefy/helpers";
import { S3Download } from "@lowdefy/plugin-aws/blocks";
import { DangerousHtml } from "@lowdefy/blocks-basic/blocks";
import formatValue from "../utils/formatValue.js";

export const fieldTypeRegistry = {
  // null/undefined (highest priority)
  null: {
    priority: 1,
    detect: (value) => type.isNull(value),
    render: () => (
      <span className="dataview-value dataview-value-null">Not set</span>
    ),
    fullWidth: false,
    componentHints: [],
  },

  undefined: {
    priority: 1,
    detect: (value) => type.isUndefined(value),
    render: () => <span className="dataview-value dataview-value-null">-</span>,
    fullWidth: false,
    componentHints: [],
  },

  // special object types (check before generic object)

  richText: {
    priority: 40,
    detect: (value) =>
      value &&
      type.isObject(value) &&
      ("html" in value || "markdown" in value) &&
      "text" in value,
    render: ({ value }) => {
      if (value.html && DangerousHtml) {
        const contentId =
          value.key ?? Math.random().toString(36).substring(2, 11);
        return (
          <div className="dataview-richtext">
            <DangerousHtml
              blockId={`rich-text-data-view-${contentId}`}
              properties={{
                DOMPurifyOptions: {
                  ADD_ATTR: ["target", "rel"],
                },
                html: value.html,
              }}
            />
          </div>
        );
      }
      return <span className="dataview-value-null">No content</span>;
    },
    fullWidth: true,
    componentHints: ["tiptap_input", "html"],
  },

  changeStamp: {
    priority: 40,
    detect: (value) =>
      type.isObject(value) &&
      "timestamp" in value &&
      "user" in value &&
      value.user?.name &&
      value.user?.id,
    render: ({ value, properties }) => {
      const userName = value?.user?.name;
      const userId = value?.user?.id;
      const timestamp = value?.timestamp;

      const date = new Date(timestamp);

      const formattedDate = date.toLocaleString("en-GB", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

      const formattedTime = date.toLocaleString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });

      const contactDetailPageId =
        properties?.contactDetailPageId ?? "contacts/contact-detail";

      return (
        <span className="dataview-value">
          by{" "}
          {userId ? (
            <a
              className="dataview-link"
              href={`/${contactDetailPageId}?_id=${userId}`}
            >
              {userName}
            </a>
          ) : (
            <span>{userName}</span>
          )}{" "}
          on {formattedDate}, at {formattedTime}
        </span>
      );
    },
    fullWidth: false,
    componentHints: ["change_stamp", "timestamp"],
  },

  contact: {
    priority: 40,
    detect: (value) =>
      type.isObject(value) &&
      ("email" in value ||
        "work_phone" in value ||
        "identifier_phone_number" in value) &&
      "contact_id" in value,
    render: ({ value, Icon, properties }) => {
      const displayName = value.name ?? value.email ?? "Contact";
      const contactId = value.contact_id ?? value._id;

      const contactDetailPageId =
        properties?.contactDetailPageId ?? "contacts/contact-detail";

      if (contactId && !properties?.disableCrmLinks) {
        return (
          <span className="dataview-value">
            <a
              className="dataview-link"
              href={`/${contactDetailPageId}?_id=${contactId}`}
            >
              <Icon blockId="contact-icon" properties="AiOutlineUser" />{" "}
              {displayName}
            </a>
          </span>
        );
      }
      return (
        <span className="dataview-value">
          <Icon blockId="contact-icon" properties="AiOutlineUser" />{" "}
          {displayName}
        </span>
      );
    },
    fullWidth: false,
    componentHints: ["contact_selector_number_required"],
  },

  company: {
    priority: 40,
    detect: (value) => type.isObject(value) && "trading_name" in value,
    render: ({ value, Icon, properties }) => {
      const companyId = value.company_id ?? value._id;
      const companyDetailPageId =
        properties?.companyDetailPageId ?? "companies/company-detail";

      if (companyId && !properties?.disableCrmLinks) {
        return (
          <span className="dataview-value">
            <a
              className="dataview-link"
              href={`/${companyDetailPageId}?_id=${companyId}`}
            >
              <Icon blockId="company-icon" properties="AiOutlineCluster" />{" "}
              {value.trading_name}
            </a>
          </span>
        );
      }
      return (
        <span className="dataview-value">
          <Icon blockId="company-icon" properties="AiOutlineCluster" />{" "}
          {value.trading_name}
        </span>
      );
    },
    fullWidth: false,
    componentHints: [],
  },

  fileList: {
    priority: 35, // Check before 'file' (more specific)
    detect: (value) => type.isObject(value) && type.isArray(value.fileList),
    render: ({ value, methods, properties }) => {
      if (
        value.fileList &&
        methods &&
        properties?.s3GetPolicyRequestId &&
        S3Download
      ) {
        return (
          <span className="dataview-value">
            <S3Download
              blockId={`file-downloads`}
              methods={methods}
              properties={{
                fileList: value.fileList,
                s3GetPolicyRequestId: properties.s3GetPolicyRequestId,
              }}
            />
          </span>
        );
      }
      return <span className="dataview-value-null">No files available</span>;
    },
    fullWidth: false,
    componentHints: ["file_upload"],
  },

  file: {
    priority: 40,
    detect: (value) =>
      type.isObject(value) && "key" in value && "bucket" in value,
    render: ({ value, methods, properties }) => {
      if (
        value.bucket &&
        value.key &&
        methods &&
        properties?.s3GetPolicyRequestId &&
        S3Download
      ) {
        return (
          <span className="dataview-value">
            <S3Download
              blockId={`file-download-${value.key}`}
              methods={methods}
              properties={{
                fileList: [value],
                s3GetPolicyRequestId: properties.s3GetPolicyRequestId,
              }}
            />
          </span>
        );
      }
      return <span className="dataview-value-null">No file available</span>;
    },
    fullWidth: false,
    componentHints: ["file_download", "file_upload"],
  },

  location: {
    priority: 40,
    detect: (value) =>
      type.isObject(value) &&
      ("formatted_address" in value ||
        (value.geometry && value.geometry.location)),
    render: ({ value, Icon }) => {
      const address =
        value.formatted_address ??
        `${value.geometry.location.lat}, ${value.geometry.location.lng}`;
      const { lat, lng } = value.geometry.location;
      const coordinates = `${lat},${lng}`;
      const query = encodeURIComponent(coordinates);

      return (
        <span className="dataview-value">
          <a
            className="dataview-link"
            href={`https://maps.google.com/?q=${query}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Icon blockId="location-icon" properties="AiOutlineEnvironment" />{" "}
            {address}
          </a>
        </span>
      );
    },
    fullWidth: true,
    componentHints: ["location"],
  },

  phoneNumber: {
    priority: 40,
    detect: (value) =>
      type.isObject(value) &&
      "phone_number" in value &&
      "region" in value &&
      type.isObject(value.region),
    render: ({ value }) => {
      const phoneNumber = value.phone_number;
      const flag = value.region?.flag;

      if (!phoneNumber || phoneNumber === value.region?.dial_code) {
        return <span className="dataview-value dataview-value-null">Not set</span>;
      }

      return (
        <span className="dataview-value">
          {flag ? `${flag} ` : ""}
          <a className="dataview-link" href={`tel:${phoneNumber}`}>
            {phoneNumber}
          </a>
        </span>
      );
    },
    fullWidth: false,
    componentHints: ["phone_number_input"],
  },

  // string types (check specific before generic)

  longText: {
    priority: 50,
    detect: (value) =>
      type.isString(value) && (value.length > 200 || value.includes("\n")),
    render: ({ value }) => (
      <div className="dataview-value dataview-value-longtext">
        {formatValue(value)}
      </div>
    ),
    fullWidth: true,
    componentHints: ["text_area"],
  },

  selector: {
    priority: 98,
    detect: () => false, // Only detected via componentHints
    render: ({ value }) => {
      // Handle objects (extract displayable value)
      const displayValue = type.isObject(value)
        ? value.name || value.label || value.id || value._id || String(value)
        : String(value);
      return <span className="dataview-tag">{formatValue(displayValue)}</span>;
    },
    renderArray: ({ value }) => (
      <div className="dataview-tags">
        {value.map((item, index) => {
          // Handle objects (extract displayable value)
          const displayValue = type.isObject(item)
            ? item.name || item.label || item.id || item._id || String(item)
            : String(item);
          return (
            <span className="dataview-tag" key={index}>
              {formatValue(displayValue)}
            </span>
          );
        })}
      </div>
    ),
    fullWidth: false,
    componentHints: [
      "selector",
      "radio_selector",
      "enum_selector",
      "device_type_selector",
      "button_selector",
      "multiple_selector",
    ],
  },

  email: {
    priority: 90,
    detect: (value) =>
      type.isString(value) && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value),
    render: ({ value }) => (
      <span className="dataview-value">
        <a className="dataview-link" href={`mailto:${value}`}>
          {value}
        </a>
      </span>
    ),
    fullWidth: false,
    componentHints: [],
  },

  url: {
    priority: 90,
    detect: (value) =>
      type.isString(value) &&
      (value.startsWith("http://") || value.startsWith("https://")),
    render: ({ value }) => (
      <span className="dataview-value">
        <a
          className="dataview-link"
          href={value}
          rel="noopener noreferrer"
          target="_blank"
        >
          {value.length > 50 ? value.substring(0, 50) + "..." : value}
        </a>
      </span>
    ),
    fullWidth: false,
    componentHints: [],
  },

  string: {
    priority: 100,
    detect: (value) => type.isString(value),
    render: ({ value }) => {
      const formattedValue = formatValue(value);
      return <span className="dataview-value">{formattedValue}</span>;
    },
    renderArray: ({ value }) => (
      <div className="dataview-tags">
        {value.map((item, index) => (
          <span className="dataview-tag" key={index}>
            {formatValue(item)}
          </span>
        ))}
      </div>
    ),
    fullWidth: false,
    componentHints: ["text_input", "text_area"],
  },

  // primitive types

  boolean: {
    priority: 100,
    detect: (value) => type.isBoolean(value),
    render: ({ value }) =>
      value ? (
        <span className="dataview-value dataview-value-boolean-true">Yes</span>
      ) : (
        <span className="dataview-value dataview-value-boolean-false">No</span>
      ),
    fullWidth: false,
    componentHints: ["checkbox_switch", "yes_no_selector"],
  },

  number: {
    priority: 100,
    detect: (value) => type.isNumber(value),
    render: ({ value }) => (
      <span className="dataview-value">{value.toLocaleString()}</span>
    ),
    fullWidth: false,
    componentHints: ["number"],
  },

  date: {
    priority: 90,
    detect: (value) => {
      const d = type.isDate(value)
        ? value
        : type.isString(value) &&
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)
          ? new Date(value)
          : null;
      if (!d || Number.isNaN(d.getTime())) return false;
      return (
        d.getUTCHours() === 0 &&
        d.getUTCMinutes() === 0 &&
        d.getUTCSeconds() === 0 &&
        d.getUTCMilliseconds() === 0
      );
    },
    render: ({ value }) => {
      const d = type.isDate(value) ? value : new Date(value);
      return (
        <span className="dataview-value">{d.toLocaleDateString()}</span>
      );
    },
    fullWidth: false,
    componentHints: ["date_selector"],
  },

  datetime: {
    priority: 95,
    detect: (value) => {
      if (type.isDate(value)) return true;
      if (
        type.isString(value) &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)
      ) {
        return !Number.isNaN(new Date(value).getTime());
      }
      return false;
    },
    render: ({ value }) => {
      const d = type.isDate(value) ? value : new Date(value);
      return <span className="dataview-value">{d.toLocaleString()}</span>;
    },
    fullWidth: false,
    componentHints: [],
  },

  dateRange: {
    priority: 95,
    detect: (value) => {
      if (!type.isArray(value) || value.length !== 2) return false;
      return value.every((v) => {
        if (type.isDate(v)) return true;
        if (
          type.isString(v) &&
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)
        ) {
          return !Number.isNaN(new Date(v).getTime());
        }
        return false;
      });
    },
    renderArray: ({ value }) => {
      const d0 = type.isDate(value[0]) ? value[0] : new Date(value[0]);
      const d1 = type.isDate(value[1]) ? value[1] : new Date(value[1]);
      return (
        <div>
          <span className="dataview-value">{d0.toLocaleDateString()}</span>{" "}
          -{" "}
          <span className="dataview-value">{d1.toLocaleDateString()}</span>
        </div>
      );
    },
    fullWidth: false,
    componentHints: ["date_range_selector"],
  },
};
