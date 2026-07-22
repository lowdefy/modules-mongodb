import React from "react";
import { Tooltip } from "antd";
import { cn, renderHtml } from "@lowdefy/block-utils";

import { statusConfig } from "./helpers.js";

const ActionCard = ({
  action,
  actionStatusConfig,
  activeActionId,
  disableTooltip,
  events,
  methods,
  classNames,
  styles,
  components: { Link },
}) => {
  const cfg = statusConfig(actionStatusConfig, action.status);
  const linkDisabled = action?.link?.disabled || !action?.link;
  const notRequired = action.status === "not-required";
  const blocked = action.status === "blocked";
  const isActive = activeActionId != null && action._id === activeActionId;
  const messageHtml = renderHtml({
    html: notRequired ? `<strike>${action?.message}</strike>` : action?.message,
    methods,
  });
  const dot = (
    <span className="wp-button-dot" style={{ background: cfg.titleColor }} />
  );
  const style = {
    background: cfg.color,
    borderColor: cfg.borderColor,
    color: cfg.titleColor,
    ...styles.button,
  };
  const className = cn(
    "wp-button",
    linkDisabled && "wp-button-disabled",
    isActive && "wp-button-active",
    classNames.button,
  );
  // Actionable buttons tooltip the link's verb label ("Complete"/"View"); a
  // link-less status (not-required) has no verb, so fall back to the status
  // name ("Not Required"). Blocked keeps its own prerequisites hint.
  const tooltip = blocked
    ? `${cfg.title ?? "Blocked"} — awaiting prerequisites`
    : (action?.link?.title ?? cfg.title);

  const fireEvent = events.onActionClick !== undefined && !linkDisabled;

  let inner;
  if (linkDisabled) {
    inner = (
      <span className={className} style={style}>
        {dot}
        {messageHtml}
      </span>
    );
  } else if (fireEvent) {
    inner = (
      <a
        className={className}
        style={style}
        href=""
        onClick={(e) => {
          e.preventDefault();
          methods.triggerEvent({ name: "onActionClick", event: { action } });
        }}
      >
        {dot}
        {messageHtml}
      </a>
    );
  } else {
    inner = (
      <Link
        className={className}
        style={style}
        pageId={action?.link?.pageId}
        urlQuery={action?.link?.urlQuery}
        input={action?.link?.input}
        newTab={action?.link?.newTab ?? false}
      >
        {dot}
        {messageHtml}
      </Link>
    );
  }

  return tooltip && !disableTooltip ? (
    <Tooltip title={tooltip}>{inner}</Tooltip>
  ) : (
    inner
  );
};

export default ActionCard;
