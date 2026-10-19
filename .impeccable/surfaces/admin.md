---
version: 1
slug: "admin"
primary_target: "admin"
related_targets: ["viz/admin-ui.mjs","viz/account-deletion.mjs","viz/index.html","viz/styles.css","viz/app.js","admin_api.py","api/dashboard.py"]
---

# Stanley administration

Mode: Operate. A local extension of the established dashboard and account
screens; inherit DESIGN.md and keep the existing visual identity.

Stanley selects an existing app user, checks completed-import totals, manages
passwords, or opens that user's read-only dashboard. The top account navigation
keeps Stanley's dashboard, Admin, and Sign out findable. The desktop directory
and selected-user details sit side by side; on phones the details follow the
searchable directory. Selection uses the existing green state, with fine
separators between users and credential sections.

Record totals describe all Garmin records from the last completed import,
before dashboard filters. No completed import means zero; an older snapshot
without a recorded total is unavailable. Keep these states distinct.

App sign-in passwords can be replaced but existing plaintext is unavailable.
Saved Garmin passwords require an explicit reveal action and can be replaced
without erasing completed history. New-password fields have Show/Hide actions.
Clear drafts and revealed values when switching users, leaving administration,
or signing out. Authorization belongs to the server-verified `stanley` account.

Place Delete selected user in a separated section after credentials, using the
existing error red. The shared native dialog names the selected user and the
permanent removal of the login and all linked records. Require the exact typed
username, initially focus Cancel, and support Cancel/Escape before submission.
Lock the dialog during deletion and retain retryable errors. Success refreshes
the directory; deleting Stanley's own account signs out. Public signup cannot
claim the reserved `stanley` name.

A selected-user preview names its subject, states that it is read-only and
that Stanley remains signed in, and offers Back to users and Stanley's dashboard.
Retain the dashboard's filters, view rail, charts, and monthly table. Import and
account-edit controls are unavailable in this preview.

## Direction contract

THESIS: Stanley selects existing users, inspects history, manages credentials,
and explicitly confirms permanent deletion. The directory and selected details
keep the acting account and target visible together.

OWN-WORLD: Inherit the navy/green identity, platform UI type, light flat
surfaces, fine separators, labeled inputs, visible focus, and familiar actions
from the incumbent dashboard and account screens.

STORY: Own dashboard → Admin → select user → credentials, read-only preview,
or deletion confirmation → users, own dashboard, or sign-in after self-deletion.

FIRST VIEWPORT: Clear top return/navigation, then the searchable user directory
with imported-record counts beside selected-user details on desktop. Stack the
directory above details on phones. View dashboard leads the selected-user actions.

FORM: Precisely specified local Operate extension. Concept seed is not applicable
under new-work.md section 3. Reuse familiar controls and a native confirmation
dialog for irreversible action; no new visual world or token system is introduced.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Finish evidence

The latest finish review accepted eight local desktop and phone captures of
admin, account, and deletion states with a ship verdict and no material fixes.
Compared the finished markup, styles, navigation, credential and deletion states
with the incumbent system; earlier read-only preview captures remain reference.
DESIGN.md and its sidecar remain unchanged; pre-existing metadata drift is
outside this extension. Deployment still requires the schema update documented
in docs/vercel-setup.md. No production deployment has been verified.
