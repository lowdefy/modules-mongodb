import { test, expect } from "../fixtures.js";

// Two-org isolation of the company hierarchy traversal — the authored
// $graphLookup (tenant wall amendment-1, docs/shared/org-scoping.md).
//
// `get_descendant_company_ids` declares `tenant: authored` and authors the
// org equality in the $graphLookup's restrictSearchWithMatch; the wall AUDITS
// that clause against the caller's org on every run, and MongoDB enforces it
// on every traversal step. Unlike $search, $graphLookup runs on the e2e
// harness's in-memory MongoDB, so this is the one amendment-1 surface
// provable end-to-end in this repo.
//
// The threat this proves against: $graphLookup walks its target collection BY
// NAME, so without the restrict clause a document in another organization
// claiming one of ours as its parent would ride into the traversal. The
// dropdown the page builds from the result is additionally walled (its own
// request filters by org), which would MASK a traversal leak in the UI — so
// the assertions read the traversal's response payload directly, not the
// rendered options.
//
// Same conventions as tenant-isolation.spec.js: one self-contained test (the
// shared in-memory MongoDB makes parallel seeding self-destructive), both
// directions proven, positive result first (the page and traversal provably
// work) so the exclusions are meaningful.

const ORG_A = { organizationId: "org-a", email: "a@example.com" };
const ORG_B = { organizationId: "org-b", email: "b@example.com" };

function company({ _id, organizationId, name, parent_ids = [] }) {
  return { _id, organizationId, name, parent_ids };
}

async function editAs(ldf, page, caller, companyId) {
  const captured = [];
  const listener = async (res) => {
    if (res.url().includes("get_descendant_company_ids")) {
      try {
        captured.push(await res.json());
      } catch {
        // non-JSON (canceled) responses are not the request result
      }
    }
  };
  page.on("response", listener);
  await ldf.user({
    name: caller.email,
    email: caller.email,
    roles: ["admin"],
    ...caller,
  });
  await ldf.goto(`/companies/edit?_id=${companyId}`);
  // The traversal fires in the page's onMount fetch — wait for its response.
  await expect
    .poll(() => captured.length, { timeout: 10000 })
    .toBeGreaterThan(0);
  page.off("response", listener);
  return captured[0]?.response?.[0]?.ids ?? [];
}

test("the authored $graphLookup walls the company hierarchy traversal by organization", async ({
  ldf,
  page,
  mdb,
}) => {
  // One seed call so both organizations' fixtures coexist. Each org has a
  // root and a legitimate child; each root ALSO has a cross-org document
  // claiming it as parent — the exact shape that would leak into the
  // traversal without the authored restrict clause.
  await mdb.seed("companies", [
    company({ _id: "C-A-ROOT", organizationId: "org-a", name: "Acme Root" }),
    company({
      _id: "C-A-CHILD",
      organizationId: "org-a",
      name: "Acme Child",
      parent_ids: ["C-A-ROOT"],
    }),
    company({ _id: "C-B-ROOT", organizationId: "org-b", name: "Globex Root" }),
    company({
      _id: "C-B-LEECH",
      organizationId: "org-b",
      name: "Globex Leech",
      parent_ids: ["C-A-ROOT"], // claims org A's root as parent
    }),
    company({
      _id: "C-A-LEECH",
      organizationId: "org-a",
      name: "Acme Leech",
      parent_ids: ["C-B-ROOT"], // claims org B's root as parent
    }),
  ]);

  // Org A edits its root: the traversal finds the legitimate child (the
  // request works end-to-end — the audit accepted the authored clause), and
  // does NOT pick up org B's claimant.
  const idsA = await editAs(ldf, page, ORG_A, "C-A-ROOT");
  expect(idsA).toContain("C-A-CHILD");
  expect(idsA).not.toContain("C-B-LEECH");

  // Symmetric: org B edits its root — org A's claimant stays outside.
  const idsB = await editAs(ldf, page, ORG_B, "C-B-ROOT");
  expect(idsB).toContain("C-B-ROOT");
  expect(idsB).not.toContain("C-A-LEECH");
});
