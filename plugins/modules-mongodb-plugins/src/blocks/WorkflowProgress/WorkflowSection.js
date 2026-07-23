import React from "react";
import { Progress, Tooltip, Typography } from "antd";
import { cn } from "@lowdefy/block-utils";

import ActionCard from "./ActionCard.js";
import {
  Caret,
  groupStatus,
  progressFromActions,
  workflowProgress,
} from "./helpers.js";

const ActionGroup = ({
  group,
  gIdx,
  blockId,
  wfIdx,
  actionStatusConfig,
  activeActionId,
  disableTooltip,
  events,
  methods,
  classNames,
  styles,
  components,
}) => {
  const struck = groupStatus(group.actions) === "not-required";
  const { Icon, Link } = components;
  const gp = progressFromActions(group.actions);
  const groupLink = group.link?.disabled ? null : group.link;
  const label = (
    <span className={cn("wp-section-label", struck && "wp-struck")}>
      {group.title}
    </span>
  );
  return (
    <div
      className={cn("wp-section", classNames.section)}
      style={styles.section}
    >
      {group.title && (
        <div
          className={cn("wp-section-title", classNames.sectionTitle)}
          style={styles.sectionTitle}
        >
          {group.icon && (
            <Icon
              blockId={`${blockId}_grp_icon_${wfIdx}_${gIdx}`}
              properties={{ name: group.icon, size: 13 }}
            />
          )}
          {groupLink ? (
            <Link
              className="wp-section-link"
              pageId={groupLink.pageId}
              urlQuery={groupLink.urlQuery}
              input={groupLink.input}
              newTab={groupLink.newTab ?? false}
            >
              {label}
            </Link>
          ) : (
            label
          )}
          {gp.total > 0 && (
            <span className="wp-section-fraction">
              {gp.done}/{gp.pool}
            </span>
          )}
          <span className="wp-section-bar">
            <span
              className="wp-section-bar-fill"
              style={{ width: `${gp.percent}%` }}
            />
          </span>
        </div>
      )}
      <div className="wp-actions">
        {(group.actions ?? []).map((action, aIdx) => (
          <ActionCard
            key={action._id ?? aIdx}
            action={action}
            actionStatusConfig={actionStatusConfig}
            activeActionId={activeActionId}
            disableTooltip={disableTooltip}
            events={events}
            methods={methods}
            classNames={classNames}
            styles={styles}
            components={components}
          />
        ))}
      </div>
    </div>
  );
};

const WorkflowSection = ({
  workflow,
  wfIdx,
  open,
  onToggle,
  blockId,
  actionStatusConfig,
  activeActionId,
  disableTooltip,
  workflowOverviewPageId,
  events,
  methods,
  classNames,
  styles,
  components,
}) => {
  const groups = [...(workflow.groups ?? [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  const { Icon, Link } = components;

  const { total, done, pool, percent, completed } = workflowProgress(workflow);

  return (
    <div className={cn("wp-workflow", !open && "wp-collapsed")}>
      <div
        className={cn("wp-workflow-row", classNames.workflowRow)}
        style={styles.workflowRow}
        onClick={onToggle}
      >
        <Progress
          type="circle"
          percent={completed ? 100 : percent}
          status={completed ? "success" : "normal"}
          size={32}
          strokeWidth={8}
          format={completed ? undefined : (p) => `${p}%`}
          className="wp-workflow-progress"
        />
        <Typography.Text strong className="wp-workflow-title">
          {workflow.title}
        </Typography.Text>
        {workflowOverviewPageId && workflow._id && (
          // stopPropagation so the link navigates without toggling the row.
          <span
            className="wp-workflow-link"
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip title="Workflow Overview">
              <Link
                pageId={workflowOverviewPageId}
                urlQuery={{ workflow_id: workflow._id }}
              >
                <Icon
                  blockId={`${blockId}_wf_overview_${wfIdx}`}
                  properties={{ name: "LuWorkflow", size: 18 }}
                />
              </Link>
            </Tooltip>
          </span>
        )}
        {completed && <span className="wp-workflow-tag">Completed</span>}
        <span className="wp-workflow-meta">
          {total > 0 && (
            <span className="wp-workflow-fraction">
              {done}/{pool}
            </span>
          )}
        </span>
        <Caret open={open} />
      </div>

      {open && (
        <div className="wp-sections">
          {groups.map((group, gIdx) => (
            <ActionGroup
              key={group.id ?? gIdx}
              group={group}
              gIdx={gIdx}
              blockId={blockId}
              wfIdx={wfIdx}
              actionStatusConfig={actionStatusConfig}
              activeActionId={activeActionId}
              disableTooltip={disableTooltip}
              events={events}
              methods={methods}
              classNames={classNames}
              styles={styles}
              components={components}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkflowSection;
