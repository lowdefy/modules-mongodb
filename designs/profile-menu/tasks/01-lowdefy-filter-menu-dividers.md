# Task 1: Lowdefy API — Pass `MenuDivider` Through `filterMenuList`

## Context

This task lands in the upstream Lowdefy monorepo (`/Users/sam/Developer/lowdefy/lowdefy`), **not** in `modules-mongodb`. It is a prerequisite for the Profile Menu work in `modules-mongodb` and must be merged and released before the consumer-side tasks can ship.

The modules-mongodb Profile Menu redesign routes the header profile dropdown through a top-level app-level menu (`id: profile`), so it runs through Lowdefy's server-side RBAC filter (`filterMenuList`). The dropdown composition — Profile link, divider, Logout link, plus any app-level links — includes `MenuDivider` items for visual separation between custom consumer links and the Logout action.

The current `filterMenuList` at `packages/api/src/routes/rootConfig/menus/filterMenuList.js` only preserves `MenuLink` items (when `authorize` passes) and `MenuGroup` items (when non-empty after recursion). Every other type — including `MenuDivider` — falls through to `return null` and is stripped. That means a divider-containing menu like `[Profile, Divider, Logout]` becomes `[Profile, Logout]` before render, breaking the designed layout.

Current implementation (`packages/api/src/routes/rootConfig/menus/filterMenuList.js`):

```js
import { get } from '@lowdefy/helpers';

function filterMenuList(context, { menuList }) {
  const { authorize } = context;
  return menuList
    .map((item) => {
      if (item.type === 'MenuLink') {
        if (authorize(item)) {
          return item;
        }
        return null;
      }
      if (item.type === 'MenuGroup') {
        const filteredSubItems = filterMenuList(context, {
          menuList: get(item, 'links', { default: [] }),
        });
        if (filteredSubItems.length > 0) {
          return {
            ...item,
            links: filteredSubItems,
          };
        }
      }
      return null;
    })
    .filter((item) => item !== null);
}

export default filterMenuList;
```

Tests live alongside the implementation at `packages/api/src/routes/rootConfig/menus/getMenus.test.js`.

## Task

Update `filterMenuList` to preserve `MenuDivider` items and then clean up the three orphan-divider cases that fall out of the filter (leading, trailing, and consecutive dividers).

**1. Modify `packages/api/src/routes/rootConfig/menus/filterMenuList.js`:**

Add a third branch to the `.map` that returns `MenuDivider` items as-is, then pass the filtered list through a new `cleanDividers` helper before returning.

```js
import { get } from '@lowdefy/helpers';

function filterMenuList(context, { menuList }) {
  const { authorize } = context;
  const filtered = menuList
    .map((item) => {
      if (item.type === 'MenuLink') {
        return authorize(item) ? item : null;
      }
      if (item.type === 'MenuGroup') {
        const filteredSubItems = filterMenuList(context, {
          menuList: get(item, 'links', { default: [] }),
        });
        if (filteredSubItems.length > 0) {
          return { ...item, links: filteredSubItems };
        }
        return null;
      }
      if (item.type === 'MenuDivider') {
        return item;
      }
      return null;
    })
    .filter((item) => item !== null);
  return cleanDividers(filtered);
}

function cleanDividers(items) {
  let start = 0;
  while (start < items.length && items[start].type === 'MenuDivider') start++;
  let end = items.length;
  while (end > start && items[end - 1].type === 'MenuDivider') end--;
  const result = [];
  for (let i = start; i < end; i++) {
    const item = items[i];
    if (
      item.type === 'MenuDivider' &&
      result[result.length - 1]?.type === 'MenuDivider'
    ) {
      continue;
    }
    result.push(item);
  }
  return result;
}

export default filterMenuList;
```

`cleanDividers` rules:

- **Strip leading dividers** — a divider at the top of a dropdown has nothing to divide.
- **Strip trailing dividers** — a divider at the bottom has nothing to divide.
- **Collapse consecutive dividers** — two dividers in a row (which can happen when the only link between them was filtered out) collapse to one.

Cleanup must run at every recursion level, so the same behaviour applies inside `MenuGroup.links` (it does — `cleanDividers` is invoked on the filtered result of the recursive call path via the return statement).

**2. Add tests to `packages/api/src/routes/rootConfig/menus/getMenus.test.js`:**

Follow the existing test style in that file. Cover:

- Divider between two authorised links survives.
- Divider between an authorised and an unauthorised link: when the unauthorised link is dropped, the now-orphan divider is stripped.
- Leading divider is stripped.
- Trailing divider is stripped.
- Two consecutive dividers collapse to one.
- Divider inside a `MenuGroup` is preserved when the group has remaining authorised links.

## Acceptance Criteria

- `filterMenuList.js` passes `MenuDivider` items through the `.map` step and runs results through `cleanDividers`.
- `cleanDividers` strips leading/trailing dividers and collapses consecutive dividers.
- All six new test cases pass.
- All existing tests in `getMenus.test.js` still pass.
- Menus without any dividers produce identical output to the pre-change implementation (backward compatible).
- Run `pnpm --filter @lowdefy/api test` (or the repo's equivalent) from the Lowdefy repo root and confirm the suite is green.

## Files

- `/Users/sam/Developer/lowdefy/lowdefy/packages/api/src/routes/rootConfig/menus/filterMenuList.js` — modify — add `MenuDivider` branch, add `cleanDividers` helper, invoke it before returning.
- `/Users/sam/Developer/lowdefy/lowdefy/packages/api/src/routes/rootConfig/menus/getMenus.test.js` — modify — add the six test cases listed above.

## Notes

- This task ships in a separate PR against the Lowdefy repo. The commit message / PR title should make clear this is a backwards-compatible fix (existing menus without dividers are unaffected) suitable for a patch or minor release of `@lowdefy/api`.
- After this change is released on npm, the `modules-mongodb` release that lands the Profile Menu redesign must pin a Lowdefy version that includes the fix. Update `apps/demo/package.json` accordingly in Task 3 or in the release PR — whichever is closer to the demo app's dependency bump.
- Do not make any changes in the `modules-mongodb` repo as part of this task.
