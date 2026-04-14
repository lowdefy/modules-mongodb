import React, { useMemo } from "react";
import { renderHtml, withBlockDefaults } from "@lowdefy/block-utils";
import { Descriptions } from "antd";
import withTheme from "@lowdefy/blocks-antd/blocks/withTheme.js";
import processData from "./processData.js";
import processFields from "./processFields.js";
import renderValue from "./renderValue.js";
import "./style.module.css";

const SmartDescriptions = ({
  blockId,
  classNames = {},
  content,
  properties,
  components: { Icon },
  methods,
  styles = {},
}) => {
  const { data, fields } = properties;

  const items = useMemo(() => {
    if (!data) return [];
    return fields ? processFields(data, fields) : processData(data);
  }, [data, fields]);

  if (!items.length) {
    return <div id={blockId}>No data to display</div>;
  }

  const title = properties.title
    ? renderHtml({ html: properties.title, methods })
    : null;

  const extra = content.extra ? content.extra() : undefined;

  const descProps = {
    bordered: properties.bordered ?? true,
    colon: properties.colon,
    column: properties.column ?? 2,
    layout: properties.layout,
    size: properties.size,
    className: classNames.element,
    classNames: { content: classNames.content, label: classNames.label },
    style: styles.element,
    styles: { content: styles.content, label: styles.label },
  };

  return (
    <div id={blockId}>
      <Descriptions {...descProps} title={title} extra={extra}>
        {items.map((item, i) => (
          <Descriptions.Item
            key={i}
            label={item.label}
            span={item.fullWidth ? "filled" : 1}
          >
            {renderValue(item, Icon, methods, properties)}
          </Descriptions.Item>
        ))}
      </Descriptions>
    </div>
  );
};

export default withTheme(
  "SmartDescriptions",
  withBlockDefaults(SmartDescriptions),
);
