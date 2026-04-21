import React, { useState, useEffect, useRef, useCallback } from "react";

import { Select } from "antd";
import { get, type } from "@lowdefy/helpers";
import { renderHtml } from "@lowdefy/block-utils";

import getUniqueValues from "./utils/getUniqueValues.js";

const Option = Select.Option;

const Selector = ({
  blockId,
  components: { Icon },
  events,
  loading,
  methods,
  properties,
  validation,
  contactManager: {
    addContact,
    contactSelected,
    selectedContacts,
    createNewContact,
  },
  contactActions: { searchContacts },
}) => {
  const [fetchState, setFetch] = useState(false);
  const [elementId] = useState((0 | (Math.random() * 9e2)) + 1e2);
  const [uniqueValueOptions, setUniqueValueOptions] = useState([]);
  const [value, setValue] = useState([]);
  const [searchText, setSearchText] = useState(null);

  useEffect(() => {
    const options = getUniqueValues(properties.options || []);
    setUniqueValueOptions(options);
  }, [JSON.stringify(properties.options)]);

  const debounceTimer = useRef(null);
  const debouncedSearchContacts = useCallback(
    (value) => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      debounceTimer.current = setTimeout(() => {
        (async () => {
          await searchContacts(value);
          setFetch(false);
        })();
      }, 500);
    },
    [JSON.stringify(searchContacts)],
  );

  return (
    <div style={{ width: "100%" }}>
      <div id={`${blockId}_${elementId}_popup`} />
      <Select
        bordered={properties.bordered}
        style={{ width: "100%" }}
        mode="multiple"
        autoFocus={properties.autoFocus}
        getPopupContainer={() =>
          document.getElementById(`${blockId}_${elementId}_popup`)
        }
        disabled={
          properties.disabled ||
          loading ||
          (properties.max && selectedContacts.length >= properties.max)
        }
        placeholder={get(properties, "placeholder", { default: "Select item" })}
        status={validation.status}
        value={value}
        suffixIcon={
          properties.suffixIcon && (
            <Icon
              blockId={`${blockId}_suffixIcon`}
              events={events}
              properties={properties.suffixIcon}
            />
          )
        }
        showArrow={true}
        allowClear={false}
        showSearch={get(properties, "showSearch", { default: true })}
        size={properties.size}
        filterOption={(input, option) =>
          (option.filterstring || option.children.props.html || "")
            .toLowerCase()
            .indexOf(input.toLowerCase()) >= 0
        }
        notFoundContent={
          fetchState
            ? "Fetching Contacts..."
            : properties.notFoundContent || "Not found"
        }
        onChange={(newVal) => {
          if (newVal[0] === "new_contact") {
            createNewContact(searchText);
          } else {
            const val = uniqueValueOptions[newVal]?.value;
            addContact(val);
            methods.triggerEvent({ name: "onChange" });
          }
          setSearchText(null);
          setValue([]);
        }}
        onBlur={() => {
          setSearchText(null);
          methods.triggerEvent({ name: "onBlur" });
        }}
        onFocus={() => {
          methods.triggerEvent({ name: "onFocus" });
        }}
        onClear={() => {
          methods.triggerEvent({ name: "onClear" });
        }}
        onSearch={async (value) => {
          setSearchText(value);
          setFetch(true);
          debouncedSearchContacts(value);
          await methods.triggerEvent({ name: "afterSearch", event: { value } });
        }}
      >
        {uniqueValueOptions.map((opt, i) =>
          type.isObject(opt) ? (
            <Option
              className={
                contactSelected(opt.value)
                  ? "ant-select-item-option-selected"
                  : ""
              }
              disabled={opt.disabled}
              filterstring={opt.filterString}
              id={`${blockId}_${i}`}
              key={i}
              value={`${i}`}
            >
              {type.isNone(opt.label)
                ? renderHtml({ html: `${opt.value}`, methods })
                : renderHtml({ html: opt.label, methods })}
            </Option>
          ) : null,
        )}
        {searchText && properties.allowNewContacts && (
          <Option id={`${blockId}_new_contact`} value={"new_contact"}>
            {renderHtml({
              html: `<div class="secondary" style="border-top: 1px solid #808080; padding: 8px"> Add <b>${searchText}</b> as new contact</div>`,
              methods,
            })}
          </Option>
        )}
      </Select>
    </div>
  );
};

export default Selector;
