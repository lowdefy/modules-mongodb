/**
 * Seeds a realistic, linked demo domain for the reporting module and creates
 * the read-only MongoDB views the data dictionary queries.
 *
 * Why a script (not a Lowdefy Api like reporting-seed-orders): the MongoDB
 * plugin exposes CRUD requests only — it cannot create a view. View creation is
 * a database DDL operation, so it lives here (and, in production, in a
 * migration). The `mongodb` driver is already a dependency.
 *
 * The engine stays flat and unchanged: it only queries the VIEWS, which bake in
 * the $lookup/$unwind/current-status logic at a fixed, correct grain. Fan-out
 * (which would double-count) is neutralised inside each view definition, never
 * left to whatever the AI composes.
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
};

async function seedCollection(db, name, docs) {
  await db.collection(name).deleteMany({});
  if (docs.length > 0) await db.collection(name).insertMany(docs);
  console.log(`  ${name}: ${docs.length} docs`);
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
  console.log("Creating views…");
  for (const [name, def] of Object.entries(VIEWS)) await createView(db, name, def);
  console.log("Done.");
} finally {
  await client.close();
}
