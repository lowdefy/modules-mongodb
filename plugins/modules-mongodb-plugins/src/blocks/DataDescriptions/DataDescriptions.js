import React, { useMemo } from "react";
import { renderHtml, withBlockDefaults } from "@lowdefy/block-utils";
import { Card, Collapse, Descriptions } from "antd";
import withTheme from "@lowdefy/blocks-antd/blocks/withTheme.js";
import preprocessData from "./preprocessing/preprocessData.js";
import renderFieldValue from "./core/renderFieldValue.js";
import computeDescriptionSpans from "../shared/computeDescriptionSpans.js";
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
    const spans = computeDescriptionSpans(group.fields, descProps.column);
    return (
      <Descriptions
        {...descProps}
        title={renderHtml({ html: title, methods })}
        extra={extra}
      >
        {group.fields.map((field, j) => (
          <Descriptions.Item key={j} label={field.label} span={spans[j]}>
            {renderFieldValue(field, Icon, methods, properties)}
          </Descriptions.Item>
        ))}
      </Descriptions>
    );
  }

  // Recursively render a group and its children.
  // Top-level groups (depth 0) render as bare Descriptions.
  // Nested named sections render as Card type="inner". A list group (all
  // children are array elements) renders as a tinted card holding one
  // collapsible card panel per element.
  function renderGroup(group, depth, index, extra) {
    const title = group.title || null;
    const hasFields = group.fields?.length > 0;
    const hasChildren = group.children?.length > 0;
    const isList = hasChildren && group.children.every((c) => c.isListItem);

    if (isList) {
      return (
        <Card
          type="inner"
          title={
            <span className="dataview-list-title">
              {title}
              <span className="dataview-list-count">
                {group.children.length}
              </span>
            </span>
          }
          key={`${depth}-${index}`}
          size="small"
          className="dataview-section-card dataview-list-card"
        >
          {hasFields && renderDescriptions(group, null)}
          <Collapse
            className="dataview-list-collapse"
            bordered={false}
            defaultActiveKey={group.children.map((_, i) => i)}
            items={group.children.map((item, i) => ({
              key: i,
              label: item.title || `Item ${i + 1}`,
              children: (
                <div className="dataview-list-panel">
                  {item.fields?.length > 0 && renderDescriptions(item, null)}
                  {item.children?.length > 0 &&
                    item.children.map((child, j) =>
                      renderGroup(child, depth + 2, j),
                    )}
                </div>
              ),
            }))}
          />
        </Card>
      );
    }

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
      <Card
        type="inner"
        title={title}
        key={`${depth}-${index}`}
        size="small"
        className="dataview-section-card"
      >
        {hasFields && renderDescriptions(group, null)}
        {hasChildren &&
          group.children.map((child, i) => renderGroup(child, depth + 1, i))}
      </Card>
    );
  }

  return (
    <div id={blockId} className="dataview-groups">
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
