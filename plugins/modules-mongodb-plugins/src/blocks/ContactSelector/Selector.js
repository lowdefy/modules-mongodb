import React, { useState, useEffect, useRef, useCallback } from "react";

import { Select } from "antd";
import { get, type } from "@lowdefy/helpers";
import { renderHtml } from "@lowdefy/block-utils";

import getUniqueValues from "./getUniqueValues.js";

const Option = Select.Option;

const Selector = ({
  blockId,
  classNames = {},
  components: { Icon },
  events,
  loading,
  methods,
  properties,
  styles = {},
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
  const [options, setOptions] = useState([]);
  const [value, setValue] = useState([]);
  const [searchText, setSearchText] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOptions(getUniqueValues(properties.options || []));
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
    <div
      className={classNames.element}
      style={{ width: "100%", ...styles.element }}
    >
      <div id={`${blockId}_${elementId}_popup`} />
      <Select
        id={`${blockId}_input`}
        variant={
          properties.bordered === false ? "borderless" : properties.variant
        }
        style={{ width: "100%" }}
        mode="multiple"
        autoFocus={properties.autoFocus}
        open={open}
        getPopupContainer={() =>
          document.getElementById(`${blockId}_${elementId}_popup`)
        }
        disabled={
          properties.disabled ||
          (properties.max && selectedContacts.length >= properties.max)
        }
        placeholder={get(properties, "placeholder", {
          default: "Select item",
        })}
        status={validation?.status}
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
            const val = options[newVal]?.value;
            addContact(val);
            methods.triggerEvent({ name: "onChange" });
          }
          setSearchText(null);
          setValue([]);
        }}
        onDropdownVisibleChange={(visible) => {
          setOpen(visible);
        }}
        onBlur={() => {
          setOpen(false);
          setSearchText(null);
          methods.triggerEvent({ name: "onBlur" });
        }}
        onFocus={() => {
          setOpen(true);
          methods.triggerEvent({ name: "onFocus" });
        }}
        onClear={() => {
          methods.triggerEvent({ name: "onClear" });
        }}
        onSearch={async (value) => {
          setSearchText(value);
          setFetch(true);
          setOpen(true);
          debouncedSearchContacts(value);
          await methods.triggerEvent({
            name: "afterSearch",
            event: { value },
          });
        }}
      >
        {options.map((opt, i) =>
          type.isObject(opt) ? (
            <Option
              className={
                contactSelected(opt.value)
                  ? "ant-select-item-option-selected"
                  : undefined
              }
              style={opt.style}
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
          <Option
            id={`${blockId}_new_contact`}
            value={"new_contact"}
          >
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
