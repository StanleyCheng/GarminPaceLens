# App languages

The header switches between English and Hong Kong Traditional Chinese (`zh-HK`).
English is the default. The browser remembers the choice with
`garminpacelens.language`, including after signing out. Blocked browser storage
does not prevent switching during the current visit.

App copy includes authentication, accounts, administration, deletion dialogs,
local exports, sync feedback, validation, accessible labels, all ten charts,
hover text, dates, month selectors, and the monthly table. The Garmin Pace Lens
brand, usernames, uploaded filenames, original activity names, and stored records
keep their original values. Metric symbols and pace notation stay the same.

Switching updates the document language and text without reloading the page or
resetting the current screen, form values, selected user, filters, or active import.
Charts rebuild their display labels while retaining the same calculations.

## Adding copy

`viz/i18n.mjs` contains English source messages and their Chinese translations.
Initial authored HTML text and accessible attributes bind once, before account
or activity data loads. For dynamic copy, use `setText` or `setLabel` with an
English message. For variable content, pass `message(source, { namedFields })`.
Wrap a nested app message in `message`; leave user data as plain values. Do not
translate by scanning imported records, credential fields, or generated chart DOM.

Chart builders use `t` when building their display specifications. Language
listeners refresh chart labels and date formatting without reopening screens or
calling account endpoints. Add translations for new public API error messages;
unrecognized service errors use a translated retry message.

Run `node --test tests/test_*.mjs` for catalogue coverage, token preservation,
language persistence, and unchanged chart calculations. Browser checks should
also exercise both languages on desktop and mobile, switching during a sync,
filled forms, admin selection, and local export viewing.
