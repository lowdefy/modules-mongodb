/**
 * Turns the save-report sheet's leaf filter inputs into a spec
 * validateReportSpec accepts, run in create-report BEFORE validation. The sheet
 * authors a filter from a catalog field and can post only the two things it
 * knows — the base-collection `field` and, for a looked-up field, the `labelKey`
 * (which label column to show). The validated/stored shape is richer, and two of
 * the validator's rules force this pass to exist rather than letting the sheet
 * post the final shape:
 *
 *   - `labelKey` is NOT an allowed filter key (validateReportSpec strict-key
 *     rejects it), so it is a sheet-only leaf that must be CONSUMED and removed
 *     here — it can never reach the validator.
 *   - Every filter must be bound by at least one data section via that section's
 *     `filterBy` (validateReportSpec throws `filter "…" is not bound by any
 *     section` otherwise), and the sheet cannot compute that binding in config.
 *
 * So this pass, for each filter section: (1) binds the filter's `field` into the
 * `filterBy` of every data section whose collection declares that field in the
 * catalog; (2) derives an `optionsQuery` for a looked-up filter (a non-empty
 * `labelKey`, no `optionsQuery` yet) from the catalog relationship; (3) strips
 * `labelKey` in all cases.
 *
 * Pure — returns a new spec, never mutates the input. Idempotent-safe: a filter
 * already carrying an `optionsQuery` (the agent shape) passes through with only
 * `labelKey` stripped, so the agent route can run this harmlessly too. It does
 * not re-implement validation — an unbound filter, an unqueryable lookup target,
 * a field with no options source all surface from validateReportSpec next.
 */

const DATA_TYPES = ["kpi", "chart", "table"];

function deriveReportSpec({ spec, catalog }) {
  if (!spec || typeof spec !== "object" || !Array.isArray(spec.sections)) {
    return spec;
  }
  const { sections } = spec;
  const cat = catalog ?? {};

  // A data section is bound by a filter field when its collection declares that
  // field in the catalog. Binding a section whose collection lacks the field is
  // wrong — its report-open $match would run the field against a collection with
  // no such path, matching nothing.
  const declaresField = (collection, field) =>
    Boolean(cat[collection]?.fields?.[field]);

  const filterFields = sections
    .filter((section) => section?.type === "filter")
    .map((section) => section.field);

  const boundCollections = (field) =>
    sections
      .filter(
        (section) =>
          DATA_TYPES.includes(section?.type) &&
          declaresField(section.query?.collection, field),
      )
      .map((section) => section.query.collection);

  const derived = sections.map((section) => {
    if (section?.type === "filter") {
      // Strip labelKey in every case — it is a sheet-only leaf, never valid on
      // the shape the validator accepts.
      const { labelKey, ...rest } = section;

      // Derive the optionsQuery only for a looked-up filter that hasn't got one.
      if (labelKey && !rest.optionsQuery) {
        const relationship = boundCollections(section.field)
          .map((collection) => cat[collection]?.relationships ?? [])
          .flat()
          .find((entry) => entry.field === section.field);
        if (!relationship) {
          throw new Error(
            `filter field "${section.field}": labelKey "${labelKey}" was given but no relationship for that field is declared in the catalog.`,
          );
        }
        const { collection, foreignField } = relationship;
        // Computed keys are fine here — the dynamic-key concern is only about
        // building this pipeline in Lowdefy config, which is why it lives here.
        rest.optionsQuery = {
          collection,
          pipeline: [
            { $project: { [labelKey]: 1, [foreignField]: 1 } },
            { $sort: { [labelKey]: 1 } },
          ],
          valueKey: foreignField,
          labelKey,
        };
      }
      return rest;
    }

    if (DATA_TYPES.includes(section?.type)) {
      const collection = section.query?.collection;
      const existing = Array.isArray(section.filterBy) ? section.filterBy : [];
      const filterBy = [
        ...new Set([
          ...existing,
          ...filterFields.filter((field) => declaresField(collection, field)),
        ]),
      ];
      return filterBy.length > 0 ? { ...section, filterBy } : { ...section };
    }

    return { ...section };
  });

  return { ...spec, sections: derived };
}

export default deriveReportSpec;
