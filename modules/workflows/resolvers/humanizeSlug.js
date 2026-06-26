// Turns an author-defined slug (`send-quote`, `upload_po`, `kickoffCall`) into a
// good Title Case label ("Send Quote", "Upload PO", "Kickoff Call"). This is the
// single helper that makes derived title defaults *good* rather than merely
// mechanical — used by the build-side resolvers (makeWorkflowsConfig,
// makeActionPages) wherever an open-slug title default is computed. Pure: no I/O,
// no runtime deps. The plugin never humanizes — it receives already-resolved titles.

// Base acronym set: a small, uncontroversial set of web/business acronyms that
// are fully uppercased in derived titles. Apps extend this via the
// `title_acronyms` module var (merged in by the resolvers). Kept deliberately
// small — domain acronyms (BOM, SKU, …) come from apps, not from here.
export const BASE_ACRONYMS = [
  "PO",
  "ID",
  "URL",
  "API",
  "CRM",
  "SLA",
  "KPI",
  "VAT",
  "PDF",
  "CSV",
  "FAQ",
  "KYC",
  "RFQ",
];

// Minor words lowercased in the middle of a title (never first or last token).
// Exactly the design's list — do not add to it.
const MINOR_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "from",
  "in",
  "nor",
  "of",
  "on",
  "or",
  "the",
  "to",
  "via",
  "with",
]);

// Split on `-`, `_`, whitespace, and camelCase boundaries (lower/digit → upper).
function splitTokens(slug) {
  return String(slug)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[-_\s]+/)
    .filter(Boolean);
}

function titleCaseToken(token) {
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

/**
 * @param {string} slug — the slug to humanize (e.g. "send-quote").
 * @param {string[]|Set<string>} [acronyms] — app-supplied acronyms merged
 *   (case-insensitively) with BASE_ACRONYMS.
 * @returns {string} Title Case label.
 *
 * Rules, in order:
 *   1. Split on `-`/`_`/camelCase into word tokens.
 *   2. Title-case each token (first upper, rest lower).
 *   3. Minor words are lowercased unless they're the first or last token.
 *   4. Acronyms (base ∪ supplied) are fully uppercased, always — regardless of
 *      position; takes precedence over minor-word lowercasing.
 *   5. The first token always starts with a capital.
 */
export function humanizeSlug(slug, acronyms = []) {
  const acronymSet = new Set(
    [...BASE_ACRONYMS, ...acronyms].map((a) => String(a).toLowerCase()),
  );

  const tokens = splitTokens(slug);

  return tokens
    .map((token, i) => {
      const lower = token.toLowerCase();
      const isFirst = i === 0;
      const isLast = i === tokens.length - 1;

      if (acronymSet.has(lower)) return token.toUpperCase();
      if (!isFirst && !isLast && MINOR_WORDS.has(lower)) return lower;
      return titleCaseToken(token);
    })
    .join(" ");
}

export default humanizeSlug;
