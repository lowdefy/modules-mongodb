// Client mirror of the role-gate oracle (Part 34 D8 / Part 38 task 8).
//
// The `action_role_check` component evaluates per-verb access on the client to
// keep the page's button affordances honest (the server-side query/submit-time
// checks are the authoritative gate). The component's `_js` block can't import,
// so it inlines this logic verbatim; this module exists so the same logic is
// unit-tested against the shared `gates.fixtures.js` oracle — the stand-in for
// the code-sharing the three runtimes preclude.
//
// Gate semantics (must match visible_verbs_filter.yaml and the load gate):
//   - gate `true`    → always allowed.
//   - gate `[roles]` → allowed iff it intersects the user's app roles.
//   - anything else (absent verb, [], non-array) → denied.

export function gateAllows(gate, userRoles) {
  if (gate === true) return true;
  if (Array.isArray(gate)) {
    const roles = Array.isArray(userRoles) ? userRoles : [];
    return gate.some((r) => roles.includes(r));
  }
  return false;
}

// Builds the four-key `action_allowed` bag for one app's access block.
export function computeActionAllowed(access, appName, userRoles) {
  const appAccess = (access && access[appName]) || {};
  return {
    view: gateAllows(appAccess.view, userRoles),
    edit: gateAllows(appAccess.edit, userRoles),
    review: gateAllows(appAccess.review, userRoles),
    error: gateAllows(appAccess.error, userRoles),
  };
}

export default gateAllows;
