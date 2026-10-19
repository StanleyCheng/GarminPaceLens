# GarminPaceLens

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People with Garmin Connect accounts who want to see their own activity and
pace history on desktop and mobile, including iPhone 16 Pro Max.

## Product Purpose

Provide a personal dashboard for training volume, pace, effort, and consistency,
with a complete Garmin-history refresh and a clear last-successful-update time.

## Operating Context

Create an app username and password and connect a Garmin account at sign-up.
Later sign-ins use only the app username and password. Account settings allow
changing the app password with current-password confirmation, changing the
Garmin login and password, or permanently deleting the signed-in account.
Each user's data stays separate.
The `stanley` account can administer existing users and inspect a selected
user's dashboard while keeping its own signed-in session.

## Capabilities and Constraints

- Vercel deployment with Supabase Auth and storage for separate users.
- Pull every Garmin activity page until an empty response, without a count cap.
- Flash a green top-bar dot throughout loading; stop after the full sync ends.
- Keep the refresh control and update date/time in the top-right header on both devices.
- Include run, walk, and hike activities with whole-activity pace from 3:00 to
  20:00 per km. Invalid average heart rate does not erase otherwise valid volume.
- Preserve year/month filtering and monthly aggregation, and provide activity
  type and distance filters for all ten dashboard views.
- Keep the static frontend and dependency-light Python backend.
- Never commit or deploy `.env`, Garmin tokens, or local private activity exports.
- Signup and signin are username-based; no email-based recovery was requested.
- Only the server-verified `stanley` account can list all users and their record
  totals from the last completed import, before dashboard filters.
- Stanley can replace app sign-in passwords, reveal or replace saved Garmin
  passwords, open read-only user dashboards, and delete selected users.
  Existing app passwords cannot be retrieved. Admin Garmin password changes
  preserve completed imported history.
- Account deletion requires the exact username and permanently removes the app
  login and all linked connections, sessions, sync records, and imported history.
  Self-service actions bind the verified signed-in identity on the server.
- The `stanley` username is reserved from public signup.

## Brand Commitments

Use the Garmin Pace Lens name and the supplied `GarminPaceLens.png` artwork
for the app logo and icons. Retain the blue/green interface identity and the
cleaner, more polished interface created using Impeccable.

## Evidence on Hand

Existing dashboard code and icons in `viz/`. Local activity exports exist for
local verification but must not be published as sample content.

## Product Principles

- Account isolation is a requirement, not a preference.
- Progress reports records actually received, and success means the full import finished.
- Failed or interrupted syncs preserve the previous completed dashboard.
- App passwords are stored as unrecoverable hashes. Saved Garmin credentials
  are encrypted at rest; revealing a saved password requires an explicit,
  server-authorized admin action.
