import React from "react";
import { cn } from "@lowdefy/block-utils";
import { type } from "@lowdefy/helpers";

// Terminal statuses — a workflow whose every action is terminal starts collapsed.
export const TERMINAL = ["done", "not-required"];

// Resolve a status' display config from the shared `action_statuses` enum
// (passed via `actionStatusConfig`). Same source `ActionSteps` reads:
// `color`/`borderColor` are the button fill/border, `titleColor` the text,
// `title` the human label used in tooltips.
export const statusConfig = (actionStatusConfig, status) =>
  actionStatusConfig?.[status] ?? {};

// Rolled-up group status, mirroring ActionSteps.setActionGroupStatus — used only
// to strike through a group whose actions are all not-required.
export const groupStatus = (actions) => {
  if (!type.isArray(actions)) return undefined;
  const statuses = actions.map((a) => a.status);
  if (statuses.every((s) => s === "not-required")) return "not-required";
  return undefined;
};

// Completion shape for a set of actions. The pool excludes `not-required`
// (waived) actions, matching the design's `done / pool` rule; `completed`
// mirrors the engine's auto-completion (total === done + not-required,
// total > 0). `percent` is a 0–100 integer over the pool.
export const progressFromActions = (actions = []) => {
  const total = actions.length;
  const done = actions.filter((a) => a.status === "done").length;
  const notRequired = actions.filter((a) => a.status === "not-required").length;
  const pool = total - notRequired;
  const completed = total > 0 && done + notRequired === total;
  const percent =
    pool > 0 ? Math.round((done / pool) * 100) : completed ? 100 : 0;
  return { total, done, notRequired, pool, percent, completed };
};

// Same shape rolled up across all of a workflow's actions.
export const workflowProgress = (workflow) =>
  progressFromActions((workflow.groups ?? []).flatMap((g) => g.actions ?? []));

export const isTerminalWorkflow = (workflow) =>
  (workflow.groups ?? [])
    .flatMap((g) => g.actions ?? [])
    .every((a) => TERMINAL.includes(a.status));

// Collapse identity is the stable `workflow_type` slug (falls back to `_id`),
// so page config can key expansion off a type it knows ahead of the per-run _id.
export const wfKey = (wf) => wf.workflow_type ?? wf._id;

export const Caret = ({ open }) => (
  <span
    className={cn("wp-caret", !open && "wp-caret-closed")}
    aria-hidden="true"
  >
    ▾
  </span>
);
