import React, { useMemo } from "react";
import { renderHtml, withBlockDefaults } from "@lowdefy/block-utils";
import { Card, Descriptions } from "antd";
import withTheme from "@lowdefy/blocks-antd/blocks/withTheme.js";
import preprocessData from "./preprocessing/preprocessData.js";
import renderFieldValue from "./core/renderFieldValue.js";
import "./style.module.css";

const DataDescriptions = ({
  blockId,
  classNames = {},
  content,
  properties,
  components: { Icon },
  methods,
  styles = {},
}) => {
  const { data, formConfig } = properties;

  const groups = useMemo(() => {
    return preprocessData(data, formConfig);
  }, [data, formConfig]);

  if (!groups?.length) {
    return <div id={blockId}>No data to display</div>;
  }

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

  // Render a group's fields as a <Descriptions> block
  function renderDescriptions(group, title, extra) {
    return (
      <Descriptions
        {...descProps}
        title={renderHtml({ html: title, methods })}
        extra={extra}
      >
        {group.fields.map((field, j) => (
          <Descriptions.Item
            key={j}
            label={field.label}
            span={field.fullWidth ? "filled" : 1}
          >
            {renderFieldValue(field, Icon, methods, properties)}
          </Descriptions.Item>
        ))}
      </Descriptions>
    );
  }

  // Recursively render a group and its children.
  // Top-level groups (depth 0) render as bare Descriptions.
  // Nested groups (depth 1+) render as Card type="inner" wrapping Descriptions.
  function renderGroup(group, depth, index, extra) {
    const title = group.title || null;
    const hasFields = group.fields?.length > 0;
    const hasChildren = group.children?.length > 0;

    if (depth === 0) {
      return (
        <React.Fragment key={`${depth}-${index}`}>
          {hasFields && renderDescriptions(group, title, extra)}
          {!hasFields && title && (
            <Descriptions
              {...descProps}
              title={renderHtml({ html: title, methods })}
              extra={extra}
            />
          )}
          {hasChildren &&
            group.children.map((child, i) => renderGroup(child, 1, i))}
        </React.Fragment>
      );
    }

    return (
      <Card type="inner" title={title} key={`${depth}-${index}`} size="small">
        {hasFields && renderDescriptions(group, null)}
        {hasChildren &&
          group.children.map((child, i) => renderGroup(child, depth + 1, i))}
      </Card>
    );
  }

  return (
    <div id={blockId}>
      {groups.map((group, i) =>
        renderGroup(
          group,
          0,
          i,
          i === 0 && content.extra ? content.extra() : undefined,
        ),
      )}
    </div>
  );
};

export default withTheme(
  "DataDescriptions",
  withBlockDefaults(DataDescriptions),
);
