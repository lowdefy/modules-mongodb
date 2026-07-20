// Shared role-gate oracle.
//
// The `(gate, user-roles) → bool` semantic is owned by the plugin's
// `gateAllows` (loadWorkflowState.js), consumed at submit time (the load
// gate) and at read time (`computeAllowed` in resolveActionAccess.js). This
// table is the single source of truth those paths are tested against
// (resolveActionAccess.test.js), so a future change to the gate shape (e.g. a
// `*` wildcard or a deny-list) is expressed in one place and divergence fails
// CI.
//
// Gate shape: `true | [roles]`. An *absent* verb key resolves as if
// the gate were missing — no access. This file is pure data: no assertions, no
// helper. Each consuming test runs the table through its own runtime.
//
// Semantics:
//   - `true` gate                     → pass, for ANY user roles (incl. []).
//   - array gate ∩ user roles ≠ ∅     → pass.
//   - array gate ∩ user roles = ∅     → fail.
//   - absent / undefined gate         → fail (verb not declared).
//   - non-`true` gate, empty roles    → fail.

const gateCases = [
  // --- `true` gate → always pass, regardless of roles (incl. empty) ---
  {
    name: "true gate, user has roles → pass",
    gate: true,
    userRoles: ["account-manager"],
    expected: true,
  },
  {
    name: "true gate, empty user roles → pass",
    gate: true,
    userRoles: [],
    expected: true,
  },
  {
    name: "true gate, no roles list at all → pass",
    gate: true,
    userRoles: undefined,
    expected: true,
  },

  // --- array gate intersecting user roles → pass ---
  {
    name: "array gate, single overlapping role → pass",
    gate: ["account-manager"],
    userRoles: ["account-manager"],
    expected: true,
  },
  {
    name: "array gate, one of several user roles overlaps → pass",
    gate: ["device-manager", "device-team"],
    userRoles: ["support-rep", "device-team"],
    expected: true,
  },

  // --- array gate with empty intersection → fail ---
  {
    name: "array gate, no overlapping role → fail",
    gate: ["device-manager"],
    userRoles: ["support-rep"],
    expected: false,
  },
  {
    name: "array gate, disjoint role sets → fail",
    gate: ["device-manager", "device-team"],
    userRoles: ["account-manager", "support-rep"],
    expected: false,
  },

  // --- undeclared / missing verb (gate absent) → fail ---
  {
    name: "absent gate (undeclared verb), user has roles → fail",
    gate: undefined,
    userRoles: ["device-manager"],
    expected: false,
  },

  // --- empty user-roles vs non-`true` gate → fail ---
  {
    name: "array gate, empty user roles → fail",
    gate: ["device-manager"],
    userRoles: [],
    expected: false,
  },
  {
    name: "absent gate, empty user roles → fail",
    gate: undefined,
    userRoles: [],
    expected: false,
  },
];

export default gateCases;
