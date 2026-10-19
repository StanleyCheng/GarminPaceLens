---
version: 1
slug: "account"
primary_target: "account"
related_targets: ["viz/account-deletion.mjs","viz/index.html","viz/styles.css","viz/app.js","api/dashboard.py","supabase_store.py"]
---

# Account settings

Mode: Operate. Extend the incumbent account screen and DESIGN.md.

Every signed-in user can manage their own account. Preserve the single-column
form and Back to dashboard navigation. Order the page as app sign-in password,
Garmin connection and verification, then a separated deletion section. Reuse
the navy/green identity, platform UI type, light flat surfaces, fine rules,
labeled fields, visible focus, and error red for destructive actions.

Changing the app password requires the current password and a new password;
existing app password plaintext is unavailable. Editing the Garmin login and
password follows Save and import history. Lock account controls while an import
or mutation is running. Self-service requests act only on the verified signed-in
identity, independent of any browser-supplied user ID.

Delete my account opens the shared native dialog, names the account and permanent
consequences, and requires the exact username. Initially focus Cancel. Escape
and Cancel dismiss before submission; lock controls while deletion runs and
show retryable errors. Successful deletion removes the app login and all linked
records, clears the session and dashboard, and returns to sign-in.

## Direction contract

THESIS: Account ownership and permanent deletion are explicit in the user's
own account settings, with a distinct confirmation before irreversible action.

OWN-WORLD: Inherit navy/green, platform UI typography, light flat surfaces,
fine separators, familiar fields and buttons, and error red for deletion.

STORY: Dashboard → Account → scoped credential edits or deletion confirmation
→ account feedback, return to dashboard, or sign-in after deleting the account.

FIRST VIEWPORT: Familiar account navigation and Back to dashboard lead the
single-column form. App password comes first, followed by Garmin connection;
permanent deletion is separated below the account fields.

FORM: Precisely specified local Operate extension using familiar controls and
a native dialog. Concept seed and comp are not applicable under new-work.md
section 3; retain the incumbent visual system.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Finish evidence

The latest review returned ship after eight valid local admin, account, and
deletion captures at desktop and phone sizes, with no material fixes. Verification
used synthetic accounts; no live accounts were deleted. The feature remains
local and undeployed. DESIGN.md, its sidecar, and the dashboard brief are preserved.
