import React, { useEffect, useState } from "react";
import { ConfigProvider, theme } from "antd";
import { cn, withBlockDefaults } from "@lowdefy/block-utils";
import withTheme from "@lowdefy/blocks-antd/blocks/withTheme.js";
import { type } from "@lowdefy/helpers";

import WorkflowSection from "./WorkflowSection.js";
import { isTerminalWorkflow, wfKey } from "./helpers.js";
import "./style.module.css";

const WorkflowProgress = ({
  blockId,
  classNames = {},
  components,
  events = {},
  methods,
  properties,
  styles = {},
}) => {
  const {
    actionStatusConfig = {},
    activeActionId,
    workflows = [],
    defaultActiveKeys,
    activeKeys,
    disableTooltip = false,
    workflowOverviewPageId,
  } = properties;
  const { token } = theme.useToken();

  // Controlled mode: `activeKeys` (workflow_type slugs) drives expansion directly.
  const controlled = type.isArray(activeKeys);

  // Uncontrolled expand state, keyed by workflow_type. Undefined ⇒ not yet
  // toggled, so the row seeds from `defaultActiveKeys` when provided, else from
  // terminal-ness (all actions terminal ⇒ collapsed). Seeded at render, not on
  // mount, because `workflows` arrives async after the get-entity-workflows call.
  const [expanded, setExpanded] = useState({});

  const seedOpen = (wf) =>
    type.isArray(defaultActiveKeys)
      ? defaultActiveKeys.includes(wfKey(wf))
      : !isTerminalWorkflow(wf);

  const isOpen = (wf) => {
    const key = wfKey(wf);
    if (controlled) return activeKeys.includes(key);
    return expanded[key] === undefined ? seedOpen(wf) : expanded[key];
  };

  // Expose imperative expansion control: CallMethod setActiveKeys([types]).
  // No-op visually while controlled (the page owns `activeKeys` then).
  useEffect(() => {
    methods.registerMethod("setActiveKeys", (keys) => {
      const list = type.isArray(keys) ? keys : [];
      setExpanded(() => {
        const next = {};
        workflows.forEach((wf) => {
          next[wfKey(wf)] = list.includes(wfKey(wf));
        });
        return next;
      });
    });
  });

  return (
    <ConfigProvider theme={{ token: { colorPrimary: token.colorPrimary } }}>
      <div
        id={blockId}
        className={cn("wp", classNames.element)}
        style={styles.element}
      >
        {workflows.map((workflow, wfIdx) => {
          const key = wfKey(workflow);
          const open = isOpen(workflow);
          const toggle = () => {
            const nextOpen = !open;
            if (!controlled) {
              setExpanded((prev) => ({ ...prev, [key]: nextOpen }));
            }
            // Full list of open workflow_types after this toggle (deduped).
            const openKeys = [
              ...new Set(
                workflows
                  .filter((w) => (wfKey(w) === key ? nextOpen : isOpen(w)))
                  .map(wfKey),
              ),
            ];
            methods.triggerEvent({
              name: "onChange",
              event: {
                activeKeys: openKeys,
                workflowType: key,
                open: nextOpen,
              },
            });
          };
          return (
            <WorkflowSection
              key={workflow._id ?? wfIdx}
              workflow={workflow}
              wfIdx={wfIdx}
              open={open}
              onToggle={toggle}
              blockId={blockId}
              actionStatusConfig={actionStatusConfig}
              activeActionId={activeActionId}
              disableTooltip={disableTooltip}
              workflowOverviewPageId={workflowOverviewPageId}
              events={events}
              methods={methods}
              classNames={classNames}
              styles={styles}
              components={components}
            />
          );
        })}
      </div>
    </ConfigProvider>
  );
};

export default withTheme("Steps", withBlockDefaults(WorkflowProgress));
