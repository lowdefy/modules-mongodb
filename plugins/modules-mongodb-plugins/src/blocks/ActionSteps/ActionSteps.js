import React, { Fragment } from "react";
import { Badge, Steps, Typography } from "antd";
import { cn, renderHtml, withBlockDefaults } from "@lowdefy/block-utils";
import withTheme from "@lowdefy/blocks-antd/blocks/withTheme.js";
import { type } from "@lowdefy/helpers";

const actionStepStatusMap = {
  blocked: "wait",
  "action-required": "process",
  "in-progress": "process",
  done: "finish",
  error: "error",
  "not-required": "wait",
  "in-review": "wait",
  "changes-required": "error",
};

const actionStatusColorMap = {
  blocked: "var(--ant-color-text-disabled)",
  "action-required": "var(--ant-color-primary)",
  "in-progress": "var(--ant-color-info)",
  done: "var(--ant-color-success)",
  error: "var(--ant-color-error)",
  "not-required": "var(--ant-color-text-secondary)",
  "in-review": "var(--ant-purple-6, #722ed1)",
  "changes-required": "var(--ant-color-warning)",
};

const setActionGroupStatus = (actions) => {
  if (!type.isArray(actions)) {
    throw new Error(`actions should be an array. Received ${actions}`);
  }
  const actionsStatuses = actions.map((action) => action.status);
  if (actionsStatuses.includes("error")) return "error";

  if (
    actionsStatuses.includes("in-progress") ||
    (actionsStatuses.includes("done") &&
      !actionsStatuses.every((status) =>
        ["done", "not-required"].includes(status),
      ))
  )
    return "in-progress";

  if (actionsStatuses.includes("action-required")) return "action-required";
  if (actionsStatuses.every((status) => status === "not-required"))
    return "not-required";
  if (
    actionsStatuses.every((status) =>
      ["blocked", "not-required"].includes(status),
    )
  )
    return "blocked";

  if (
    actionsStatuses.every((status) => ["done", "not-required"].includes(status))
  )
    return "done";
};

const setActionGroupIcon = ({ actionGroupStatus, item, actionGroupConfig }) => {
  const color = actionStatusColorMap[actionGroupStatus];
  const name =
    actionGroupStatus === "done"
      ? "AiOutlineCheckCircle"
      : actionGroupConfig[item.action_group]?.icon;
  return { name, color };
};

const ActionSteps = ({
  blockId,
  classNames = {},
  components: { Icon, Link },
  methods,
  properties,
  styles = {},
}) => {
  const { actionGroupConfig = {}, items = [] } = properties;
  return (
    <div id={blockId} className={cn(classNames.element)} style={styles.element}>
      {properties.title && (
        <Typography.Title
          level={5}
          className={cn(classNames.title)}
          style={styles.title}
        >
          {properties.title}
        </Typography.Title>
      )}
      <Steps
        progressDot={properties.progressDot ?? false}
        direction={properties.direction ?? "vertical"}
        className={cn(classNames.steps)}
        style={styles.steps}
        items={[...items]
          .sort(
            (a, b) =>
              actionGroupConfig[a.action_group]?.order -
              actionGroupConfig[b.action_group]?.order,
          )
          .map((item, itemIdx) => {
            const actionGroupStatus = setActionGroupStatus(item.actions);
            const groupConfig = actionGroupConfig[item.action_group] ?? {};
            const groupTitle = groupConfig.title;
            const groupLink = groupConfig.link;
            const groupLinkDisabled = groupLink?.disabled || !groupLink;
            const titleHtml = renderHtml({
              html:
                actionGroupStatus === "not-required"
                  ? `<strike>${groupTitle}</strike>`
                  : groupTitle,
              methods,
            });
            return {
              title: groupLinkDisabled ? (
                titleHtml
              ) : (
                <Link
                  id={`${blockId}_group_link_${itemIdx}`}
                  className={cn(classNames.groupLink)}
                  style={styles.groupLink}
                  pageId={groupLink?.pageId}
                  urlQuery={groupLink?.urlQuery}
                  input={groupLink?.input}
                  newTab={groupLink?.newTab ?? false}
                >
                  {titleHtml}
                </Link>
              ),
              status: actionStepStatusMap[actionGroupStatus],
              icon: (
                <Icon
                  blockId={`${blockId}_icon_${itemIdx}`}
                  properties={setActionGroupIcon({
                    actionGroupStatus,
                    item,
                    actionGroupConfig,
                  })}
                />
              ),
              description:
                actionGroupStatus === "not-required"
                  ? undefined
                  : item.actions.map((action, actionIdx) => {
                      const linkDisabled =
                        action?.link?.disabled || !action?.link;
                      const secondaryText = ["blocked", "not-required"].includes(
                        action.status,
                      );
                      return (
                        <Fragment key={action.id ?? actionIdx}>
                          <Badge
                            className={cn("action-steps-badge", classNames.badge)}
                            style={styles.badge}
                            color={actionStatusColorMap[action.status]}
                            status={
                              action.status === "in-progress"
                                ? "processing"
                                : "default"
                            }
                            text={
                              <Link
                                id={`${blockId}_link_${itemIdx}_${actionIdx}`}
                                className={cn(
                                  secondaryText && "action-steps-link-secondary",
                                  linkDisabled && "action-steps-link-disabled",
                                  classNames.link,
                                )}
                                style={styles.link}
                                disabled={linkDisabled}
                                pageId={action?.link?.pageId}
                                urlQuery={action?.link?.urlQuery}
                                input={action?.link?.input}
                                newTab={action?.link?.newTab ?? false}
                              >
                                {renderHtml({
                                  html:
                                    action.status === "not-required"
                                      ? `<strike>${action?.message}</strike>`
                                      : action?.message,
                                  methods,
                                })}
                              </Link>
                            }
                          />
                        </Fragment>
                      );
                    }),
            };
          })}
      />
    </div>
  );
};

export default withTheme("Steps", withBlockDefaults(ActionSteps));
