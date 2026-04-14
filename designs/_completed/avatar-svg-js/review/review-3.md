# Review 3 — Operator Validity

## Non-existent Operators

### 1. `_math.mod` does not exist — will throw at runtime

> **Resolved.** Shuffle button now uses `_math.random` + `_math.floor` + `_product` (same pattern as random color init — no modulo needed). User-ID hash `_js` block computes `hash % 20` inline; `_get` uses the result directly. Updated design.md, task-02.

The `_math` operator maps directly to JavaScript's `Math` object via `runClass` (`@lowdefy/operators-js/dist/operators/shared/math.js`). The supported methods are defined in a `meta` object: `abs`, `acos`, `acosh`, `asin`, `asinh`, `atan`, `atan2`, `atanh`, `cbrt`, `ceil`, `clz32`, `cos`, `cosh`, `exp`, `expm1`, `floor`, `fround`, `hypot`, `imul`, `log`, `log10`, `log1p`, `log2`, `max`, `min`, `pow`, `random`, `round`, `sign`, `sin`, `sinh`, `sqrt`, `tan`, `tanh`, `trunc` (plus constants `E`, `LN10`, `LN2`, `LOG10E`, `LOG2E`, `PI`, `SQRT1_2`, `SQRT2`).

`mod` is not in this list. `Math.mod` does not exist in JavaScript. `runClass` (line 26-27) will throw: `"_math.mod is not supported, use one of the following: abs, acos, ..."`.

**Occurrences:**

- `design.md` line 261 — shuffle button
- `design.md` line 244 — hash-to-palette lookup (prose reference)
- `tasks/02-user-account-forms.md` line 74 — shuffle button
- `tasks/02-user-account-forms.md` line 116 — hash-to-palette

**Fix:** Replace `_math.mod` with a `_js` expression for the modulo. For the shuffle button:

```yaml
key:
  _js: "return Date.now() % 20;"
```

For the hash-to-palette lookup, the `_js` block already computes the hash — extend it to include the modulo:

```javascript
const id = user("id") || "";
let hash = 0;
for (const c of id) hash += c.charCodeAt(0);
return hash % 20;
```

Then use `_get` with the result directly as the key, dropping the `_math.mod` wrapper.

### 2. `_math.multiply` does not exist — will throw at runtime

> **Resolved.** Replaced `_math.multiply` with `_product` (the correct Lowdefy arithmetic operator). Updated design.md, task-03, task-04.

Same issue. `Math.multiply` is not a JavaScript method and is not in the `_math` meta. The design should use `_product` (listed in CLAUDE.md as an arithmetic operator).

**Occurrences:**

- `design.md` line 226 — random color selection
- `tasks/03-user-admin-forms.md` line 70 — invite random color
- `tasks/04-contacts-forms.md` line 94 — create-contact random color

**Fix:** Replace `_math.multiply` with `_product`:

```yaml
key:
  _math.floor:
    _product:
      - _math.random: true
      - 20
```

## Minor

### 3. Hardcoded palette size (20)

> **Resolved.** Standard-operator cases (random color, shuffle) now use `_array.length: _module.var: avatar_colors` instead of hardcoded 20. User-ID hash `_js` case uses `_build.string.concat` to inject palette length at build time. Updated design.md, task-02, task-03, task-04.

The modulo and multiply operations all hardcode `20` as the palette size (design lines 226, 261, 265; task-02 lines 77, 122; task-03 line 72; task-04 line 96). If the palette grows or shrinks, these all need manual updates and will silently produce wrong results in the meantime.

The existing code (`form_profile.yaml` line 98) also hardcodes `count: 20`, so this is an inherited pattern. But since the design is rewriting these blocks, it's a good opportunity to derive the count from the palette itself.

**Fix:** For `_js` blocks (shuffle, hash), pass the palette length as a var or compute modulo against the array length. For standard-operator blocks, this may require nesting that isn't worth the complexity — hardcoding 20 with a comment is acceptable if a dynamic approach is too verbose.

### 4. Confirmed: `state()` function call syntax in `_js` is correct

> **Accepted.** Informational — confirms the design's `state('...')` syntax is correct. No changes needed.

For the record: the client-side `_js` operator (`@lowdefy/operators-js/dist/operators/client/js.js`, lines 46-49) provides `state` as a **function** — `state(p)` calls `operators._state({ ...operatorContext, params: p })`. The design's `state('{{ prefix }}.given_name')` syntax is correct.

Note: commit `0982979` changed data-upload `_js` code from function calls to dot notation (`state.property` instead of `state('property')`). This was described as a fix, but the operator source confirms function calls are the correct API. The dot-notation pattern in data-upload accesses properties on a function object and will return `undefined` — this is a separate bug outside this design's scope.
