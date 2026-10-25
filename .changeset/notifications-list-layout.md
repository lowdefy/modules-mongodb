---
"@lowdefy/modules-mongodb-notifications": minor
"@lowdefy/modules-mongodb-layout": minor
---

The notifications inbox has a one-column layout. Set `layout: list` in the module's vars for no card and no reading pane: Unread and All tabs with counts, one Filter button (views, date presets, search past about ten notifications), Mark all as read as a text link that goes at zero, and rows with a grey icon from your `event_types` enum, a gold unread dot, the title, one preview line and the date. Rows sit under This week and Earlier with true counts and "Show 25 more of N". Notifications of the same type on the same day group into one row that opens in place. A row with a link target opens it through the link page. A row without one opens in place only when its body says more than its preview, with a button to the page named by the type's `fix` entry; otherwise it does not open. The new `empty` var sets the line shown for each view.

The three-column inbox stays the default, so an app that does not set `layout` sees no change. The Sound switch is also available as the new `sound-action` component; in the list layout it is a `page_actions` entry. The layout page component now draws `page_actions` in a slim row when a page hides its title, where before they were not drawn at all. An `event_types` entry may carry `group_title` (with `{n}` for the count) and `fix` (`{ title, pageId, query }`); both are read only by the list layout.
