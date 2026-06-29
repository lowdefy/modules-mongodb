import {
  HOOK_SIGNALS,
  HOOK_PHASES,
  MIRROR_SIGNALS,
  LIFECYCLE_SIGNALS,
} from "./hookSignals.js";
import { collectTrackerEdges } from "./trackerEdges.js";
import { humanizeSlug } from "./humanizeSlug.js";

// Engine-runtime needs + per-action UI lookups. Build-time-only fields
// (form, form_review, form_error, pages, hooks, event) are excluded —
// they're consumed by build-time resolvers (parts 12, 13, 15) against
// the raw workflow YAML, not via workflowsConfig at runtime.
//
// `status_map` is deliberately NOT picked here (Part 48): it's the blob's one
// heavy per-stage × per-app field, paid for all workflows on every connection
// call. It now arrives per-request via the write endpoints' `render_config`
// and is spliced onto the action config at load time (loadWorkflowState seam,
// task 3). Build-time validation of `status_map` cells (validateStatusMapCells)
// still runs against the raw workflow — the field is validated here even though
// it's no longer carried on the blob.
const ACTION_FIELDS = [
  "type",
  "title",
  "kind",
  "key",
  "tracker",
  "blocked_by",
  "action_group",
  "required_after_close",
  "allow_not_required",
  "access",
  "universal_fields",
];

const WORKFLOW_FIELDS = [
  "type",
  "title",
  "display_order",
  "starting_actions",
  "action_groups",
];

// --- form_meta projection (ported from makeActionFormConfigs.js) ------------
// Walks form arrays and emits { component, key, required, title, validate }
// per node, recursing into structural components. Produces the same shape as
// makeActionFormConfigs so the overview pages' inline submitted-data rendering
// continues to work once they switch to reading from workflowsConfig.

const STRUCTURAL_COMPONENTS = [
  "controlled_list",
  "section",
  "box",
  "label",
  "file_upload",
];

const METADATA_FIELDS = ["component", "key", "required", "title", "validate"];

function pickMetadata(entry) {
  const node = {};
  for (const field of METADATA_FIELDS) {
    if (field in entry) node[field] = entry[field];
  }
  if (!("required" in node)) node.required = false;
  return node;
}

function toMetadataNode(entry) {
  const node = pickMetadata(entry);
  if (entry.component && STRUCTURAL_COMPONENTS.includes(entry.component)) {
    node.form = (entry.form ?? []).map(toMetadataNode);
  }
  return node;
}

function describeForm(formArray) {
  return (formArray ?? []).map(toMetadataNode);
}

const ACTION_KINDS = ["form", "check", "custom", "tracker"];

const ACTION_STATUSES = [
  "not-required",
  "error",
  "changes-required",
  "done",
  "in-review",
  "in-progress",
  "action-required",
  "blocked",
];

// The two legal direct-seed statuses for starting_actions (Part 45 review 2 #2;
// task 17). Creation at workflow start is not an FSM transition, so a seed may
// only land at one of the two non-terminal birth stages.
const LEGAL_SEED_STATUSES = ["action-required", "blocked"];

// Part 34 access verbs. Vocabulary is closed in v1 (Part 34 D4 / per-app block).
const ACCESS_VERBS = ["view", "edit", "review", "error"];

// Part 36: block ids of the template-shipped signal buttons across the four
// form-verb floating-actions bars. An author `pages.{verb}.buttons.extra` entry
// may not reuse one of these — reservation is global (any reserved id is
// rejected on every verb page, not just the page whose bar ships that button),
// so the constant stays a flat list and self-protects when future parts move
// buttons between pages. `button_request_changes` and `button_edit` already
// each appear on two pages (review + view). The same ids are hardcoded as
// `id:` on the Button blocks in the verb templates; for a seven-id set that
// duplication is acceptable (see design Proposed change item 3).
const RESERVED_BUTTON_IDS = [
  "button_submit",
  "button_progress",
  "button_not_required",
  "button_approve",
  "button_request_changes",
  "button_resolve_error",
  "button_edit",
];

// Part 24: the three universal action fields an author may declare for the UI
// presence list. The action doc always physically carries all three; this list
// only controls which the templates render.
const UNIVERSAL_FIELDS = ["assignees", "due_date", "description"];

function pick(source, fields) {
  const picked = {};
  for (const field of fields) {
    if (field in source) picked[field] = source[field];
  }
  return picked;
}

function fail(workflowType, message) {
  throw new Error(
    `makeWorkflowsConfig: workflow "${workflowType}": ${message}`,
  );
}

function validateHooks(workflow, action) {
  if (!action.hooks) return;
  const where = `action "${action.type}"`;
  for (const signal of Object.keys(action.hooks)) {
    if (!HOOK_SIGNALS.includes(signal)) {
      fail(
        workflow.type,
        `${where} hooks key "${signal}" is not a known signal (expected one of: ${HOOK_SIGNALS.join(", ")}).`,
      );
    }
    const phases = action.hooks[signal];
    if (phases === null || typeof phases !== "object") {
      fail(
        workflow.type,
        `${where} hooks.${signal} must be an object with pre/post phase entries (got: ${JSON.stringify(phases)}).`,
      );
    }
    for (const phase of Object.keys(phases)) {
      if (!HOOK_PHASES.includes(phase)) {
        fail(
          workflow.type,
          `${where} hooks.${signal} phase "${phase}" is invalid (expected "pre" or "post").`,
        );
      }
      const value = phases[phase];
      if (typeof value === "string") {
        fail(
          workflow.type,
          `${where} hooks.${signal}.${phase} is a string ("${value}") — the legacy shape pointing at an external Api id. Convert to an inline routine object: { routine: [ ... ] }. See action-authoring/spec.md "Action hooks contract".`,
        );
      }
      if (
        value === null ||
        typeof value !== "object" ||
        !Array.isArray(value.routine)
      ) {
        fail(
          workflow.type,
          `${where} hooks.${signal}.${phase} must be an object with a routine: array (got: ${JSON.stringify(value)}).`,
        );
      }
    }
  }
}

// Part 33 D4: the `display.{app}.description` slot is comment-only — the
// runtime comment is its only writer. Authors override per-app `title`; an
// authored `description` is dead config that would be stripped at merge, so it
// hard-errors at build. `entryWhere` names the offending event entry.
function rejectAuthoredDescription(workflow, entryEntry, entryWhere) {
  const display = entryEntry?.display;
  if (
    display === null ||
    typeof display !== "object" ||
    Array.isArray(display)
  ) {
    return;
  }
  for (const [app, bucket] of Object.entries(display)) {
    if (
      bucket !== null &&
      typeof bucket === "object" &&
      !Array.isArray(bucket) &&
      "description" in bucket
    ) {
      fail(
        workflow.type,
        `${entryWhere} display "${app}" has a "description" — event descriptions are owned by the action comment and cannot be authored; set only "title" here.`,
      );
    }
  }
}

function validateEvent(workflow, action) {
  if (!action.event) return;
  const where = `action "${action.type}"`;
  const isTracker = action.kind === "tracker";
  for (const signal of Object.keys(action.event)) {
    if (
      HOOK_SIGNALS.includes(signal) ||
      (isTracker && MIRROR_SIGNALS.includes(signal))
    ) {
      rejectAuthoredDescription(
        workflow,
        action.event[signal],
        `${where} event "${signal}"`,
      );
      continue;
    }
    if (!isTracker && MIRROR_SIGNALS.includes(signal)) {
      fail(
        workflow.type,
        `${where} event key "${signal}" is a mirror signal and is only valid on kind: tracker actions (allowed for tracker: ${[...HOOK_SIGNALS, ...MIRROR_SIGNALS].join(", ")}; allowed for non-tracker: ${HOOK_SIGNALS.join(", ")}).`,
      );
    }
    fail(
      workflow.type,
      `${where} event key "${signal}" is not a known signal (expected one of: ${HOOK_SIGNALS.join(", ")}${isTracker ? `, ${MIRROR_SIGNALS.join(", ")}` : ""}).`,
    );
  }
}

function validateGroupOnComplete(workflow, group) {
  if (!("on_complete" in group)) return;
  const where = `action_groups "${group.id}"`;
  const value = group.on_complete;
  if (typeof value === "string") {
    fail(
      workflow.type,
      `${where} on_complete is a string ("${value}") — the legacy shape pointing at a YAML path. Convert to an inline routine object: { routine: [ ... ] }. See action-authoring/spec.md "Workflow YAML".`,
    );
  }
  if (
    value === null ||
    typeof value !== "object" ||
    !Array.isArray(value.routine)
  ) {
    fail(
      workflow.type,
      `${where} on_complete must be an object with a routine: array (got: ${JSON.stringify(value)}).`,
    );
  }
}

// Part 34 D4: per-app per-verb access map. `access.{app}` is a verb→gate map
// ({ view|edit|review|error }: true | [roles]). The removed action-wide
// `access.roles`, the shorthand list form (`access.{app}: [verbs]`), the empty
// list `[]`, unknown verb keys, and `notification_roles` under `access` all
// hard-error; an app block declaring edit/review/error without view lint-warns.
function validateActionAccess(workflow, action) {
  if (!action.access) return;
  const where = `action "${action.type}"`;
  const access = action.access;

  if (access === null || typeof access !== "object" || Array.isArray(access)) {
    fail(
      workflow.type,
      `${where} access must be a map of {app_name}: { verb: gate } (got: ${JSON.stringify(access)}).`,
    );
  }

  for (const [appName, block] of Object.entries(access)) {
    if (appName === "roles") {
      fail(
        workflow.type,
        `${where} access.roles (the action-wide role gate) is removed (Part 34 D4). Every gate is per-app per-verb — move it under access.{app}.{verb}.`,
      );
    }
    if (appName === "notification_roles") {
      fail(
        workflow.type,
        `${where} notification_roles lives at the action root, not under access (Part 34 D9).`,
      );
    }
    if (Array.isArray(block)) {
      fail(
        workflow.type,
        `${where} access.${appName} is the removed shorthand list form (Part 34 D1). Use the verb→gate map: access.${appName}.{verb}: true | [roles].`,
      );
    }
    if (block === null || typeof block !== "object") {
      fail(
        workflow.type,
        `${where} access.${appName} must be a verb→gate map object (got: ${JSON.stringify(block)}).`,
      );
    }

    for (const [verb, gate] of Object.entries(block)) {
      if (!ACCESS_VERBS.includes(verb)) {
        fail(
          workflow.type,
          `${where} access.${appName} has unknown verb key "${verb}" (expected one of: ${ACCESS_VERBS.join(", ")}).`,
        );
      }
      if (Array.isArray(gate) && gate.length === 0) {
        fail(
          workflow.type,
          `${where} access.${appName}.${verb} is the empty list [] — invalid. Omit the verb key to deny access instead (Part 34).`,
        );
      }
      const gateOk =
        gate === true ||
        (Array.isArray(gate) && gate.every((r) => typeof r === "string"));
      if (!gateOk) {
        fail(
          workflow.type,
          `${where} access.${appName}.${verb} gate must be true or a non-empty array of role strings (got: ${JSON.stringify(gate)}).`,
        );
      }
    }

    const declaresPrivileged =
      "edit" in block || "review" in block || "error" in block;
    if (!("view" in block) && declaresPrivileged) {
      console.warn(
        `makeWorkflowsConfig: workflow "${workflow.type}": ${where} access.${appName} declares edit/review/error without view — users granted those verbs may be unable to read the action. Add "view" if that's unintended (Part 34 D4).`,
      );
    }
  }
}

// Part 48 D6: tracker.child_workflow_type validation. Every kind: tracker action
// must declare a non-empty string child_workflow_type. Cross-workflow resolution
// (does the value match a declared workflow type?) and cycle detection are
// performed after all per-workflow validation in makeWorkflowsConfig (they
// require the full workflow set). The legacy key tracker.workflow_type
// hard-errors with a rename hint.
function validateTrackerChildWorkflowType(workflow, action) {
  if (action.kind !== "tracker") return;
  const where = `action "${action.type}"`;
  const tracker = action.tracker;

  if ("workflow_type" in tracker) {
    fail(
      workflow.type,
      `${where} tracker.workflow_type is renamed — use tracker.child_workflow_type (Part 48 D6).`,
    );
  }

  if (
    typeof tracker.child_workflow_type !== "string" ||
    tracker.child_workflow_type === ""
  ) {
    fail(
      workflow.type,
      `${where} tracker.child_workflow_type must be a non-empty string (got: ${JSON.stringify(tracker.child_workflow_type)}).`,
    );
  }
}

// Part 44 / Part 28: the engine-link shape, shared by tracker.start_link and
// the custom-kind status_map link:/view_link: cells. An object
// { pageId: string, urlQuery?: object }. Reserved urlQuery keys action_id /
// entity_id are sentinel-only (value must be exactly true); all other keys
// must carry string values (static params, passed through verbatim). Any
// other key at the top level (e.g. title:) hard-errors because the engine-link
// shape only supports pageId / urlQuery.
const ENGINE_LINK_ALLOWED_KEYS = new Set(["pageId", "urlQuery"]);
const ENGINE_LINK_URL_QUERY_SENTINEL_KEYS = new Set(["action_id", "entity_id"]);

// Validate one engine-link object. `label` names the source for error messages
// (e.g. `tracker.start_link`, `status_map.action-required.demo.link`). One
// source of truth for both tracker links and custom cell links (CLAUDE.md "one
// correct way").
function validateEngineLinkShape(workflow, action, link, label) {
  const where = `action "${action.type}"`;

  if (link === null || typeof link !== "object" || Array.isArray(link)) {
    fail(
      workflow.type,
      `${where} ${label} must be a plain object (got: ${JSON.stringify(link)}).`,
    );
  }

  for (const key of Object.keys(link)) {
    if (!ENGINE_LINK_ALLOWED_KEYS.has(key)) {
      fail(
        workflow.type,
        `${where} ${label} has unknown key "${key}" — only pageId and urlQuery are allowed (note: "title" is not part of the engine-link shape).`,
      );
    }
  }

  const { pageId, urlQuery } = link;

  if (typeof pageId !== "string" || pageId === "") {
    fail(
      workflow.type,
      `${where} ${label}.pageId must be a non-empty string (got: ${JSON.stringify(pageId)}).`,
    );
  }

  if (urlQuery !== undefined) {
    if (
      urlQuery === null ||
      typeof urlQuery !== "object" ||
      Array.isArray(urlQuery)
    ) {
      fail(
        workflow.type,
        `${where} ${label}.urlQuery must be a plain object (got: ${JSON.stringify(urlQuery)}).`,
      );
    }

    for (const [key, value] of Object.entries(urlQuery)) {
      if (ENGINE_LINK_URL_QUERY_SENTINEL_KEYS.has(key)) {
        if (value !== true) {
          fail(
            workflow.type,
            `${where} ${label}.urlQuery.${key} is a reserved sentinel key — its value must be exactly true (got: ${JSON.stringify(value)}).`,
          );
        }
      } else {
        if (typeof value !== "string") {
          fail(
            workflow.type,
            `${where} ${label}.urlQuery.${key} must be a string (static param passed through verbatim) (got: ${JSON.stringify(value)}).`,
          );
        }
      }
    }
  }
}

function validateTrackerStartLink(workflow, action) {
  if (!action.tracker?.start_link) return;
  validateEngineLinkShape(
    workflow,
    action,
    action.tracker.start_link,
    "tracker.start_link",
  );
}

// Part 30 D9 / Part 28: status_map cell shape. Each `status_map[stage]` is a
// cell of per-slug `{ message? }` objects plus a reserved `status_title`
// (string|null). Built-in kinds reject `link:`/`view_link:` (engine-managed);
// `kind: custom` accepts `{ message?, link?, view_link? }`, where link/view_link
// are engine-link objects validated against the shared shape.
function validateStatusMapCells(workflow, action) {
  if (!action.status_map) return;
  const where = `action "${action.type}"`;
  const isCustom = action.kind === "custom";

  for (const [stage, cell] of Object.entries(action.status_map)) {
    if (!ACTION_STATUSES.includes(stage)) {
      fail(
        workflow.type,
        `${where} status_map key "${stage}" is not a member of action_statuses.`,
      );
    }
    if (cell === null || typeof cell !== "object" || Array.isArray(cell)) {
      fail(
        workflow.type,
        `${where} status_map.${stage} must be an object of {slug}: { message? } cells (got: ${JSON.stringify(cell)}).`,
      );
    }

    for (const [key, value] of Object.entries(cell)) {
      if (key === "status_title") {
        if (!(value === null || typeof value === "string")) {
          fail(
            workflow.type,
            `${where} status_map.${stage}.status_title must be a string or null (got: ${JSON.stringify(value)}).`,
          );
        }
        continue;
      }
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        fail(
          workflow.type,
          `${where} status_map.${stage}.${key} must be a cell object (got: ${JSON.stringify(value)}).`,
        );
      }
      for (const linkKey of ["link", "view_link"]) {
        if (!(linkKey in value)) continue;
        if (!isCustom) {
          fail(
            workflow.type,
            `${where} status_map.${stage}.${key}: ${linkKey} is engine-managed for kind: ${action.kind}; remove it from status_map.${stage}.${key}. To restrict navigation per slug, edit access.${key} verbs instead.`,
          );
        }
        validateEngineLinkShape(
          workflow,
          action,
          value[linkKey],
          `status_map.${stage}.${key}.${linkKey}`,
        );
      }
      if ("message" in value && typeof value.message !== "string") {
        fail(
          workflow.type,
          `${where} status_map.${stage}.${key}.message must be a string (got: ${JSON.stringify(value.message)}).`,
        );
      }
    }
  }
}

// Part 24: universal_fields is an optional UI presence declaration. Legal
// values: the field omitted; `false`; or an array whose every member is one of
// assignees / due_date / description with no duplicates. Anything else hard-
// errors (a bare `true`, a string, unknown field names, a non-array non-false).
function validateUniversalFields(workflow, action) {
  if (!("universal_fields" in action)) return;
  const where = `action "${action.type}"`;
  const value = action.universal_fields;
  const legal = `omit the key (all three), false / [] (none), or an array drawn from ${UNIVERSAL_FIELDS.join(", ")}`;

  if (value === false) return;

  if (!Array.isArray(value)) {
    fail(
      workflow.type,
      `${where} universal_fields must be ${legal} (got: ${JSON.stringify(value)}).`,
    );
  }

  const seen = new Set();
  for (const field of value) {
    if (!UNIVERSAL_FIELDS.includes(field)) {
      fail(
        workflow.type,
        `${where} universal_fields entry "${field}" is not a universal field — ${legal}.`,
      );
    }
    if (seen.has(field)) {
      fail(
        workflow.type,
        `${where} universal_fields has duplicate entry "${field}" — ${legal}.`,
      );
    }
    seen.add(field);
  }
}

function validateAction(workflow, action) {
  const where = `action "${action.type}"`;

  if (!ACTION_KINDS.includes(action.kind)) {
    fail(
      workflow.type,
      `${where} has unknown kind "${action.kind}" (expected form, check, custom, or tracker).`,
    );
  }

  if (action.kind === "form" && !action.form) {
    fail(workflow.type, `${where} has kind "form" but no form: block.`);
  }
  if (action.kind === "tracker" && !action.tracker) {
    fail(workflow.type, `${where} has kind "tracker" but no tracker: block.`);
  }
  if (
    (action.kind === "check" || action.kind === "custom") &&
    (action.form || action.tracker)
  ) {
    fail(
      workflow.type,
      `${where} has kind "${action.kind}" but defines form: or tracker:.`,
    );
  }
  if (action.form && action.tracker) {
    fail(workflow.type, `${where} cannot define both form: and tracker:.`);
  }

  if (
    "allow_not_required" in action &&
    typeof action.allow_not_required !== "boolean"
  ) {
    fail(
      workflow.type,
      `${where} allow_not_required must be a boolean (got: ${JSON.stringify(action.allow_not_required)}).`,
    );
  }

  if ("title" in action && typeof action.title !== "string") {
    fail(
      workflow.type,
      `${where} title must be a string when present (got: ${JSON.stringify(action.title)}).`,
    );
  }

  validateActionAccess(workflow, action);
  validateUniversalFields(workflow, action);
  validateStatusMapCells(workflow, action);
  validateTrackerChildWorkflowType(workflow, action);
  validateTrackerStartLink(workflow, action);
  validateHooks(workflow, action);
  validateEvent(workflow, action);
  validateButtonsExtra(workflow, action);
}

// Part 36: validate the `pages.{verb}.buttons.extra` author-button slot.
// Form actions: each bar verb (edit / view / review / error) may carry an
// `extra` array of author Button blocks that concat into the floating-actions
// bar after the template-shipped signal buttons. Each entry needs a string
// `id` and an `events.onClick` action array, and may not reuse a reserved
// signal-button id. Non-form actions (check / tracker) emit no verb pages
// (makeActionPages returns [] for non-form kinds), so an `extra` slot would
// silently never render — reject it outright rather than drop it silently.
// Behaviour past structural shape (what the onClick chain does) is not
// type-checked: an extra that calls the per-action endpoint with a recognised
// signal is processed by the engine normally — the locked-signal invariant is
// about vocabulary, not caller (see design Decision 3).
function validateButtonsExtra(workflow, action) {
  const pages = action.pages;
  if (pages === null || typeof pages !== "object") return;

  for (const verb of ACCESS_VERBS) {
    const extra = pages[verb]?.buttons?.extra;
    if (extra === undefined) continue;

    const slot = `${action.type}" pages.${verb}.buttons.extra`;

    if (action.kind !== "form") {
      fail(
        workflow.type,
        `action "${slot} is only available on form actions; kind "${action.kind}" emits no verb pages, so the slot would never render.`,
      );
    }

    if (!Array.isArray(extra)) {
      fail(
        workflow.type,
        `action "${slot} must be an array (got: ${JSON.stringify(extra)}).`,
      );
    }

    extra.forEach((entry, i) => {
      const at = `action "${action.type}" pages.${verb}.buttons.extra[${i}]`;
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        fail(workflow.type, `${at} must be a Button block object.`);
      }
      if (typeof entry.id !== "string") {
        fail(workflow.type, `${at} must have a string "id".`);
      }
      if (RESERVED_BUTTON_IDS.includes(entry.id)) {
        fail(
          workflow.type,
          `${at} uses reserved button id "${entry.id}"; these ids (${RESERVED_BUTTON_IDS.join(", ")}) belong to the template-shipped signal buttons.`,
        );
      }
      if (!Array.isArray(entry.events?.onClick)) {
        fail(
          workflow.type,
          `${at} must have an events.onClick action array.`,
        );
      }
    });
  }
}

// Part 48 D8: workflow-level event map. Keys must be LIFECYCLE_SIGNALS
// (started / cancelled / closed). Payload internals are not validated here —
// depth matches validateEvent (signal keys only).
function validateWorkflowEvent(workflow) {
  if (!workflow.event) return;
  const event = workflow.event;
  if (event === null || typeof event !== "object" || Array.isArray(event)) {
    fail(
      workflow.type,
      `workflow event must be a plain object keyed by lifecycle signals (expected keys: ${LIFECYCLE_SIGNALS.join(", ")}).`,
    );
  }
  for (const signal of Object.keys(event)) {
    if (!LIFECYCLE_SIGNALS.includes(signal)) {
      fail(
        workflow.type,
        `workflow event key "${signal}" is not a known lifecycle signal (expected one of: ${LIFECYCLE_SIGNALS.join(", ")}).`,
      );
    }
    // Lifecycle events carry no comment, so a static description is dead config
    // (Part 33 D4) — reject it the same way as per-action events.
    rejectAuthoredDescription(
      workflow,
      event[signal],
      `workflow event "${signal}"`,
    );
  }
}

// Part 56 D2: optional read-only `entity_view` block carrying `{ slot }` — the
// block ref rendered as the Details tab (form) / middle (check). It is build-
// time UI only and never reaches the materialized engine config (it's absent
// from WORKFLOW_FIELDS, so no strip is needed). Validation only confirms that,
// when present, `entity_view` is an object whose `slot` is a block ref — the
// object/array shape Lowdefy `_ref`-resolves. The slot's block tree contents
// are not validated here; the build walker resolves them when baked into pages.
function validateEntityView(workflow) {
  if (!("entity_view" in workflow)) return;
  const entityView = workflow.entity_view;
  if (
    entityView === null ||
    typeof entityView !== "object" ||
    Array.isArray(entityView)
  ) {
    fail(
      workflow.type,
      `"entity_view" must be an object with a "slot" block ref (got: ${JSON.stringify(entityView)}).`,
    );
  }
  const slot = entityView.slot;
  if (slot === null || typeof slot !== "object") {
    fail(
      workflow.type,
      `"entity_view" must be an object with a "slot" block ref (got slot: ${JSON.stringify(slot)}).`,
    );
  }
}

function validateWorkflow(workflow) {
  if ("entity_type" in workflow) {
    fail(
      workflow.type,
      'legacy "entity_type" field is no longer supported; move the entity wiring into the nested "entity" block (entity.connection_id, a MongoDB collection connection id like "leads-collection").',
    );
  }

  // Part 57: a workflow's entity wiring is one nested `entity:` block, carried
  // into the materialized config as authored (nothing lifted to flat aliases).
  // Required strings: connection_id, ref_key, page_id, title; id_query_key is
  // optional and defaults to "_id" in the materialized output.
  const entity = workflow.entity;
  if (entity === null || typeof entity !== "object" || Array.isArray(entity)) {
    fail(
      workflow.type,
      'missing required "entity" block — the workflow\'s entity wiring (entity.connection_id, entity.ref_key, entity.page_id, entity.title; optional entity.id_query_key).',
    );
  }

  if (typeof entity.connection_id !== "string" || entity.connection_id === "") {
    fail(
      workflow.type,
      'missing required "entity.connection_id" — the entity\'s MongoDB collection connection id (e.g. "leads-collection").',
    );
  }

  if (typeof entity.ref_key !== "string" || entity.ref_key === "") {
    fail(
      workflow.type,
      'missing required "entity.ref_key" — the event-references key for the workflow\'s entity (e.g. "lead_ids"), written into event docs so events surface on the entity.',
    );
  }

  if (typeof entity.page_id !== "string" || entity.page_id === "") {
    fail(
      workflow.type,
      'missing required "entity.page_id" — the host-app page id the workflow back-link navigates to.',
    );
  }

  if (typeof entity.title !== "string" || entity.title === "") {
    fail(
      workflow.type,
      'missing required "entity.title" — the singular human-readable entity-kind label (e.g. "Lead", "Company").',
    );
  }

  if (
    "id_query_key" in entity &&
    (typeof entity.id_query_key !== "string" || entity.id_query_key === "")
  ) {
    fail(
      workflow.type,
      `entity.id_query_key must be a non-empty string when present (got: ${JSON.stringify(entity.id_query_key)}).`,
    );
  }

  // Part 56 D10: optional dot-path to the entity's display name field, read by
  // GetWorkflowAction to resolve the breadcrumb instance name. When present it
  // must be a non-empty string; it rides the wholesale entity carry untouched.
  if (
    "name_field" in entity &&
    (typeof entity.name_field !== "string" || entity.name_field === "")
  ) {
    fail(
      workflow.type,
      `entity.name_field must be a non-empty string when present (got: ${JSON.stringify(entity.name_field)}).`,
    );
  }

  // Optional entity-LIST breadcrumb link (e.g. Home / Leads / {entity} / …).
  // `list_page_id` is the host-app entity-list page id; `list_title` is its
  // (plural) crumb label. They are a pair: a link needs a label, so neither
  // defaults from the other. Both set → the breadcrumb gets a list crumb in
  // front of the entity crumb; both omitted → no list crumb (current trail).
  // Exactly one present is an authoring error.
  if (
    "list_page_id" in entity &&
    (typeof entity.list_page_id !== "string" || entity.list_page_id === "")
  ) {
    fail(
      workflow.type,
      `entity.list_page_id must be a non-empty string when present (got: ${JSON.stringify(entity.list_page_id)}).`,
    );
  }
  if (
    "list_title" in entity &&
    (typeof entity.list_title !== "string" || entity.list_title === "")
  ) {
    fail(
      workflow.type,
      `entity.list_title must be a non-empty string when present (got: ${JSON.stringify(entity.list_title)}).`,
    );
  }
  if (("list_page_id" in entity) !== ("list_title" in entity)) {
    fail(
      workflow.type,
      'entity.list_page_id and entity.list_title must be set together — a list breadcrumb link needs both a page id and a label (or omit both to drop the list crumb).',
    );
  }

  validateEntityView(workflow);

  if ("title" in workflow && typeof workflow.title !== "string") {
    fail(
      workflow.type,
      `workflow title must be a string when present (got: ${JSON.stringify(workflow.title)}).`,
    );
  }

  validateWorkflowEvent(workflow);

  const actions = workflow.actions ?? [];
  const groups = workflow.action_groups ?? [];
  const startingActions = workflow.starting_actions ?? [];

  const actionTypes = new Set();
  for (const action of actions) {
    if (actionTypes.has(action.type)) {
      fail(workflow.type, `duplicate action type "${action.type}".`);
    }
    actionTypes.add(action.type);
  }

  const groupIds = new Set();
  for (const group of groups) {
    if (actionTypes.has(group.id)) {
      fail(
        workflow.type,
        `action_groups id "${group.id}" collides with an action type.`,
      );
    }
    groupIds.add(group.id);
    if ("title" in group && typeof group.title !== "string") {
      fail(
        workflow.type,
        `action_groups "${group.id}" title must be a string when present (got: ${JSON.stringify(group.title)}).`,
      );
    }
    validateGroupOnComplete(workflow, group);
  }

  for (const action of actions) {
    validateAction(workflow, action);
    if (action.action_group && !groupIds.has(action.action_group)) {
      fail(
        workflow.type,
        `action "${action.type}" references unknown action_group "${action.action_group}".`,
      );
    }
    const blockedBy = action.blocked_by ?? [];
    for (const entry of blockedBy) {
      if (!groupIds.has(entry) && !actionTypes.has(entry)) {
        fail(
          workflow.type,
          `action "${action.type}" blocked_by entry "${entry}" resolves to neither a declared action_groups[].id nor a declared actions[].type.`,
        );
      }
    }
  }

  for (const entry of startingActions) {
    if (!actionTypes.has(entry.type)) {
      fail(
        workflow.type,
        `starting_actions entry references unknown action type "${entry.type}".`,
      );
    }
    if (!ACTION_STATUSES.includes(entry.status)) {
      fail(
        workflow.type,
        `starting_actions entry for "${entry.type}" has invalid status "${entry.status}".`,
      );
    }
    if (!LEGAL_SEED_STATUSES.includes(entry.status)) {
      fail(
        workflow.type,
        `starting_actions entry for "${entry.type}" seeds status "${entry.status}" — only ${LEGAL_SEED_STATUSES.join(" | ")} are legal seeds (creation at workflow start is not an FSM transition). Re-author to a legal seed.`,
      );
    }
  }
}

// Part 48 D6: Cross-workflow tracker edge validation. Runs after per-workflow
// validation so all workflow types are known. Checks:
//   1. Every child_workflow_type resolves to a declared workflow type.
//   2. No tracker cycle exists across the workflow set.
function validateTrackerEdges(workflows) {
  const declaredTypes = new Set(workflows.map((wf) => wf.type));
  const edges = collectTrackerEdges(workflows);

  // Resolution check: child must be a declared workflow type.
  for (const { parentType, childType } of edges) {
    if (!declaredTypes.has(childType)) {
      throw new Error(
        `makeWorkflowsConfig: workflow "${parentType}": tracker action declares child_workflow_type "${childType}" which is not a declared workflow type.`,
      );
    }
  }

  // Acyclicity check: walk the edge graph and detect cycles using DFS.
  // Build adjacency list (parent → [children]).
  const children = new Map();
  for (const { parentType, childType } of edges) {
    if (!children.has(parentType)) children.set(parentType, []);
    children.get(parentType).push(childType);
  }

  // DFS with three-colour marking: white (unvisited), grey (in-stack), black (done).
  const WHITE = 0,
    GREY = 1,
    BLACK = 2;
  const colour = new Map();

  function dfs(node, stack) {
    colour.set(node, GREY);
    for (const child of children.get(node) ?? []) {
      if (colour.get(child) === GREY) {
        // Cycle detected — reconstruct the cycle path from the stack.
        const cycleStart = stack.indexOf(child);
        const cyclePath = [...stack.slice(cycleStart), child].join(" → ");
        throw new Error(`makeWorkflowsConfig: tracker cycle: ${cyclePath}`);
      }
      if ((colour.get(child) ?? WHITE) === WHITE) {
        dfs(child, [...stack, child]);
      }
    }
    colour.set(node, BLACK);
  }

  for (const type of declaredTypes) {
    if ((colour.get(type) ?? WHITE) === WHITE) {
      dfs(type, [type]);
    }
  }
}

function makeWorkflowsConfig(_, vars) {
  const { workflows, title_acronyms = [] } = vars;

  const result = workflows.map((workflow) => {
    validateWorkflow(workflow);

    // Group-id list (declaration order) for stamping each action's group_index.
    // Ids are unchanged by the title-defaulting map below, so this is read off
    // the raw config directly — `findIndex` mirrors the comparator exactly.
    const groupIds = (workflow.action_groups ?? []).map((group) => group.id);

    const actions = (workflow.actions ?? []).map((action, declIndex) => {
      const picked = pick(action, ACTION_FIELDS);

      // Denormalised sort indices (Part 50): the action's declaration position
      // (the `.map` index — action `type` is unique within a workflow, so this
      // equals the comparator's `actions.findIndex((a) => a.type === ...)`) and
      // its group's position in `action_groups[]`. `findIndex` → -1 for a
      // missing/unknown group; stored as -1 (the comparator maps -1 → +∞).
      picked.decl_index = declIndex;
      picked.group_index = groupIds.findIndex((id) => id === action.action_group);

      // Title default: explicit `action.title` wins; else derive from `type`.
      // Materialized once here so every config-reading surface reads a
      // guaranteed-present title with no runtime fallback.
      picked.title = action.title ?? humanizeSlug(action.type, title_acronyms);

      // Default allow_not_required to false (opt-in; preserves Part 39 D3's
      // safety rationale). Validation already rejected non-boolean values above.
      picked.allow_not_required = action.allow_not_required === true;

      // Attach form_meta for form-kind actions. Ported from makeActionFormConfigs
      // so the per-action metadata rides the validated config directly (no
      // cross-workflow action.type collision).
      if (action.kind === "form") {
        picked.form_meta = {
          form: describeForm(action.form),
          ...(action.form_review
            ? { form_review: describeForm(action.form_review) }
            : {}),
          ...(action.form_error
            ? { form_error: describeForm(action.form_error) }
            : {}),
        };
      }

      return picked;
    });

    // Group title default: explicit `group.title` wins (enum-supplied titles
    // arrive inline here too, _ref'd upstream — the resolver can't and needn't
    // distinguish them from an author override); else derive from the group id.
    const actionGroups = (workflow.action_groups ?? []).map((group) => ({
      ...group,
      title: group.title ?? humanizeSlug(group.id, title_acronyms),
    }));

    return {
      ...pick(workflow, WORKFLOW_FIELDS),
      // Workflow title default: explicit `workflow.title` wins; else derive
      // from `type`. Set after the pick so it fills the gap when omitted.
      title: workflow.title ?? humanizeSlug(workflow.type, title_acronyms),
      // Part 57: carry the whole authored `entity` block wholesale (no field is
      // lifted to a flat alias), applying only the id_query_key default.
      entity: {
        ...workflow.entity,
        id_query_key: workflow.entity.id_query_key ?? "_id",
      },
      ...(actionGroups.length > 0 ? { action_groups: actionGroups } : {}),
      actions,
    };
  });

  // Cross-workflow checks: edge resolution + acyclicity (require full set).
  validateTrackerEdges(workflows);

  return result;
}

export default makeWorkflowsConfig;
