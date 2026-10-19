# Admin extension review

Disposition: ship.

Independent Impeccable review inspected the desktop and mobile admin page and
selected-user dashboard captures. All four full-page captures were valid.
The extension matches the existing platform UI font, navy/green palette,
flat surfaces, and fine separators. The directory uses desktop columns and
a mobile stack with contained list scrolling.

The review confirmed visible return paths, selected-user identity, separate
password forms with an honest app-password limitation, explicit Garmin
password reveal, adjacent save feedback, and clearly defined import totals.
Read-only previews hide refresh and account mutation controls while keeping
Stanley's session. No material fixes were requested.

The narrow extension exemption in `new-work.md` section 3 applies. No new
visual world, comp, or concept seed was required. Existing DESIGN.md/sidecar
drift remains advisory and was left unchanged.

Local verification used synthetic accounts only. It covered both password
updates, reveal/clear, failed-save feedback, directory recovery, stale
response cancellation, import totals, empty/search states, read-only preview,
return to Stanley's records, server denial for regular users, and page
overflow at 320px, 390px, and 1440px. No browser page errors occurred.

The Python suite passed 194 tests, the JavaScript suite passed 10 tests,
JavaScript syntax checks and `git diff --check` passed. The new database RPC
has not been applied to production, and this feature has not been deployed.

Captures contain labeled synthetic data:

- `desktop.png`: admin, 1440px.
- `mobile.png`: admin, 390px.
- `preview-desktop.png`: selected user's dashboard, 1440px.
- `preview-mobile.png`: selected user's dashboard, 390px.

## Account settings and deletion extension

A fresh independent review returned **ship** after the user added selected-user
deletion and ordinary account management. All eight required captures were
valid: admin, account settings, self-deletion confirmation, and selected-user
deletion confirmation, each at desktop and mobile widths. Ordinary pages were
captured full-page from the document top; native dialogs were captured within
the viewport so their complete backdrop is represented correctly. No material
fixes were requested. The review did not claim exhaustive backend validation.

The extension retains the incumbent hierarchy, palette, flat fields, and fine
rules. Destructive actions use the existing error color and are separated from
ordinary saves. One shared native dialog names the account, explains permanent
removal, requires the exact username, initially focuses Cancel, prevents repeat
submissions, and provides failure recovery. Self-deletion explicitly states
sign-out. Non-self confirmations omit that description from their accessible
name and description.

Local browser checks passed ordinary app-password validation, change and
subsequent sign-in; Garmin login/password edits; cancellation with Cancel and
Escape; incorrect confirmation; failed deletion and retry; ordinary, admin,
and admin-self deletion; selected-user removal from the directory; preserved
Stanley records; session clearing; mutation locks during import; and layouts
at 320px, 390px, and 1440px. All accounts and data used in these checks were
synthetic. No live accounts were deleted.

Final automated validation passed 218 Python tests and 10 JavaScript tests,
syntax checks for all changed JavaScript modules, and `git diff --check`.
The extension detector reported 32 advisory findings and no non-advisory
findings. Pre-existing design metadata drift remains unchanged.

The new captures are `account-desktop.png`, `account-mobile.png`,
`self-delete-desktop.png`, `self-delete-mobile.png`,
`admin-delete-desktop.png`, and `admin-delete-mobile.png`. The admin directory
captures were refreshed to include deletion. This remains local, uncommitted,
and undeployed; production still requires the documented schema update.
