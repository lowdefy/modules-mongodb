import {
  gateAllows,
  computeAllowed,
  collapseLink,
  resolveButtons,
  BUTTON_SIGNAL_SOURCES,
} from './resolveActionAccess.js';
import { FSM_TABLES } from '../fsm/tables.js';
import gateCases from '../../../../../../modules/workflows/resolvers/__fixtures__/gates.fixtures.js';

// ---------------------------------------------------------------------------
// gateAllows — shared oracle
// ---------------------------------------------------------------------------

test.each(gateCases)(
  'gateAllows matches the oracle: $name',
  ({ gate, userRoles, expected }) => {
    expect(gateAllows(gate, userRoles)).toBe(expected);
  },
);

// ---------------------------------------------------------------------------
// computeAllowed — four-key access bag
// ---------------------------------------------------------------------------

test('computeAllowed: true gate grants all four verbs when declared', () => {
  const access = {
    demo: { view: true, edit: true, review: true, error: true },
  };
  expect(computeAllowed({ access, app_name: 'demo', userRoles: [] })).toEqual({
    view: true,
    edit: true,
    review: true,
    error: true,
  });
});

test('computeAllowed: array gate with matching role grants verb', () => {
  const access = {
    demo: { view: ['account-manager'], edit: ['account-manager'] },
  };
  expect(
    computeAllowed({ access, app_name: 'demo', userRoles: ['account-manager'] }),
  ).toEqual({ view: true, edit: true, review: false, error: false });
});

test('computeAllowed: array gate with no matching role denies verb', () => {
  const access = { demo: { view: ['manager'], edit: ['manager'] } };
  expect(
    computeAllowed({ access, app_name: 'demo', userRoles: ['support-rep'] }),
  ).toEqual({ view: false, edit: false, review: false, error: false });
});

test('computeAllowed: absent verb key denies that verb', () => {
  const access = { demo: { view: true } };
  expect(
    computeAllowed({ access, app_name: 'demo', userRoles: ['any-role'] }),
  ).toEqual({ view: true, edit: false, review: false, error: false });
});

test('computeAllowed: absent app block denies every verb', () => {
  const access = { other_app: { view: true, edit: true } };
  expect(
    computeAllowed({ access, app_name: 'demo', userRoles: ['account-manager'] }),
  ).toEqual({ view: false, edit: false, review: false, error: false });
});

test('computeAllowed: null access denies every verb', () => {
  expect(
    computeAllowed({ access: null, app_name: 'demo', userRoles: ['account-manager'] }),
  ).toEqual({ view: false, edit: false, review: false, error: false });
});

test('computeAllowed: undefined access denies every verb', () => {
  expect(
    computeAllowed({ access: undefined, app_name: 'demo', userRoles: ['account-manager'] }),
  ).toEqual({ view: false, edit: false, review: false, error: false });
});

test('computeAllowed: undefined userRoles treated as empty array', () => {
  const access = { demo: { view: ['manager'] } };
  expect(
    computeAllowed({ access, app_name: 'demo', userRoles: undefined }),
  ).toEqual({ view: false, edit: false, review: false, error: false });
});

test('computeAllowed: true gate passes with undefined userRoles', () => {
  const access = { demo: { view: true } };
  expect(
    computeAllowed({ access, app_name: 'demo', userRoles: undefined }),
  ).toEqual({ view: true, edit: false, review: false, error: false });
});

// Agreement with gates.fixtures.js oracle on the `view` verb for the app.
// This is the equivalent of `visible_verbs_filter.test.js` for the JS runtime.
test.each(gateCases)(
  'computeAllowed view-verb matches the oracle: $name',
  ({ gate, userRoles, expected }) => {
    const access = gate === undefined ? {} : { demo: { view: gate } };
    const allowed = computeAllowed({ access, app_name: 'demo', userRoles });
    expect(allowed.view).toBe(expected);
    // Other verbs are absent → false
    expect(allowed.edit).toBe(false);
    expect(allowed.review).toBe(false);
    expect(allowed.error).toBe(false);
  },
);

// ---------------------------------------------------------------------------
// collapseLink — priority collapse (edit > review > error > view)
// ---------------------------------------------------------------------------

const EDIT_LINK = { pageId: 'workflows/action-edit', urlQuery: { action_id: 'a1' } };
const REVIEW_LINK = { pageId: 'workflows/action-review', urlQuery: { action_id: 'a1' } };
const ERROR_LINK = { pageId: 'workflows/action-error', urlQuery: { action_id: 'a1' } };
const VIEW_LINK = { pageId: 'workflows/action-view', urlQuery: { action_id: 'a1' } };

const ALL_LINKS = { view: VIEW_LINK, edit: EDIT_LINK, review: REVIEW_LINK, error: ERROR_LINK };

test('collapseLink: edit is highest priority when allowed and non-null', () => {
  const allowed = { view: true, edit: true, review: true, error: true };
  expect(collapseLink({ links: ALL_LINKS, allowed })).toEqual(EDIT_LINK);
});

test('collapseLink: review wins when edit is null', () => {
  const links = { ...ALL_LINKS, edit: null };
  const allowed = { view: true, edit: true, review: true, error: true };
  expect(collapseLink({ links, allowed })).toEqual(REVIEW_LINK);
});

test('collapseLink: review wins when edit not allowed', () => {
  const allowed = { view: true, edit: false, review: true, error: true };
  expect(collapseLink({ links: ALL_LINKS, allowed })).toEqual(REVIEW_LINK);
});

test('collapseLink: error wins when edit and review are null/denied', () => {
  const links = { view: VIEW_LINK, edit: null, review: null, error: ERROR_LINK };
  const allowed = { view: true, edit: false, review: false, error: true };
  expect(collapseLink({ links, allowed })).toEqual(ERROR_LINK);
});

test('collapseLink: view wins when edit/review/error are null or denied', () => {
  const links = { view: VIEW_LINK, edit: null, review: null, error: null };
  const allowed = { view: true, edit: false, review: false, error: false };
  expect(collapseLink({ links, allowed })).toEqual(VIEW_LINK);
});

test('collapseLink: null when all verbs denied', () => {
  const allowed = { view: false, edit: false, review: false, error: false };
  expect(collapseLink({ links: ALL_LINKS, allowed })).toBeNull();
});

test('collapseLink: null when all link cells are null (state-side)', () => {
  const links = { view: null, edit: null, review: null, error: null };
  const allowed = { view: true, edit: true, review: true, error: true };
  expect(collapseLink({ links, allowed })).toBeNull();
});

test('collapseLink: null when links is null', () => {
  const allowed = { view: true, edit: true, review: true, error: true };
  expect(collapseLink({ links: null, allowed })).toBeNull();
});

test('collapseLink: null when links is undefined', () => {
  const allowed = { view: true, edit: true, review: true, error: true };
  expect(collapseLink({ links: undefined, allowed })).toBeNull();
});

test('collapseLink: view-only user, pre-child tracker (view null) → null', () => {
  // Matches the pre-child tracker scenario from resolve_action_link.test.js
  const links = { view: null, edit: EDIT_LINK, review: null, error: null };
  const allowed = { view: true, edit: false, review: false, error: false };
  expect(collapseLink({ links, allowed })).toBeNull();
});

test('collapseLink: edit user, pre-child tracker (view null) → edit link', () => {
  const startLink = {
    pageId: 'ticket-new',
    urlQuery: { action_id: 'a1', entity_id: 'ent-1' },
  };
  const links = { view: null, edit: startLink, review: null, error: null };
  const allowed = { view: true, edit: true, review: false, error: false };
  expect(collapseLink({ links, allowed })).toEqual(startLink);
});

// ---------------------------------------------------------------------------
// resolveButtons — six-signal button policy
// ---------------------------------------------------------------------------

const FULL_ALLOWED = { view: true, edit: true, review: true, error: true };
const NO_ALLOWED = { view: false, edit: false, review: false, error: false };

test('resolveButtons: at action-required with edit, submit and progress and not_required visible (not_required only when allow_not_required)', () => {
  const result = resolveButtons({
    stage: 'action-required',
    allowed: FULL_ALLOWED,
    allow_not_required: true,
  });
  expect(result.submit).toBe(true);
  expect(result.progress).toBe(true);
  expect(result.not_required).toBe(true);
  expect(result.approve).toBe(false);
  expect(result.request_changes).toBe(false);
  expect(result.resolve_error).toBe(false);
});

test('resolveButtons: not_required false when allow_not_required is false', () => {
  const result = resolveButtons({
    stage: 'action-required',
    allowed: FULL_ALLOWED,
    allow_not_required: false,
  });
  expect(result.not_required).toBe(false);
});

test('resolveButtons: not_required false when allow_not_required is omitted', () => {
  const result = resolveButtons({
    stage: 'action-required',
    allowed: FULL_ALLOWED,
  });
  expect(result.not_required).toBe(false);
});

test('resolveButtons: at in-review with review allowed, approve and request_changes visible', () => {
  const result = resolveButtons({
    stage: 'in-review',
    allowed: { view: true, edit: false, review: true, error: false },
    allow_not_required: false,
  });
  expect(result.submit).toBe(false);
  expect(result.progress).toBe(false);
  expect(result.approve).toBe(true);
  expect(result.request_changes).toBe(true);
  expect(result.resolve_error).toBe(false);
  // not_required: stage 'in-review' IS in the source list but allow_not_required is false
  expect(result.not_required).toBe(false);
});

test('resolveButtons: at error stage with error allowed, only resolve_error visible', () => {
  const result = resolveButtons({
    stage: 'error',
    allowed: { view: true, edit: false, review: false, error: true },
    allow_not_required: true,
  });
  expect(result.submit).toBe(false);
  expect(result.progress).toBe(false);
  expect(result.approve).toBe(false);
  expect(result.request_changes).toBe(false);
  expect(result.resolve_error).toBe(true);
  // not_required: stage 'error' IS in the source list and allow_not_required=true,
  // but edit verb is denied
  expect(result.not_required).toBe(false);
});

test('resolveButtons: all false when no verbs allowed', () => {
  const result = resolveButtons({
    stage: 'in-review',
    allowed: NO_ALLOWED,
    allow_not_required: true,
  });
  expect(result).toEqual({
    submit: false,
    progress: false,
    not_required: false,
    approve: false,
    request_changes: false,
    resolve_error: false,
  });
});

test('resolveButtons: all false for non-source stage (blocked)', () => {
  const result = resolveButtons({
    stage: 'blocked',
    allowed: FULL_ALLOWED,
    allow_not_required: true,
  });
  // 'blocked' is only a source stage for not_required
  expect(result.submit).toBe(false);
  expect(result.progress).toBe(false);
  expect(result.approve).toBe(false);
  expect(result.request_changes).toBe(false);
  expect(result.resolve_error).toBe(false);
  // not_required: blocked IS in the source list
  expect(result.not_required).toBe(true);
});

test('resolveButtons: all false for unknown stage', () => {
  const result = resolveButtons({
    stage: 'nonexistent-stage',
    allowed: FULL_ALLOWED,
    allow_not_required: true,
  });
  expect(result).toEqual({
    submit: false,
    progress: false,
    not_required: false,
    approve: false,
    request_changes: false,
    resolve_error: false,
  });
});

test('resolveButtons: all false for undefined stage', () => {
  const result = resolveButtons({
    stage: undefined,
    allowed: FULL_ALLOWED,
    allow_not_required: true,
  });
  expect(result).toEqual({
    submit: false,
    progress: false,
    not_required: false,
    approve: false,
    request_changes: false,
    resolve_error: false,
  });
});

test('resolveButtons: submit at done stage with edit allowed', () => {
  const result = resolveButtons({
    stage: 'done',
    allowed: { view: true, edit: true, review: false, error: false },
    allow_not_required: false,
  });
  expect(result.submit).toBe(true);
  expect(result.progress).toBe(false);
  // not_required: done is NOT in the not_required source list
  expect(result.not_required).toBe(false);
  // request_changes: done IS in the source list but review denied
  expect(result.request_changes).toBe(false);
});

test('resolveButtons: request_changes at done stage with review allowed', () => {
  const result = resolveButtons({
    stage: 'done',
    allowed: { view: true, edit: true, review: true, error: false },
    allow_not_required: false,
  });
  expect(result.submit).toBe(true);
  expect(result.request_changes).toBe(true);
  expect(result.approve).toBe(false);
});

test('resolveButtons: output never contains internal signals', () => {
  const result = resolveButtons({
    stage: 'action-required',
    allowed: FULL_ALLOWED,
    allow_not_required: true,
  });
  const keys = Object.keys(result);
  expect(keys).not.toContain('activate');
  expect(keys).not.toContain('block');
  // The output has exactly the six user-facing signals
  expect(keys.sort()).toEqual(
    ['approve', 'not_required', 'progress', 'request_changes', 'resolve_error', 'submit'],
  );
});

test('resolveButtons: changes-required stage shows submit and not_required (with allow)', () => {
  const result = resolveButtons({
    stage: 'changes-required',
    allowed: { view: true, edit: true, review: false, error: false },
    allow_not_required: true,
  });
  expect(result.submit).toBe(true);
  expect(result.not_required).toBe(true);
  expect(result.progress).toBe(false);
  expect(result.approve).toBe(false);
  expect(result.request_changes).toBe(false);
});

// ---------------------------------------------------------------------------
// BUTTON_SIGNAL_SOURCES — FSM consistency guard
//
// Ported from the deleted modules/workflows/enums/button_signal_sources.test.js
// (Part 46 task 12): the source-stage table must stay a faithful inversion of
// FSM_TABLES.form, restricted to the six user-facing signals. The `none` row is
// excluded because `none` is a transient resolution-time sentinel — never a
// stored status (tables.js header: "never a stored status"). Without this
// exclusion the `request_changes` signal would incorrectly include `none` (its
// upsert-spawn entry) and the set comparison would fail.
// ---------------------------------------------------------------------------

const BUTTON_SIGNALS = [
  'submit',
  'progress',
  'not_required',
  'approve',
  'request_changes',
  'resolve_error',
];

function deriveSourceStages(signal) {
  return Object.keys(FSM_TABLES.form).filter(
    (stage) => stage !== 'none' && signal in FSM_TABLES.form[stage],
  );
}

test('BUTTON_SIGNAL_SOURCES contains exactly the six button-surfaced signals', () => {
  expect(Object.keys(BUTTON_SIGNAL_SOURCES).sort()).toEqual([...BUTTON_SIGNALS].sort());
});

test.each(BUTTON_SIGNALS)(
  'BUTTON_SIGNAL_SOURCES: %s source-stages match FSM table (set equality, none excluded)',
  (signal) => {
    const tableStages = new Set(BUTTON_SIGNAL_SOURCES[signal]);
    const derivedStages = new Set(deriveSourceStages(signal));
    expect(tableStages).toEqual(derivedStages);
  },
);
