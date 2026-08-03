# Task 5: Even up the workspace columns and format card volumes to 2 decimals

> **As built — two divergences.** The formatting expression shipped as
> `(v | float(0)).toFixed(2)`, not `(v or 0).toFixed(2)`: `or` guards falsiness
> rather than type and is dead code behind the enclosing `{% if v %}`, while a bare
> `.toFixed()` throws on a non-numeric field. And the Files list below is
> incomplete — `components/deal_list_card.yaml` needed the identical change, since
> the deals *list* page's browse card reads the same `card_fields` var with the same
> `round` flag. See the formatting decision in `design.md`.

## Context

Two small, independent edits to `modules/deals/pages/view.yaml`, grouped because they touch the same
file and are both presentational.

**Columns.** The deal workspace's right-hand area (`workspace_col`) splits into two: `pipeline_col`
holding the workflow progress surface, and `detail_col` holding the detail panel. They are currently
`span: 10` and `span: 14`, so the pipeline — the primary working surface — is the narrower of the two.
The design evens them to 12/12.

**Card numbers.** The left "Active Deals" panel renders each deal through an inline Nunjucks template
in the `selected_deal_id` `ListSelector`. Its meta line iterates the host's `card_fields`, and a field
flagged `round: true` renders through the Nunjucks `round` filter:

```nunjucks
{% if f.date_format %}{{ v | date(f.date_format) }}{% elif f.round %}{{ v | round }}{% else %}{{ v }}{% endif %}
```

Stock Nunjucks `round(precision)` defaults to 0 decimal places and does not pad trailing zeros, so an
annual volume of 12.6 renders as `13`. Lowdefy registers only three custom Nunjucks filters — `date`,
`unique`, `urlQuery` — so there is no number filter to reach for. Templates can call JS methods on
values, which is how other tiles in consuming apps already format quantities.

## Task

**1. Even the workspace columns.** In `view.yaml`'s `workspace_row`, change `pipeline_col`'s layout
`span` from `10` to `12`, and `detail_col`'s from `14` to `12`. Leave both `sm: { span: 24 }`
overrides alone — below 768px the two stack full width, which is correct.

**2. Format the card's rounded fields to 2 decimals.** In the `ListSelector`'s `html` template,
replace `{{ v | round }}` with a `toFixed(2)` method call. Mirror the defensive form used elsewhere in
these codebases rather than calling the method bare:

```nunjucks
{% elif f.round %}{{ (v or 0).toFixed(2) }}
```

The enclosing `{% if v %}` guard already skips empty values, so this is belt-and-braces against a
non-numeric slipping through.

**3. Leave the `card_fields.round` flag a boolean.** Whether it should become a precision number is
recorded as an open question in the design; do not pre-empt it.

**4. Do not add thousands separators here.** The card keeps its abbreviated currency form (`R1.2m`,
produced host-side), so no value on this card needs separators. The one site that does is in the host
app and out of scope.

## Acceptance Criteria

- `pipeline_col` and `detail_col` are both `span: 12`; their `sm` overrides are unchanged.
- No `| round` filter remains in `view.yaml`; the rounded branch uses `(v or 0).toFixed(2)`.
- A `card_fields` entry with `round: true` renders `12.6` as `12.60` and `13` as `13.00`.
- `date_format` and plain-value branches of the same template are untouched.
- `pnpm ldf:b` from `apps/demo` compiles cleanly.

## Files

- `modules/deals/pages/view.yaml` — modify — `pipeline_col`/`detail_col` spans to 12/12; card meta-line rounding to `toFixed(2)`.

## Notes

- **Review these column spans alongside tasks 2 and 4, not alone.** Narrowing the detail column from
  14 to 12 looks like a regression in isolation — it is affordable precisely because task 4 makes the
  open-items sections full width and task 2 caps the related-deals strip to one row, which together
  give back the room. The design treats all of these as one layout change.
- Lowdefy's grid config keys are counterintuitive: the top-level `span` applies from **768px upward**
  (it maps to `--lf-span-md`), while `sm: { span: 24 }` sets the base value used below that. So these
  spans only affect desktop, which is intended.
- Task 6 also edits this file (the new-deal button and the collapse state) and depends on this task
  purely to avoid a conflicting concurrent edit.
