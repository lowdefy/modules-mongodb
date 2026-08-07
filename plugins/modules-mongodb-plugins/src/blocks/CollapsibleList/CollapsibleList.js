import React, { useEffect, useState } from "react";
import { get, type } from "@lowdefy/helpers";
import { cn, renderHtml, withBlockDefaults } from "@lowdefy/block-utils";
import { nunjucksString } from "@lowdefy/nunjucks";
import { Button, Card, Collapse } from "antd";
import withTheme from "@lowdefy/blocks-antd/blocks/withTheme.js";
import "./style.module.css";

// A list block (category "list", valueType "array") that renders each row's
// sub-form inside an antd Collapse panel. Collapse state is React-managed, so
// nothing extra is written to form state — the row array persists exactly like
// any other action form. Rows use `forceRender` so their inputs stay mounted:
// Lowdefy validates and retains them regardless of the panel's open state
// (validation + state pruning are engine-level, not tied to the DOM).
//
// With `deferCollapse`, a user's attempt to collapse a row does NOT close it
// immediately — the block fires `onCollapse` and leaves the panel open, so
// config can validate the row FIRST and only close it (via the collapseItem
// method) when it passes. The field wrapper uses this for validate-before-
// collapse, so there is no collapse-then-reopen flicker.
const CollapsibleList = ({
  blockId,
  classNames = {},
  components: { Icon },
  events,
  list,
  methods,
  properties,
  styles = {},
  value = [],
}) => {
  const [activeKeys, setActiveKeys] = useState(() =>
    properties.defaultExpandAll ? list.map((_, i) => String(i)) : [],
  );

  useEffect(() => {
    // Engine-provided array mutations, re-exposed to config `CallMethod`.
    methods.registerMethod("moveItemDown", methods.moveItemDown);
    methods.registerMethod("moveItemUp", methods.moveItemUp);
    methods.registerMethod("pushItem", methods.pushItem);
    methods.registerMethod("removeItem", methods.removeItem);
    methods.registerMethod("unshiftItem", methods.unshiftItem);
    // Collapse controls — functional updates so the closure never goes stale.
    methods.registerMethod("expandItem", (index) =>
      setActiveKeys((prev) => Array.from(new Set([...prev, String(index)]))),
    );
    methods.registerMethod("collapseItem", (index) =>
      setActiveKeys((prev) => prev.filter((k) => k !== String(index))),
    );
    methods.registerMethod("expandAll", () =>
      setActiveKeys((value ?? []).map((_, i) => String(i))),
    );
    methods.registerMethod("collapseAll", () => setActiveKeys([]));
    methods.registerMethod("setActiveKeys", (keys) =>
      setActiveKeys((keys ?? []).map(String)),
    );
  });

  // Seed up to minItems, matching ControlledList.
  if (list.length < (properties.minItems ?? 0)) {
    for (let i = 0; i < (properties.minItems ?? 0) - list.length; i++) {
      methods.pushItem({});
    }
  }

  const summaryHtml = (index) => {
    if (properties.itemTitle) {
      const row = value[index];
      const context = type.isObject(row)
        ? { ...row, _index: index }
        : { value: row, _index: index };
      const rendered = nunjucksString(properties.itemTitle, context);
      if (type.isString(rendered) && rendered.trim() !== "") return rendered;
    }
    return `Item ${index + 1}`;
  };

  const addItem = () => {
    const index = value.length;
    methods.pushItem();
    setActiveKeys((prev) => [...prev, String(index)]);
    methods.triggerEvent({ name: "onAdd", event: { index, item: undefined } });
  };

  const removeItemAt = (index) => {
    const item = value[index];
    methods.removeItem(index);
    // Removing shifts every later row down one; remap the open keys to match.
    setActiveKeys((prev) =>
      prev
        .filter((k) => Number(k) !== index)
        .map((k) => (Number(k) > index ? String(Number(k) - 1) : k)),
    );
    methods.triggerEvent({ name: "onRemove", event: { index, item } });
  };

  const fireExpand = (k) =>
    methods.triggerEvent({
      name: "onExpand",
      event: { index: Number(k), item: value[Number(k)] },
    });
  const fireCollapse = (k) =>
    methods.triggerEvent({
      name: "onCollapse",
      event: { index: Number(k), item: value[Number(k)] },
    });

  const handleChange = (keys) => {
    const next = (Array.isArray(keys) ? keys : keys == null ? [] : [keys]).map(
      String,
    );
    const opened = next.filter((k) => !activeKeys.includes(k));
    const closed = activeKeys.filter((k) => !next.includes(k));
    if (properties.deferCollapse) {
      // Apply opens now; leave closes open and just request them, so config can
      // validate first and close via collapseItem only when the row is valid.
      if (opened.length) {
        setActiveKeys((prev) => Array.from(new Set([...prev, ...opened])));
        opened.forEach(fireExpand);
      }
      closed.forEach(fireCollapse);
      return;
    }
    setActiveKeys(next);
    opened.forEach(fireExpand);
    closed.forEach(fireCollapse);
  };

  const showRemove = (i) =>
    !properties.hideRemoveButton && list.length > (properties.minItems ?? 0);

  const items = list.map((item, i) => ({
    key: String(i),
    forceRender: true,
    label: renderHtml({ html: summaryHtml(i), methods }),
    style: styles.item,
    extra: showRemove(i) ? (
      // stopPropagation so the remove click does not also toggle the panel.
      <span
        className={cn("collapsible-list-remove", classNames.removeIcon)}
        style={styles.removeIcon}
        onClick={(e) => {
          e.stopPropagation();
          removeItemAt(i);
        }}
      >
        <Icon
          blockId={`${blockId}_${i}_remove_icon`}
          events={events}
          properties={{
            name: "AiOutlineDelete",
            ...properties.removeItemIcon,
          }}
        />
      </span>
    ) : null,
    children: item.content && item.content({ width: "100%" }),
  }));

  return (
    <Card
      id={blockId}
      className={cn("collapsible-list-card", classNames.element)}
      style={styles.element}
      title={
        properties.title ? (
          <span className={cn("collapsible-list-title", classNames.header)}>
            {renderHtml({ html: properties.title, methods })}
          </span>
        ) : null
      }
    >
      <Collapse
        className="collapsible-list-collapse"
        bordered={false}
        accordion={properties.accordion}
        activeKey={activeKeys}
        onChange={handleChange}
        size={properties.size}
        items={items}
      />
      {!properties.hideAddButton && (
        <Button
          block
          type="dashed"
          size={properties.size}
          style={{ marginTop: 12 }}
          onClick={addItem}
          icon={
            <Icon
              blockId={`${blockId}_add_icon`}
              events={events}
              properties={{ name: "AiOutlinePlus" }}
            />
          }
          {...properties.addItemButton}
        >
          {get(properties, "addItemButton.title") ?? "Add"}
        </Button>
      )}
    </Card>
  );
};

export default withTheme("CollapsibleList", withBlockDefaults(CollapsibleList));
