import React, { useMemo } from "react";
import { renderHtml, withBlockDefaults } from "@lowdefy/block-utils";
import { Descriptions } from "antd";
import withTheme from "@lowdefy/blocks-antd/blocks/withTheme.js";
import processData from "./processData.js";
import processFields from "./processFields.js";
import renderValue from "./renderValue.js";
import computeDescriptionSpans from "../shared/computeDescriptionSpans.js";
import "./style.css";

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

  // Empty state — keep rendering the header (title / extra) so the
  // section stays visible when no fields resolve.
  if (!items.length) {
    return (
      <div id={blockId}>
        <Descriptions
          {...descProps}
          bordered={false}
          title={title}
          extra={extra}
        >
          <Descriptions.Item span="filled">
            <span className="dataview-value dataview-value-null">
              No data to display
            </span>
          </Descriptions.Item>
        </Descriptions>
      </div>
    );
  }

  const spans = computeDescriptionSpans(items, descProps.column);

  return (
    <div id={blockId}>
      <Descriptions {...descProps} title={title} extra={extra}>
        {items.map((item, i) => (
          <Descriptions.Item key={i} label={item.label} span={spans[i]}>
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
