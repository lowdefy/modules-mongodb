---
"@lowdefy/modules-mongodb-plugins": patch
---

Removed the redundant status-colored dot from workflow actions: the leading bullet on each action in the WorkflowProgress panel, and the dot beside the status text on action events in the EventsTimeline card. The status colour is already carried by the surrounding button/text, so the dot added visual noise. Timeline node markers, group icons, and the standard ActionSteps step list are unchanged.
