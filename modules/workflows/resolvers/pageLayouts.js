// Allowed values for a workflow's optional `page_layout` field. `standard` is
// the three-column shell; `wide` swaps the left step-list for workflow-progress
// and moves Details + History into a drawer so the form fills the freed width.
// Shared between the config validator (makeWorkflowsConfig) and the page resolver
// (makeActionPages) so the enum and its default can't drift.
export const PAGE_LAYOUTS = ["standard", "wide"];
export const DEFAULT_PAGE_LAYOUT = "standard";
