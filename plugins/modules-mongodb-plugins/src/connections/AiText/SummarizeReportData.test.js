import SummarizeReportData, { buildPrompt } from "./SummarizeReportData.js";

test("the prompt names the scope as the reading's subject only when filters are active", () => {
  const filtered = buildPrompt({
    title: "Revenue",
    description: "By region.",
    scope: "Region: EU",
    hasFilters: true,
    sections: [{ id: "s0", type: "kpi", label: "Total", rows: [{ t: 1 }] }],
  });
  expect(filtered).toContain("Report: Revenue");
  expect(filtered).toContain("Description: By region.");
  expect(filtered).toContain("Active filters");
  expect(filtered).toContain("Region: EU");
  expect(filtered).toContain('"label":"Total"');

  const unfiltered = buildPrompt({
    title: "Revenue",
    scope: "All data — no filters applied",
    hasFilters: false,
    sections: [],
  });
  expect(unfiltered).not.toContain("Active filters");
  expect(unfiltered).not.toContain("Description:");
  expect(unfiltered).toContain("Scope: All data — no filters applied");
});

// The one contract that differs from GenerateChatTitle: this call answers a
// click, so a missing key is an error the viewer sees, not a silent null.
test("throws rather than returning null when the connection has no apiKey", async () => {
  await expect(
    SummarizeReportData({
      connection: {},
      request: { title: "Revenue", scope: "x", sections: [] },
    }),
  ).rejects.toThrow(/apiKey/);
});

test("throws on a missing title before reaching the gateway", async () => {
  await expect(
    SummarizeReportData({
      connection: { apiKey: "k" },
      request: { scope: "x", sections: [] },
    }),
  ).rejects.toThrow(/title/);
});
