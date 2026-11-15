# The HTTP contract

This is the contract `src/js/core/server.js` speaks and `server/server.mjs`
implements. It is written down here so that either side can be replaced without
guessing at the other.

Two rules hold throughout:

* **The session lives in an HttpOnly cookie.** Javascript in the browser never
  sees the token, so it cannot leak through XSS. Every request from the app is
  sent with `credentials: "include"` and carries no `Authorization` header.
* **Nothing a child wrote ever leaves its own state.** The leaderboard, the
  roster and the badge statistics carry sortable numbers and identifiers only.
  `tests/guarded.test.js` pins that with an allowlist, so adding a field to the
  scorecard fails a test until somebody decides it belongs there.

Error bodies are always `{ "error": "<message in Icelandic>" }`. The messages are
shown to the user, which is why they are the one part of this document that is
not in English.

## Authentication

```
GET  /auth/config                             -> { invite: "required"|"optional", google,
                                                   consentAge, privacy, privacyReady }
POST /auth/register   { username, password, name?, invite?, over16, guardian?, consent }
                                              -> 200 { status: "active" }   with a valid invitation
                                              -> 200 { status: "pending" }  open registration only
                                              -> 400 weak password / bad username / bad or
                                                     used-up invitation / consent missing
                                              -> 403 no invitation, and one is required
                                              -> 409 username or nickname taken
                                              -> 429 too many attempts from this address
POST /auth/login      { username, password }  -> 200 { profile } + Set-Cookie
                                              -> 401 wrong username or password
                                              -> 403 pending / blocked
                                              -> 429 too many attempts
POST /auth/logout                             -> 204 + cookie cleared
GET  /auth/me                                 -> 200 { profile, rights }
                                              -> 401 not logged in
GET  /auth/google                             -> 302 to Google / 501 not configured
GET  /auth/google/callback                    -> 302 back into the app
```

**Getting in (v6.3).** By default an **invitation** is required: the
administrator makes a code (`/admin/invites`) that leads to one group, is good
for a set number of accounts and expires. An account made with one is `active`
at once. `FALLASKOLI_OPEN_REGISTRATION=1` restores the older behaviour, where
anybody may ask and the account is `pending` until admitted.

**Consent.** `consent: true` is required. Below `consentAge` (16) `guardian` —
the parent's or guardian's name — is required too, and is what the server keeps
as the record: `{ by, over16, at, how, notice }` on the user. A learner without
that record cannot be made `active` by anybody. See `docs/PRIVACY.md` §3.

`profile` is `{ id, name, username, role, status, created, provider, group,
groupName, share: { board, minutes }, review }`. `rights` is the row from
`ROLES` in `src/js/core/profile.js`; roles are `learner`, `guardian` and
`admin`, and rights are enumerated rather than derived from the role's name.

A wrong password and an unknown username produce the same 401, after the same
amount of work. The login limit is per address and per name-and-address, never
per name alone, so nobody can lock a child out by guessing badly. Behind a
proxy the address is read from `Fly-Client-IP` / `X-Forwarded-For`, and only
when `FALLASKOLI_TRUST_PROXY=1`.

Sessions are stored under the SHA-256 of the token; the token itself exists
only in the cookie.

## My own account (v6.3)

The rights the privacy notice promises, without going through anybody.

```
GET  /account            -> { profile, consent, retention, canDelete }
GET  /account/export     -> everything held about me, as a file
POST /account/name       { name }                 -> { ok, profile }      2–24 chars, unique in the group
POST /account/password   { current, password }    -> { ok }               logs out every OTHER device
POST /account/share      { board, minutes }       -> { ok, share }
POST /account/delete     { password } | { username }  -> 204 + cookie cleared
```

`share` is who sees me, and it starts as nobody: `board` puts the user on the
leaderboard and roster **of their own group**; `minutes` additionally shows time
practised. `/account/delete` erases the account, the progress and every other
trace (`store.eraseUser`) — the same erasure the administrator's delete and the
retention sweep use. An administrator cannot delete their own account.

## State

```
GET    /state/:id   -> 200 the whole state            + X-State-Rev: <n>
                    -> 404 no state yet
                    -> 403 not yours
PUT    /state/:id   <- the whole state  [If-Match: "<n>"]
                    -> 200 { ok: true, rev }          + X-State-Rev
                    -> 409 { error, rev, state }      somebody else wrote since revision n
                    -> 413 larger than 2 MB
DELETE /state/:id                                     -> 204
```

`:id` is the user's id from `/auth/me`, not a name. A child may only touch its
own state; an administrator may touch anyone's. That is checked on every request.

**Revisions (v6.3).** Every stored state has a revision number. A device sends
the revision it last saw in `If-Match`; if the server has moved on, nothing is
written and the answer is 409 with what the server holds. The program then
merges three ways — what it last agreed with the server, what it has, what the
server has (`src/js/core/merge.js`) — and writes the result. Before this the
last write won, and a phone left open could erase an evening's work on a
laptop. A PUT with no `If-Match` is unconditional (used only for the very first
upload).

**What is stored is not what arrived.** `server/guard.mjs` rebuilds the state
field by field: unknown keys are dropped, numbers are bounded, badge ids must
exist, days must be dates not in the future, and `profile` and `allowed` are
overwritten from the server's own records. Separately, a state whose numbers
practice does not produce (4,000 XP in a day; XP rising without a day to account
for it; a day from last spring growing) is still stored, but its owner gets
`review` set and is left off the board until an administrator clears it.

`migrate()` in `core/state.js` makes sure older states are not lost, so the
server does not need to know about versions.

## Leaderboard, roster and rarity

```
GET /leaderboard?metric=week|level|xp|badges|words|vocab|minutes  -> [ scorecard, ... ]
GET /leaderboard?include=badges                       -> the same, with the badge lists
GET /roster                                           -> [ { profile, name, level,
                                                             crest, crown, badgeIds,
                                                             title, showcase, tiers,
                                                             newIds, firstIds } ]
GET /social                                           -> { week, lastWeek: { week,
                                                           champions, podium, players } }
GET /badges/stats                                     -> { users, qualified, badges,
                                                           words, measurable,
                                                           minUsers, minDays }
```

The default metric is `week`: XP earned since Monday, from the day records. A
scorecard row carries `week`, `title` and `showcase` on every metric; `level`
is the best level the user has ever reached.

What users see of each other (v6.1) is all ids and numbers, and
`src/js/core/social.js` is the one module that defines it:

| field | shape | meaning |
|---|---|---|
| `week` | number | XP earned this week (Monday–Sunday) |
| `title` | `rank:<n>` or `badge:<id>` | the title the user chose; never text |
| `showcase` | up to 3 badge ids | pinned badges — only ones the state holds |
| `tiers` | `{ badgeId: 1\|2\|3 }` | medal on a badge won 3 / 10 / 25 times |
| `newIds` | badge ids | first won this week |
| `firstIds` | badge ids | this user won it before anyone else visible |
| `vocab` | number | v6.6: the vocabulary score — words found, more for words held well, nothing for a word in trouble (`core/wordhealth.js` `vocabScore`) |
| `health` | whole percent or `null` | v6.6: share of the judged words not in trouble; `null` below 20 judged words |
| `rescued` | number | v6.6: how many different words a rescue drill has saved |

`newIds` and `firstIds` are computed on the server from the dates in the
states. **The dates are not sent**, and neither is which day of the week
anything happened. `/social` names the profile ids that led last week
(`champions`, when at least 3 played) and the top three (`podium`, when at
least 5 played) — ids and a head count, no scores.

**Who is on these lists (v6.3).** One function, `visibleStates` in
`server/server.mjs`, decides it for the board, the roster and `/social` alike.
A user is there only if they are active, **in the asking user's own group**,
have switched `share.board` on, have not been taken off by the administrator,
and are not held for review. `minutes` is `null` unless the user switched that
on as well, and `?metric=minutes` lists only those who did. The scorecard no
longer carries `updated` (the day somebody last practised): it was a date, and
the sentence above says none is sent. `/badges/stats` is different on purpose:
it is an anonymous count over every active user on the server.

`scorecard` is defined in `src/js/core/leaderboard.js`, and `rank()` in the same
module does the ordering — so the server and the browser run the same code and
produce the same order.

`/badges/stats` is what makes rarity real rather than estimated. `badges` and
`words` are counts of *qualified* users (users with at least `minDays` active
days), and `measurable` is true once there are at least `minUsers` of them. Below
that threshold the app falls back to the base rarity computed in
`src/js/core/rarity.js`, and says so. The aggregation itself is
`aggregate()` in that module, imported by the server, so the two cannot drift.

## Duels (v6.7)

Only between users in the same group who are both on the leaderboard
(`share.board`), the same rule as `/leaderboard`. See `src/js/core/duel.js`.

```
GET  /duels                          -> { duels: [ view, ... ], canChallenge: [ { id, name } ], shown,
                                          sizes: [10,20,30], hours: 24, maxOpen: 10 }
POST /duels   { opponent, topic, n } -> { ok, duel: view }   400 bad topic/size · 403 not on the board
                                                              404 not challengeable · 409 10 open duels
POST /duels/:id/result { c, n, sig } -> { ok, duel: view }   once per player, before the deadline
```

A `view` is `{ id, challenger, opponent: { id, name }, topic, n, seed, level, data, created,
deadline, status: open|done, mine: {c,n}|null, theirs: {c,n}|null, theyPlayed, outcome: w|l|t|null,
sameQuestions }`. `theirs` is withheld until the viewer has answered or the duel is over.
The questions are not stored: both browsers build them from `seed` and `level`. Void duels
(nobody answered within 24 hours) are deleted on the next read; finished ones after 30 days.
Erasing a user erases their duels; `/account/export` includes them.

## Error reports (v6.8)

```
POST   /reports              { kind, note, ctx } -> { ok, id }   kind: villa|setning|skyring|annad
                             400 unknown kind · 401 not logged in · 429 over 40 today
GET    /admin/reports        -> [report + byName]                 canAdminUsers
POST   /admin/reports/:id    { status?, adminNote? } -> { ok, report }   status: ny|villa|ekkivilla|lagad
DELETE /admin/reports/:id    -> { ok }                            audited
```

`note` is cut at 2,000 characters; `ctx` (the snapshot built by
`src/js/ui/reports.js`) at 60 kB. Reports are in `/account/export` as
`errorReports`, are erased with the account, and are part of the backup.

## Word definitions

```
GET /definitions?bin_id=7181&lemma=hommi -> 200 { def, example, source }
                                         -> 404 no data set / no definition
```

See `docs/DEFINITIONS.md`. The endpoint takes `bin_id` rather than the lemma, so
that homographs (*ljós* the noun and *ljós* the adjective) get their own
definitions. `lemma` is only a fallback.

## Administration

Every route here requires the corresponding right; without it the answer is 403.
Every change is written to the audit trail, by id.

```
GET    /admin/users                -> [ user, ... ]  with group, lastSeen, consent, needsConsent,
                                      review { at, why }, expires — never a password hash
POST   /admin/users                { username, name?, group?, role?, over16 | guardian }
                                   -> { ok, user, password }   the password is generated, shown once
POST   /admin/users/:id            { status?, role?, name?, group?, consent?: { over16 | guardian },
                                     review?: false }          -> { ok, user }
DELETE /admin/users/:id            -> 204   erases everything about the user
POST   /admin/users/:id/password   -> { ok, password }         new generated password; logs them out
GET    /admin/users/:id/export     -> everything held about the user, as a file
GET    /admin/leaderboard          -> { hidden: [ id, ... ], metrics }
POST   /admin/leaderboard          { hidden: [ id, ... ] } -> { ok, hidden }
GET    /admin/invites              -> [ { id, code, group, note, max, uses, exp, live } ]
POST   /admin/invites              { group?, note?, max?, days? } -> { ok, invite }
DELETE /admin/invites/:id          -> 204
GET    /admin/groups               -> [ { id, name, users } ]
POST   /admin/groups               { name } -> { ok, group }
POST   /admin/groups/:id           { name } -> { ok }
DELETE /admin/groups/:id           -> 204   only when empty; never "default"
GET    /admin/audit                -> the last 200 entries, newest first: { at, by, act, target?, note? }
POST   /admin/backup               { passphrase } -> one encrypted file (server/backup.mjs)
GET    /admin/policy               -> the default ceiling            (administrator only)
PUT    /admin/policy               { policy }                        (administrator only)
GET    /admin/users/:id/policy     -> that user's ceiling
PUT    /admin/users/:id/policy     { policy | null }
GET    /admin/dataset              -> { uploaded, entries?, uploadedAt? }
PUT    /admin/dataset              <- the whole definition map -> 200 { ok, entries }
```

An administrator cannot block, demote or delete themselves, and there are at
most **two** administrators: one to run it and one who can get back in.

A learner cannot be set `active` until consent is recorded; `consent` and
`status` may be sent in the same request.

**A guardian** (`canEditCurriculum` without `canAdminUsers`) may set the ceiling
of a learner **in their own group** and nothing else — not the default, not
another group. Until v6.3 a guardian could change the default for everybody.

Taking a user off the leaderboard touches the display only, and works in one
direction: the administrator can hide somebody, and cannot show somebody who
has not chosen to be shown.

The data set goes up in **one** PUT with the whole map, and its status comes back
from **one** GET. That is the owner's requirement, verbatim.

## Retention

No route — the server does it: at start-up and twice a day it erases requests
for access unanswered for 30 days and accounts nobody has logged in to for 18
months (administrators excepted). Both numbers are settings, and the privacy
notice prints the same ones. See `docs/PRIVACY.md` §6.

## The privacy notice

```
GET /personuvernd   -> the notice, in Icelandic (a self-contained page)
GET /privacy        -> 302 to it
```

## Every response

carries `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, and over https `Strict-Transport-Security`. The program
itself is sent brotli- or gzip-compressed with an `ETag`, so an unchanged build
costs a returning browser one 304. A writing request whose `Origin` is another
site is refused with 403 before any route sees it.

## Health

```
GET /health   -> { ok, version, users, active, pending, dataset, google, privacy }
GET /heilsa   -> the same (the original name, kept so existing monitoring works)
```

Requires no session; it exposes counts, not people.
