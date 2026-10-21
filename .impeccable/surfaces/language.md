---
version: 1
slug: "language"
primary_target: "viz/i18n.mjs"
related_targets: ["viz/index.html", "viz/styles.css", "viz/app.js", "viz/insight-ui.mjs", "viz/insights.mjs", "viz/admin-ui.mjs", "viz/account-deletion.mjs"]
---

# English and Traditional Chinese

Mode: Operate. Extend the incumbent static dashboard, account, and admin screens.

The user approved Hong Kong Traditional Chinese, retaining the Garmin Pace Lens
brand, a destination-language button, English as the default, browser-local
persistence, localized dates and calendar names, unchanged original user data,
and familiar metric symbols and pace notation.

## Direction contract

THESIS: Change every app-authored label and message into the selected language
without interrupting the user's current work.

OWN-WORLD: Inherit the navy/green palette, supplied logo, platform typography,
flat panels, explicit form labels, visible focus, and generous tap targets.

STORY: Open any screen → choose 繁中 or English in the header → continue the
same task with the same form values, filters, selected user, and sync state.

FIRST VIEWPORT: The destination-language button is at the top right. Desktop
keeps metadata and refresh alongside it; phones place metadata and refresh on
a second row. Admin retains the toggle when its refresh group is hidden.

FORM: A narrow Operate refinement of the existing interface. No replacement
visual world, concept seed, comp, new illustrations, or new token system.

## Verification

Use synthetic data and accounts for desktop and phone captures. Exercise all
ten charts, filled signup/account/admin forms, user previews, errors, deletion
confirmation without submitting deletion, and switching during an active sync.
Verify saved preference after reload and sign-out. Keep actual credentials and
private activity exports out of captures and source control.

## Finish evidence

The independent finish review returned `ship` with no material fixes after
reviewing desktop and phone captures of the dashboard, admin, account, and
sign-in screens. Verification passed 218 Python tests and 16 JavaScript tests,
all ten chart views, both languages at widths from 320 to 1440 pixels, retained
forms and filters, admin previews, switching during sync and save requests,
local export success/errors, and blocked browser storage. The detector reported
zero primary issues; its advisories concern the incumbent type sizes and tonal
colors. Captures and the detector report are in `output/playwright/language/`.
At review time, the changes were local and had not been deployed.
