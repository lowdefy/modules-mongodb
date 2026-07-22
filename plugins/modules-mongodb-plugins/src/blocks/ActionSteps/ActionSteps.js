import React from "react";
import { Badge, ConfigProvider, Steps, Typography, theme } from "antd";
import { cn, renderHtml, withBlockDefaults } from "@lowdefy/block-utils";
import withTheme from "@lowdefy/blocks-antd/blocks/withTheme.js";
import { type } from "@lowdefy/helpers";
import "./style.module.css";

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

// Resolve a status' display colour from the shared `action_statuses` enum
// (passed via the `actionStatusConfig` property). Single source of truth —
// see design Part 51 / D3. The enum's `titleColor` is the saturated swatch
// used for badge dots and group icons.
const statusColor = (actionStatusConfig, status) =>
  actionStatusConfig?.[status]?.titleColor;

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

const setActionGroupIcon = ({
  actionGroupStatus,
  item,
  actionGroupConfig,
  actionStatusConfig,
}) => {
  const color = statusColor(actionStatusConfig, actionGroupStatus);
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
  events = {},
  methods,
  properties,
  styles = {},
}) => {
  const {
    actionGroupConfig = {},
    actionStatusConfig = {},
    activeActionId,
    items = [],
  } = properties;
  const { token } = theme.useToken();
  return (
    <div
      id={blockId}
      className={cn("action-steps", classNames.element)}
      style={styles.element}
    >
      {properties.title && (
        <Typography.Title
          level={5}
          className={cn(classNames.title)}
          style={styles.title}
        >
          {properties.title}
        </Typography.Title>
      )}
      {/* antd colours the Steps rail (the connector between steps) from
          colorPrimary for process/finish steps. These steps use our own
          enum-coloured icons and never rely on the app primary, so scope a
          neutral colorPrimary to this Steps instance to keep the connector
          neutral. colorBorder is read live so it tracks the active theme. */}
      <ConfigProvider
        theme={{ components: { Steps: { colorPrimary: token.colorBorder } } }}
      >
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
                      actionStatusConfig,
                    })}
                  />
                ),
                description:
                  actionGroupStatus === "not-required" ? undefined : (
                    // Stack each action on its own row. The column layout lives
                    // on this container (not the per-badge `width: 100%` rule) so
                    // stacking holds even if the stylesheet is absent. These are
                    // plain layout primitives (no theme tokens), so inlining them
                    // does not affect theming or CSS-variable overrides.
                    <div
                      className={cn("action-steps-actions", classNames.actions)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        rowGap: 2,
                        ...styles.actions,
                      }}
                    >
                      {item.actions.map((action, actionIdx) => {
                        const linkDisabled =
                          action?.link?.disabled || !action?.link;
                        const secondaryText = [
                          "blocked",
                          "not-required",
                        ].includes(action.status);
                        const linkClassName = cn(
                          secondaryText && "action-steps-link-secondary",
                          linkDisabled && "action-steps-link-disabled",
                          classNames.link,
                        );
                        const messageHtml = renderHtml({
                          html:
                            action.status === "not-required"
                              ? `<strike>${action?.message}</strike>`
                              : action?.message,
                          methods,
                        });
                        const fireEvent =
                          events.onActionClick !== undefined && !linkDisabled;
                        const isActive =
                          activeActionId != null &&
                          action._id === activeActionId;
                        return (
                          <Badge
                            key={action.id ?? actionIdx}
                            className={cn(
                              "action-steps-badge",
                              isActive && "action-steps-badge-active",
                              classNames.badge,
                            )}
                            style={styles.badge}
                            color={statusColor(
                              actionStatusConfig,
                              action.status,
                            )}
                            status={
                              action.status === "in-progress"
                                ? "processing"
                                : "default"
                            }
                            text={
                              fireEvent ? (
                                <a
                                  id={`${blockId}_link_${itemIdx}_${actionIdx}`}
                                  className={linkClassName}
                                  style={styles.link}
                                  href=""
                                  onClick={(e) => {
                                    e.preventDefault();
                                    methods.triggerEvent({
                                      name: "onActionClick",
                                      event: { action },
                                    });
                                  }}
                                >
                                  {messageHtml}
                                </a>
                              ) : (
                                <Link
                                  id={`${blockId}_link_${itemIdx}_${actionIdx}`}
                                  className={linkClassName}
                                  style={styles.link}
                                  disabled={linkDisabled}
                                  pageId={action?.link?.pageId}
                                  urlQuery={action?.link?.urlQuery}
                                  input={action?.link?.input}
                                  newTab={action?.link?.newTab ?? false}
                                >
                                  {messageHtml}
                                </Link>
                              )
                            }
                          />
                        );
                      })}
                    </div>
                  ),
              };
            })}
        />
      </ConfigProvider>
    </div>
  );
};

export default withTheme("Steps", withBlockDefaults(ActionSteps));
