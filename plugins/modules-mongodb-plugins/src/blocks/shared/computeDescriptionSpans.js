// Computes the antd Descriptions.Item `span` for each field so that
// full-width fields (rich text, long text, maps, nested objects) always
// occupy their own row spanning every column.
//
// antd packs Descriptions items greedily left-to-right and, rather than
// wrapping an item that would overflow the row, truncates its span to the
// leftover columns. So a full-width field landing mid-row (e.g. after a
// single-column Contact in a 2-column grid) would only fill the remaining
// column — appearing half-width — when rendered with span="filled".
//
// To guarantee a clean full-width row we (a) close any partial row above the
// field by expanding its last item with "filled", then (b) give the field a
// span equal to the column count so it stands alone across the whole row.
function computeDescriptionSpans(fields, column) {
  const spans = fields.map(() => 1);
  let used = 0;

  fields.forEach((field, i) => {
    if (field.fullWidth) {
      // Complete the partial row above so this field starts fresh.
      if (used > 0) spans[i - 1] = "filled";
      spans[i] = column;
      used = 0;
    } else {
      used += 1;
      if (used >= column) used = 0;
    }
  });

  return spans;
}

export default computeDescriptionSpans;
