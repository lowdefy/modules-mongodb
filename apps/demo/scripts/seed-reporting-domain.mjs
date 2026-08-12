/**
 * Seeds a realistic, linked demo domain for the reporting module and creates
 * the read-only MongoDB views the data dictionary queries.
 *
 * Why a script (not a Lowdefy Api like reporting-seed-orders): the MongoDB
 * plugin exposes CRUD requests only — it cannot create a view. View creation is
 * a database DDL operation, so it lives here (and, in production, in a
 * migration). The `mongodb` driver is already a dependency.
 *
 * The catalog exposes both the base collections and these views. The agent
 * composes its own joins from catalog relationships, so the views are an
 * optional convenience, not the only way in: each one bakes the
 * $lookup/$unwind/current-status logic in at a fixed grain, so counts over it
 * are exact without the agent having to reason about fan-out.
 *
 * Run (needs the Mongo URI):
 *   pnpm --filter @lowdefy/modules-demo reporting:seed
 *   # or:  MONGODB_URI="mongodb+srv://..." node scripts/seed-reporting-domain.mjs
 *
 * The URI comes from LOWDEFY_SECRET_MONGODB_URI — the same env var the app's
 * `_secret: MONGODB_URI` reads (Lowdefy strips the LOWDEFY_SECRET_ prefix), so
 * Infisical injects it under that name. A plain MONGODB_URI export also works.
 *
 * Idempotent: source collections are cleared and views dropped + recreated.
 */
import { MongoClient } from "mongodb";

const uri = process.env.LOWDEFY_SECRET_MONGODB_URI || process.env.MONGODB_URI;
if (!uri) {
  console.error(
    "No Mongo URI found (LOWDEFY_SECRET_MONGODB_URI / MONGODB_URI). Run via " +
      "`pnpm --filter @lowdefy/modules-demo reporting:seed` (which pulls it from " +
      "Infisical) or export MONGODB_URI yourself."
  );
  process.exit(1);
}

// Deterministic, index-derived data (no randomness) so re-seeding is stable.
const DAY = 86400000;
const now = Date.now();
const daysAgo = (n) => new Date(now - n * DAY);
const pick = (arr, i) => arr[i % arr.length];

// One newest-first status history entry per stage, oldest last — mirrors the
// real modules' status arrays (status[0] is the current stage).
function statusHistory(stages, baseDaysAgo) {
  return stages
    .map((stage, i) => ({ stage, created: { timestamp: daysAgo(baseDaysAgo - i * 2) } }))
    .reverse();
}

// ── Companies ──────────────────────────────────────────────────────────────
const COMPANY_NAMES = [
  "Northwind Traders",
  "Contoso Ltd",
  "Fabrikam Inc",
  "Adventure Works",
  "Tailspin Toys",
];
const companies = COMPANY_NAMES.map((name, i) => ({
  _id: `C-${String(i + 1).padStart(4, "0")}`,
  name,
  contact: { primary_email: `hello@${name.toLowerCase().replace(/[^a-z]/g, "")}.example` },
  address: { formatted_address: `${100 + i} Main Street, City ${i + 1}` },
  registration: {
    registered_name: `${name} (Pty) Ltd`,
    vat_number: `VAT${4000000 + i}`,
  },
  created: { timestamp: daysAgo(300 - i * 10) },
}));

// ── Contacts (user-contacts shape) ───────────────────────────────────────────
const GIVEN = ["Ava", "Ben", "Cara", "Dan", "Eve", "Finn", "Gia", "Hugo", "Isla", "Jack", "Kira", "Leo"];
const FAMILY = ["Smith", "Jones", "Patel", "Kim", "Diaz", "Okoro"];
const contacts = GIVEN.map((given, i) => {
  const family = pick(FAMILY, i);
  // Each contact belongs to 1–2 companies (scalar FK array).
  const companyIds =
    i % 3 === 0
      ? [pick(companies, i)._id, pick(companies, i + 1)._id]
      : [pick(companies, i)._id];
  return {
    _id: `U-${String(i + 1).padStart(4, "0")}`,
    email: `${given.toLowerCase()}.${family.toLowerCase()}@example.com`,
    profile: { given_name: given, family_name: family, name: `${given} ${family}` },
    global_attributes: { company_ids: companyIds },
    created: { timestamp: daysAgo(250 - i * 5) },
  };
});
const contactRef = (i) => {
  const c = pick(contacts, i);
  return { contact_id: c._id, name: c.profile.name };
};

// ── Activities ───────────────────────────────────────────────────────────────
const ACTIVITY_TYPES = ["call", "meeting", "email", "note"];
const CHANNELS = ["manual", "email", "import"];
const ACTIVITY_STAGES = [["open"], ["open", "done"], ["open", "cancelled"], ["open", "done"]];
const activities = Array.from({ length: 36 }, (_, i) => {
  const company = pick(companies, i);
  return {
    _id: `A-${String(i + 1).padStart(4, "0")}`,
    type: pick(ACTIVITY_TYPES, i),
    title: `${pick(ACTIVITY_TYPES, i)} with ${company.name}`,
    contacts: [contactRef(i), contactRef(i + 3)],
    company_ids: [company._id],
    source: { channel: pick(CHANNELS, i) },
    status: statusHistory(pick(ACTIVITY_STAGES, i), 8 + (i % 150)),
    created: { timestamp: daysAgo(5 + i * 5) }, // spread across ~6 months
  };
});

// ── Workflows ────────────────────────────────────────────────────────────────
const WORKFLOW_TYPES = ["onboarding", "renewal", "support"];
const WORKFLOW_STAGES = [["active"], ["active", "completed"], ["active", "cancelled"]];
const workflows = Array.from({ length: 9 }, (_, i) => {
  const company = pick(companies, i);
  return {
    _id: `W-${String(i + 1).padStart(4, "0")}`,
    workflow_type: pick(WORKFLOW_TYPES, i),
    title: `${pick(WORKFLOW_TYPES, i)} — ${company.name}`,
    entity: { connection_id: "demo_companies", id: company._id },
    status: statusHistory(pick(WORKFLOW_STAGES, i), 20 + i * 10),
    created: { timestamp: daysAgo(30 + i * 12) },
  };
});

// ── Actions (linked to workflows; object-array assignees) ─────────────────────
const ACTION_KINDS = ["form", "check", "tracker"];
const ACTION_STAGES = [
  ["action-required"],
  ["action-required", "in-progress"],
  ["action-required", "in-progress", "done"],
  ["action-required", "not-required"],
];
const actions = Array.from({ length: 44 }, (_, i) => {
  const workflow = pick(workflows, i);
  return {
    _id: `AC-${String(i + 1).padStart(4, "0")}`,
    workflow_id: workflow._id,
    kind: pick(ACTION_KINDS, i),
    type: `${pick(ACTION_KINDS, i)}-task`,
    title: `${pick(ACTION_KINDS, i)} task ${i + 1}`,
    assignees: i % 4 === 0 ? [contactRef(i), contactRef(i + 2)] : [contactRef(i)],
    entity: workflow.entity,
    status: statusHistory(pick(ACTION_STAGES, i), 10 + (i % 120)),
    created: { timestamp: daysAgo(3 + i * 4) },
  };
});

// ── Saved reports (report_layouts) ───────────────────────────────────────────
// Reports in the stored shape modules/reporting/defaults/new_report.yaml
// produces, so the report-page surface is reproducible without driving the chat
// agent. The first two cover the healthy surface and conversation_id presence;
// the last three cover the report page's failure and filter-layout surfaces:
//   C  demo-report-broken-section    — a section over a collection that is no
//                                       longer cataloged, so it fails the resolve
//                                       gate and renders as the BROKEN alert with
//                                       owner recoveries (Fix in chat + Drop).
//   D  demo-report-withheld          — a section over the role-gated
//                                       demo_activities_confidential collection,
//                                       which renders as the WITHHELD alert for a
//                                       viewer without `report-confidential`,
//                                       shown BESIDE a broken section so the two
//                                       alert variants are not confused.
//   E  demo-report-two-filter-groups — two independent filters, each bound only
//                                       to its own pair of sections, so each
//                                       control co-locates above its own group
//                                       (and carries a scope label, since each
//                                       drives more than one section).
//
// The conversation_id field: report A carries one (so the report page's
// continue-in-chat affordance resolves) and report B carries null (so its
// absence is exercised too). Reports C and D carry one so the owner's Fix-in-chat
// affordance renders on their broken sections.
//
// The section specs are written as validateReportSpec's OUTPUT, not raw input —
// each section carries a durable `id` (s0, s1, …) and every query section a
// `filterBy: []` — because that normalized shape is what the store persists and
// what every read re-validates (the function is idempotent). They query
// demo_activities and demo_contacts, both seeded above, so the sections resolve
// on the report page from a single run of this script.
//
// Owner is a fixed synthetic demo user rather than a signed-in one (a node
// script has no session), and visibility is `shared` so whoever is signed in can
// open them regardless of who owns them. The owner-scoped report/conversation
// fixtures that DO need the live user stay in the Lowdefy seed Apis
// (reporting-seed-example-report / -conversations / -ownership).
const DEMO_OWNER = { user_id: "demo-user", name: "Demo User" };
const stamp = (daysBack) => ({
  timestamp: daysAgo(daysBack),
  user: DEMO_OWNER,
});
const reports = [
  // Report A — carries a conversation_id, so continue-in-chat resolves.
  {
    _id: "demo-report-with-conversation",
    owner: DEMO_OWNER,
    title: "Activities overview",
    description:
      "Activity counts across the seeded demo_activities collection — a KPI " +
      "and a bar chart by type. Seeded with a conversation_id so the report " +
      "page's continue-in-chat affordance resolves.",
    spec: {
      sections: [
        {
          id: "s0",
          type: "kpi",
          label: "Activities",
          query: {
            collection: "demo_activities",
            pipeline: [{ $group: { _id: null, activities: { $sum: 1 } } }],
          },
          valueKey: "activities",
          filterBy: [],
        },
        {
          id: "s1",
          type: "chart",
          chart: "bar",
          label: "Activities by type",
          query: {
            collection: "demo_activities",
            pipeline: [
              { $group: { _id: "$type", activities: { $sum: 1 } } },
              { $project: { _id: 0, type: "$_id", activities: 1 } },
              { $sort: { activities: -1 } },
            ],
          },
          x: "type",
          y: ["activities"],
          filterBy: [],
        },
      ],
    },
    spec_version: 1,
    visibility: "shared",
    favourite_of: [],
    conversation_id: "demo-conversation-001",
    deleted: null,
    created: stamp(14),
    updated: stamp(14),
  },
  // Report B — no conversation_id (null), so the affordance's absence is shown.
  {
    _id: "demo-report-no-conversation",
    owner: DEMO_OWNER,
    title: "Contacts by company",
    description:
      "Contact counts across the seeded demo_contacts collection — a KPI and a " +
      "table by surname. Seeded with conversation_id null, so the report page " +
      "shows no continue-in-chat affordance.",
    spec: {
      sections: [
        {
          id: "s0",
          type: "kpi",
          label: "Contacts",
          query: {
            collection: "demo_contacts",
            pipeline: [{ $group: { _id: null, contacts: { $sum: 1 } } }],
          },
          valueKey: "contacts",
          filterBy: [],
        },
        {
          id: "s1",
          type: "table",
          label: "Contacts by surname",
          query: {
            collection: "demo_contacts",
            pipeline: [
              { $group: { _id: "$profile.family_name", contacts: { $sum: 1 } } },
              { $project: { _id: 0, surname: "$_id", contacts: 1 } },
              { $sort: { contacts: -1 } },
            ],
          },
          columns: [
            { key: "surname", label: "Surname" },
            { key: "contacts", label: "Contacts" },
          ],
          filterBy: [],
        },
      ],
    },
    spec_version: 1,
    visibility: "shared",
    favourite_of: [],
    conversation_id: null,
    deleted: null,
    created: stamp(7),
    updated: stamp(7),
  },
  // Report C — a broken section. s0 is a healthy KPI; s1's pipeline reads
  // `demo_orders_legacy`, a collection that is not in the catalog (a rename that
  // left the stored spec behind). The whole-spec grammar check passes (it does
  // not know collections), so the report opens; the per-section resolve gate
  // rejects s1, and compileReport classifies the failure as BROKEN (not
  // withheld) because the collection is not role-gated — it is simply gone.
  // For the owner this renders the alert plus Fix-in-chat (conversation_id is
  // set) and Drop; a non-owner sees the alert naming the owner to ask.
  {
    _id: "demo-report-broken-section",
    owner: DEMO_OWNER,
    title: "Orders overview (has a broken section)",
    description:
      "A KPI that still resolves, next to a table whose stored query points at " +
      "a collection that no longer exists in the catalog — so the table renders " +
      "as the broken-section alert with owner recoveries (Fix in chat, Drop).",
    spec: {
      sections: [
        {
          id: "s0",
          type: "kpi",
          label: "Activities",
          query: {
            collection: "demo_activities",
            pipeline: [{ $group: { _id: null, activities: { $sum: 1 } } }],
          },
          valueKey: "activities",
          filterBy: [],
        },
        {
          id: "s1",
          type: "table",
          label: "Orders by region (legacy)",
          query: {
            collection: "demo_orders_legacy",
            pipeline: [
              { $group: { _id: "$region", orders: { $sum: 1 } } },
              { $project: { _id: 0, region: "$_id", orders: 1 } },
              { $sort: { orders: -1 } },
            ],
          },
          columns: [
            { key: "region", label: "Region" },
            { key: "orders", label: "Orders" },
          ],
          filterBy: [],
        },
      ],
    },
    spec_version: 1,
    visibility: "shared",
    favourite_of: [],
    conversation_id: "demo-conversation-002",
    deleted: null,
    created: stamp(5),
    updated: stamp(5),
  },
  // Report D — a withheld section beside a broken one. s0 is a healthy KPI; s1
  // reads the role-gated demo_activities_confidential collection, so a viewer
  // without `report-confidential` gets the WITHHELD alert (no recoveries, naming
  // neither collection nor role); s2 reads a dropped collection, so it renders
  // as the BROKEN alert. Seeding both in one report is the point: withheld and
  // broken are different failures and must read differently.
  {
    _id: "demo-report-withheld",
    owner: DEMO_OWNER,
    title: "Activities overview (confidential section)",
    description:
      "A KPI anyone can see, a confidential chart only holders of the " +
      "report-confidential role may load (withheld otherwise), and a section " +
      "over a dropped collection that is broken rather than withheld.",
    spec: {
      sections: [
        {
          id: "s0",
          type: "kpi",
          label: "Activities",
          query: {
            collection: "demo_activities",
            pipeline: [{ $group: { _id: null, activities: { $sum: 1 } } }],
          },
          valueKey: "activities",
          filterBy: [],
        },
        {
          id: "s1",
          type: "chart",
          chart: "bar",
          label: "Confidential activities by type",
          query: {
            collection: "demo_activities_confidential",
            pipeline: [
              { $group: { _id: "$type", activities: { $sum: 1 } } },
              { $project: { _id: 0, type: "$_id", activities: 1 } },
              { $sort: { activities: -1 } },
            ],
          },
          x: "type",
          y: ["activities"],
          filterBy: [],
        },
        {
          id: "s2",
          type: "table",
          label: "Legacy orders (dropped collection)",
          query: {
            collection: "demo_orders_legacy",
            pipeline: [
              { $group: { _id: "$region", orders: { $sum: 1 } } },
              { $project: { _id: 0, region: "$_id", orders: 1 } },
            ],
          },
          columns: [
            { key: "region", label: "Region" },
            { key: "orders", label: "Orders" },
          ],
          filterBy: [],
        },
      ],
    },
    spec_version: 1,
    visibility: "shared",
    favourite_of: [],
    conversation_id: "demo-conversation-003",
    deleted: null,
    created: stamp(4),
    updated: stamp(4),
  },
  // Report E — two independent filter groups. The `type` select drives s2 (KPI)
  // and s3 (chart); the `source.channel` select drives s4 (KPI) and s5 (table).
  // No filter is bound to a section in the other group, so compileReport places
  // each control above its own group's first section, and each control carries a
  // scope label ("… (also filters: …)") because it drives more than one section.
  // Filter options come from the catalog enum `values` for each field — no
  // inline options or optionsQuery. There is no top-row filter box: the old
  // top-row layout is gone, so filters need no hand-placed prominent section.
  {
    _id: "demo-report-two-filter-groups",
    owner: DEMO_OWNER,
    title: "Activities — two filter groups",
    description:
      "Two independent filters, each bound only to its own pair of sections, so " +
      "each control renders inline above its own group rather than in a shared " +
      "top row.",
    spec: {
      sections: [
        { id: "s0", type: "filter", control: "select", field: "type", label: "Activity type" },
        {
          id: "s1",
          type: "filter",
          control: "select",
          field: "source.channel",
          label: "Capture channel",
        },
        {
          id: "s2",
          type: "kpi",
          label: "Activities (by type)",
          query: {
            collection: "demo_activities",
            pipeline: [{ $group: { _id: null, activities: { $sum: 1 } } }],
          },
          valueKey: "activities",
          filterBy: ["type"],
        },
        {
          id: "s3",
          type: "chart",
          chart: "bar",
          label: "Activities by type",
          query: {
            collection: "demo_activities",
            pipeline: [
              { $group: { _id: "$type", activities: { $sum: 1 } } },
              { $project: { _id: 0, type: "$_id", activities: 1 } },
              { $sort: { activities: -1 } },
            ],
          },
          x: "type",
          y: ["activities"],
          filterBy: ["type"],
        },
        {
          id: "s4",
          type: "kpi",
          label: "Activities (by channel)",
          query: {
            collection: "demo_activities",
            pipeline: [{ $group: { _id: null, activities: { $sum: 1 } } }],
          },
          valueKey: "activities",
          filterBy: ["source.channel"],
        },
        {
          id: "s5",
          type: "table",
          label: "Activities by channel",
          query: {
            collection: "demo_activities",
            pipeline: [
              { $group: { _id: "$source.channel", activities: { $sum: 1 } } },
              { $project: { _id: 0, channel: "$_id", activities: 1 } },
              { $sort: { activities: -1 } },
            ],
          },
          columns: [
            { key: "channel", label: "Channel" },
            { key: "activities", label: "Activities" },
          ],
          filterBy: ["source.channel"],
        },
      ],
    },
    spec_version: 1,
    visibility: "shared",
    favourite_of: [],
    conversation_id: null,
    deleted: null,
    created: stamp(3),
    updated: stamp(3),
  },
];

// ── Views: viewOn + pipeline. Grain is fixed here, so counts are always exact.
const VIEWS = {
  // Grain: one activity. current_stage = status[0].stage.
  demo_activities_report: {
    viewOn: "demo_activities",
    pipeline: [{ $addFields: { current_stage: { $arrayElemAt: ["$status.stage", 0] } } }],
  },
  // Grain: one action. Many-to-one join to its workflow (no fan-out).
  demo_actions_report: {
    viewOn: "demo_actions",
    pipeline: [
      { $lookup: { from: "demo_workflows", localField: "workflow_id", foreignField: "_id", as: "workflow" } },
      { $unwind: { path: "$workflow", preserveNullAndEmptyArrays: true } },
      { $addFields: { current_stage: { $arrayElemAt: ["$status.stage", 0] } } },
    ],
  },
  // Grain: one (action, assignee). Object-array unwind — count = assignments.
  demo_action_assignees: {
    viewOn: "demo_actions",
    pipeline: [
      { $unwind: { path: "$assignees", preserveNullAndEmptyArrays: false } },
      { $addFields: { current_stage: { $arrayElemAt: ["$status.stage", 0] } } },
    ],
  },
  // Grain: one (contact, company). Scalar-FK-array unwind + join to companies.
  demo_contact_companies: {
    viewOn: "demo_contacts",
    pipeline: [
      { $unwind: { path: "$global_attributes.company_ids", preserveNullAndEmptyArrays: false } },
      { $lookup: { from: "demo_companies", localField: "global_attributes.company_ids", foreignField: "_id", as: "company" } },
      { $unwind: { path: "$company", preserveNullAndEmptyArrays: true } },
    ],
  },
  // Grain: one activity, current_stage pre-extracted. Backs the role-gated
  // catalog entry demo_activities_confidential — same data as demo_activities,
  // but the catalog restricts it to holders of the `report-confidential` role,
  // so a viewer without that role gets the WITHHELD alert on any section over it.
  demo_activities_confidential: {
    viewOn: "demo_activities",
    pipeline: [{ $addFields: { current_stage: { $arrayElemAt: ["$status.stage", 0] } } }],
  },
};

async function seedCollection(db, name, docs) {
  await db.collection(name).deleteMany({});
  if (docs.length > 0) await db.collection(name).insertMany(docs);
  console.log(`  ${name}: ${docs.length} docs`);
}

// report_layouts is NOT script-owned: it also holds the Lowdefy seed Apis'
// per-user example reports and any report a user saved by chatting. So the clear
// is scoped to these two fixtures' _ids — a blanket deleteMany would destroy real
// reports — matching how reporting-seed-example-report scopes its own clear.
async function seedReports(db, docs) {
  const ids = docs.map((d) => d._id);
  await db.collection("report_layouts").deleteMany({ _id: { $in: ids } });
  if (docs.length > 0) await db.collection("report_layouts").insertMany(docs);
  console.log(`  report_layouts: ${docs.length} seeded reports (scoped clear)`);
}

async function createView(db, name, { viewOn, pipeline }) {
  // Drop any existing view/collection of this name so re-runs are idempotent.
  try {
    await db.collection(name).drop();
  } catch (err) {
    if (err.codeName !== "NamespaceNotFound") throw err;
  }
  await db.createCollection(name, { viewOn, pipeline });
  console.log(`  ${name}  (view on ${viewOn})`);
}

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db();
  console.log(`Seeding reporting demo domain into "${db.databaseName}"…`);
  await seedCollection(db, "demo_companies", companies);
  await seedCollection(db, "demo_contacts", contacts);
  await seedCollection(db, "demo_activities", activities);
  await seedCollection(db, "demo_workflows", workflows);
  await seedCollection(db, "demo_actions", actions);
  await seedReports(db, reports);
  console.log("Creating views…");
  for (const [name, def] of Object.entries(VIEWS)) await createView(db, name, def);
  console.log("Done.");
} finally {
  await client.close();
}
