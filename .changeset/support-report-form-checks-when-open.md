---
"@lowdefy/modules-mongodb-support": patch
---

**support:** a closed report drawer no longer blocks a page's Save. The report form's required fields counted even while its drawer or the help panel was shut, so on a page that mounts `report-drawer` any `Validate` without `params` failed on the empty report and the page's own Save or Create did nothing. The form's checks now hold only while its drawer or panel is open.
