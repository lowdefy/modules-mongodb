---
"@lowdefy/modules-mongodb-ai-reporting": patch
"@lowdefy/modules-mongodb-plugins": patch
---

ai-reporting: a loading state when switching conversations, a report chip that steps aside once a report exists, and the report header's icons bundled wherever the module is used

**Switching conversations shows a skeleton.** Selecting a conversation in the rail blanked the transcript and the results panel until the read came back, with nothing to say a read was in flight — an empty chat, or "Nothing here yet", for a conversation full of results. The switch now raises a loading state: a skeleton stands in for the transcript (taking the composer with it, so nothing can be sent into a half-loaded conversation) and for the panel's cards, and only the response for the conversation still selected lowers it, so a rapid A → B → A ends on A's transcript with no flash of B. Switching away from, or starting a new chat over, a reply that is still streaming aborts the stream first, so partial content cannot land in the conversation being opened. A read that fails lowers the state rather than leaving the skeleton up.

**The "Turn this conversation into a report" chip hides once a report exists.** It kept offering to create one under a conversation that already had, which read as noise and as an invitation to save a duplicate. It is now keyed to the same signal the panel's **Reports from this chat** band renders from: shown while the conversation has no saved report, gone the moment one is saved (from the sheet or by the agent, no reload), back on a conversation that has none. The composer still reaches `generate_report` for a second report. No "update the report" chip replaces it — the agent has no tool that edits a saved report.

**The report header's icons are bundled.** Lowdefy collects icon imports by scanning the static page config, and the report header is compiled at runtime, so an icon named nowhere else in the consuming app — the ⋯ menu's `AiOutlineEllipsis`, typically — shipped as the exclamation-circle fallback. The report page now lists every icon the compiler emits, so the bundle carries them wherever the module is used; consumers that added a `global` list of these names as a workaround can drop it. The plugin's declared-types test asserts the list stays complete.
