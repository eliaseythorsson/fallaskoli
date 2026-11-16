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
  scorecard fails a test until somebody decides it belongs there. Two
  exceptions, both the sender's own act or opt-in: an error report (🚩), and —
  only in a group whose teacher has switched it on — an anonymous wrong word
  form in `POST /calibration/answers` (below).

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
`canTeach` (v6.13) is the guardian's and the administrator's: the teacher's
routes below.

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
GET  /account            -> { profile, consent, retention, canDelete, teachers }
GET  /account/export     -> everything held about me, as a file
POST /account/name       { name }                 -> { ok, profile }      2–24 chars, unique in the group
POST /account/password   { current, password }    -> { ok }               logs out every OTHER device
POST /account/share      { board, minutes }       -> { ok, share }
POST /account/delete     { password } | { username }  -> 204 + cookie cleared
```

`teachers` (v6.13) is the nicknames of the guardians of a learner's group —
the people who see their error patterns and assignment results (below); empty
for anybody else. The export includes `assignments`: each assignment the user
has sent a result for, with that result.

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

## Duels (v6.7; graded by the server since v6.13)

Only between users in the same group who are both on the leaderboard
(`share.board`), the same rule as `/leaderboard`. See `src/js/core/duel.js`.

```
GET  /duels                          -> { duels: [ view, ... ], canChallenge: [ { id, name } ], shown,
                                          sizes: [10,15,20], hours: 24, maxOpen: 10 }
POST /duels   { opponent, topic, n } -> { ok, duel: view }   400 bad topic/size · 403 not on the board
                                                              404 not challengeable · 409 10 open duels
POST /duels/:id/start                -> { ok, duel: view, seed, key, sig }
                                                              404 not a party · 409 over, or already answered
POST /duels/:id/result { answers, sig } -> { ok, duel: view } once per player, before the deadline
                                                              400 not answers · 409 not started, or other
                                                              questions (`sig`) · 413 too big
```

A `view` is `{ id, side, challenger, opponent: { id, name }, topic, n, level, data, skills, created,
deadline, status: open|done, mine: {c,n}|null, theirs: {c,n}|null, theyPlayed,
handicap: { mine, theirs }, outcome: w|l|t|null }`. `theirs` is withheld until the viewer has
answered or the duel is over. A view never carries a seed.

**The questions.** They are not stored. The duel holds a `seed` and one `key` per player. The
seed makes the *plan*: which type of question, at which level, about which inflection cell, in
which order. Each player's own questions are built from the plan and that player's key
(`duelTasks`): the same type and level on every line and the same cell, about other words and
other sentences. Every word and sentence of the data belongs to one of the two players in a given
duel (`halfOf`), so the two sets do not overlap where the data allows it. Where the same cell
means the same answer — the cell *is* the answer ("strong or weak?", "which case does *handa*
govern?", an analysis), or so few words share it that it comes to the same thing (*four* in the
masculine accusative is *fjóra* in any sentence) — giving both players the plan's cell would give
the second player the first one's answer. For those types the plan fixes the kind of cell and
each player's cell is their own draw (`CELL_IS_ANSWER`, eighteen types; a test measures every
type and holds the list to the builders).

**Starting.** `POST /duels/:id/start` hands a player `seed` and their own `key` — not the other
player's — and records the moment once (`started`). The browser builds its questions and compares
their signature with `sig`, the signature of what the server built; if they differ (an old tab
after an update) the pupil is asked to reload before the first question. Starting again returns
the same seeds: a reload in the middle of a duel continues with the same questions.

**Grading.** `answers` is a list, one entry per question in order: the response in the shape
`src/js/core/answer.js` lists for the question's type (`{ text }`, `{ picked }`, `{ cells: […] }`,
…), or `null` for a question not answered. The server builds the player's questions again from
the seeds and judges every response with the same `judge` the browser used (`gradeDuel`). Only a
right answer counts; a missing, unfinished or malformed one is wrong; `n` is always the number of
questions. Nothing else in the body is read — a `c` or `n` beside the answers is ignored, and a
body without `answers` (what browsers posted before v6.13) is refused. The answers are graded and
dropped: the duel keeps `{ c, n, at }` per player, never anything a pupil typed.

Limits: a response may only have the keys `text, hinted, cells, texts, picked, picked2, picks,
sel, edits`, each of its own kind (a string of at most 300 characters; a list or a flat object
of at most 64 short entries), and at most 2 000 bytes as JSON (`cleanResponse`, `ANSWER_LIMITS`);
the whole body at most ~44 kB; never more answers than questions.

**A fair result (handicap).** A duel is played at the mean of the two players' levels in the
topic, which favours the stronger. The duel stores both levels (`lv`), and the player on the
lower one is given right answers in advance: none while they are within one level of each other,
then 5% of the questions per level between them, in whole answers, at least 1 and at most 30% of
the questions (`handicap`, `DUEL.fair`). The winner is the one with more right answers *plus
handicap*; `mine` and `theirs` stay the right answers, and `handicap` says what was added, from
the moment the duel is made. The 5% is a judgement, not a measurement.

**What this stops, and what it does not.** Said plainly, because a teacher may rely on it:

- *Stopped:* posting a score. Nobody can claim ten out of ten without giving ten right answers
  to their own ten questions.
- *Stopped:* reading the questions before pressing play. Until `/start` the browser holds
  nothing they could be built from, and `/account/export` leaves the seeds out.
- *Stopped, as far as the data allows:* the first player telling the second the answers. They
  are answers to other questions. Measured over every topic, a player who types in the other
  player's right answers gets about one in six right (17%) — mostly choices with two to four
  options, where that is what guessing gives — against all of them before. The limits: closed
  classes are small (four numerals decline, a handful of pronouns) and some hand-written
  exercises have a dozen items, so now and then both players meet the same word or sentence —
  about 3% of the lines in the same measurement. And 4% of the lines are a shade off the plan
  (a neighbouring level, or another cell of the same kind) because the exact one could not be
  had twice.
- *Not stopped:* a pupil who can use the developer tools after pressing play. The program shows
  the right answer the moment a question is answered, so the questions arrive with their answers;
  from `/start` on the browser holds both, and they can be read out of memory and typed in.
  Closing that would mean the server judging each answer as it is given and the browser never
  holding one, which is a different program (and no duel on a poor connection). This is the same
  as before v6.13; what is new is that it takes a programmer rather than one line.
- *Not stopped:* looking, then answering later. A pupil can press play, read the questions,
  reload, and take the 24 hours to find the answers — or ask somebody. `started` records when
  play was first pressed, and nothing acts on it yet: a limit ("answer within an hour of
  starting") is one comparison in `/result`, but it would also cost the child whose bell rang.
- *Not stopped:* help from a person, a book or another tab. No server can.
- *Not stopped:* two accounts in one hand. One pupil with a second account, or two friends
  sharing passwords, can each see "their" duel.

Void duels (nobody answered within 24 hours) are deleted on the next read; finished ones after
30 days. Erasing a user erases their duels; `/account/export` includes them, without the seeds.
A duel made before v6.13 has no keys and no levels: it gets keys when first started, and no
handicap.

## The teacher: the class's patterns and assignments (v6.13)

Items 37 and 65. A **teacher** is a user with the `canTeach` right: a
`guardian` for **their own group only**, the `admin` for any group. Every
`/teacher/…` route takes `?group=<id>` (default: the caller's own group) and
answers 401 to nobody, 403 to a learner, 403 to a guardian asking about
another group (or a group that does not exist — membership is checked before
existence), and 404 to the administrator asking about a group that does not
exist. One function, `needTeacher` in `server/server.mjs`, decides it.

```
GET    /teacher/groups              -> { mine, groups: [ { id, name, pupils } ] }
GET    /teacher/patterns            -> { group: { id, name }, pupils: [ pupil ], columns: [ patternId ] }
GET    /teacher/patterns.csv        -> the same table as text/csv (attachment)
GET    /teacher/assignments         -> { group, limits, assignments: [ teacherView ], pupils: [ pupil ] }
POST   /teacher/assignments         { group?, target: { kind, id }, n, due, note? }
                                    -> { ok, assignment }   400 bad target/size/date/note · 409 12 open
DELETE /teacher/assignments/:id     -> 204                  404 no such assignment

GET    /assignments                 -> { assignments: [ pupilView ] }    a learner's open ones; [] for others
POST   /assignments/:id/result      { i, j, c } -> { ok, assignment: pupilView }
                                    400 not 0 ≤ c ≤ j ≤ i ≤ n, i ≥ 1 · 404 not your group's · 409 past
                                    the deadline · 429 more than 50 results for one assignment
```

A `pupil` is `{ id, name, practised, diag }`; `diag` maps a pattern id to
`{ n, w, seen, misses, rate, trend, active }` — what `standingOf`
(`core/diagnosis.js`) gives for the pattern, the same figures the pupil sees
under *Framvinda*, and nothing more: not the example words (`ex`), not the date
of the last miss, not the raw history. "Ógreint" is in `diag` under `ogreint`
(`active` always false). Only learners who are active and in the group are
listed, by name. `columns` is the patterns that went wrong for somebody, the
class's worst first: most pupils with it "algengt núna", then the class's miss
rate over the recent window, then total misses (`core/classview.js`
`classColumns`). The CSV has a row per pupil, the miss rate in whole percent
per pattern (empty where not met lately) and the two Ógreint counts, separated
by `;`, UTF-8 with a byte-order mark, and a nickname a spreadsheet would run as
a formula is prefixed with `'`.

A **target** (`core/assignment.js`) is one of
`{ kind: "skill", id: <category> }`, `{ kind: "pattern", id: <pattern> }` (not
`ogreint`, nor one in `NOT_AIMABLE`), `{ kind: "node", id: <curriculum node
with questions> }` or `{ kind: "year", id: "8"|"9"|"10" }`. `n` is one of
5, 10, 15, 20, 30; `due` a date (`YYYY-MM-DD`) from today to 60 days ahead,
open until the end of that day (UTC, which is Iceland's time); `note` at most
80 characters, no `<` or `>`. At most 12 open assignments per group. An
assignment is erased 30 days after its deadline, results and all, on the next
read — no job runs.

A `pupilView` is `{ id, target, n, due, note, created, open, mine }`, `mine`
being `{ i, j, c, done, at }` or null: the pupil sees their own result and
nobody else's, and not who set it. A `teacherView` is `{ id, target, n, due,
note, created, open, results: [ { id, name, res } ], columns }`, `res` being
`{ i, j, c, done }` or null — no time and no count of tries — and `columns`
the patterns the assignment's material tests, ordered as above.

Which result counts: until the pupil has done the whole assignment, the latest
attempt that got at least as far; after that, a later complete attempt only if
it has a higher share right. The browser sends one result when a session on the
assignment ends, finished or not (`app.js endRun`). Like a duel's result it is
the browser's word: the server checks the numbers are possible, not that they
are true (item 62 is about duels; homework is not a contest).

Setting and deleting an assignment is written to the audit trail; looking at
the table is not. Erasing a user removes their results; an assignment a
guardian set stays with the group, its `by` cleared. Deleting a group deletes
its assignments. All of it is in the backup.

## Calibration from real answers, and the answer sample (v6.13)

Items 17 and 38. `server/calibrate.mjs` holds the routes; the arithmetic is
`src/js/core/calibration.js` and the classifier check
`src/js/core/classifiercheck.js`.

```
GET    /calibration            -> { on, table, collect, samples, canCount, choice, byDefault }
POST   /calibration/answers    { events: [event], samples?: [sample] }
                               -> { ok, counted, records, samples, collect }   429 over 150 requests today
POST   /account/stats          { on: boolean } -> { ok, choice, collect }

GET    /teacher/samples        ?group= -> { group: { id, name }, on, available }
POST   /teacher/samples        { group?, on: boolean } -> { ok, on }   409 FALLASKOLI_SAMPLES=0 · audited

GET    /admin/calibration             -> report                     canAdminUsers
GET    /admin/classifier/samples.json -> { v: 1, about, samples: [sample] }   (attachment)
DELETE /admin/classifier/samples      -> { ok }                     audited
```

**`GET /calibration`** is asked once per load. `on` is false when the server
runs with `FALLASKOLI_CALIBRATION=0`; `table` is then null. `collect`: this
account's answers are counted, so the browser sends them (it sends nothing
otherwise). `samples`: the teacher of this account's group has switched the
answer sample on, and the account is counted. `canCount`, `choice` (the
account's own switch: true, false, or null when never touched) and `byDefault`
(what applies while it is null) are for *Aðgangurinn minn*. The request also
runs the weekly estimate if it is due.

The **table** is `{ v: 1, at, types, cells, irr }` or null:

| Field | Meaning | Bounds |
|---|---|---|
| `types` | `{ "<typeId>": { "<level 1–7>": shift } }` — a pupil whose skill stands at that level gets this type built as if the level were `level + shift` (held inside the skill's range) | −1 … +1, in quarters |
| `cells` | `{ "<BÍN mark>": score }` — replaces the build's hardness of that cell (`lexicon.cellHardness`) | 1–5, within ±1 of the build's |
| `irr` | `{ "<1–5>": score }` — what a word's built-in irregularity score counts as | 1–5, within ±1, never out of order |

Only entries that differ from the built-in values are present; an empty table
changes nothing. The browser rebuilds it field by field (`cleanTable`) and
anything else — a 404 from an older server, a damaged body, `v` it does not
know — is treated as no table: built-in values throughout. Duels never apply
it.

An **event** is one judged answer to a fresh question of ordinary practice:

```
{ t: "<typeId>", l: <level 1–7>, ok: <boolean>, recs: [ [ "<BÍN mark or ''>", <irr 0–5>, 0|1 ] ] }
```

`l` is the level the question's skill stood at; `recs` has one entry per
record the answer made (a table: one per cell) with the cell, the word's
built-in irregularity score, and right or wrong. The server keeps only what
passes `cleanEvents`: a type the registry has, a whole level, a mark the
bundle has, a score 0–5. No other field is read, so there is nothing an answer
could travel in. At most 40 events per request and 30 records per event.

What is counted, and what stops a flood: an account must be `counted` (a
learner, active, with a consent record, not switched off, not held for review;
with `strict`, consent to notice ≥ 2026-11-17 or the account's own yes). Per
account per day: 150 requests, 400 questions, 2,500 records — and towards one
type-and-level 12, one cell 8, one irregularity bucket 150. The per-account
tally lives in `calibration-quota.json` for that day only and is not in the
backup; the counts themselves (`calibration.json`) hold no account, group or
time: `types["fill|3"] = [right, total]`, `cells["fill|3|EFFT|4"] = [right,
total]`, and per number the largest count of different accounts seen on one
day. At most 8,000 cell keys.

**The run** happens when a week has passed since the last (checked on `GET
/calibration`, at start-up and every 12 hours). It needs ≥ 3 counted learners
active in the last two periods; then per number ≥ 40 answers (types) or ≥ 60
(cells, irregularity), ≥ 3 different accounts on one day, a reference of ≥ 3
other types at that level (or cells of the same built-in score), and a
difference larger than 3 points of share right and than 1.645 posterior
standard deviations of a beta-binomial estimate whose prior weighs 40 (types)
or 60 answers. A value then moves 0.25, never beyond ±1 of the built-in. After
the run every count is multiplied by 0.85, and a type-and-level whose shift
changed starts counting afresh.

The **report** (`GET /admin/calibration`):
`{ on, strict, samplesOn, periodDays, minPupils, lastRun, nextRun, due, runs,
table, totals: { questions, records, keys, maxKeys }, log: [run], classifier }`.
A `run` is `{ at, run, pupils, questions, records, changes: [change], slope?,
note? }`; a `change` is `{ k: "type", id, band, from, to, n, p, base }` or
`{ k: "cell"|"irr", id, from, to, builtIn, n, p, dev }`. The last 60 runs are
kept. `classifier` is `{ kept, cap, offered, groupsOn, n, disagree, rate,
ambiguous, byPattern: [ { p, name, n, disagree, ambiguous, rate } ], byKind }`.

A **sample** (item 38) is `{ t, w, m, typed, right, p, conj? }`: the question
type, the word as `lemma|class`, the cell asked for, the wrong form typed, the
form expected, the pattern ids the classifier gave, and for a verb its
conjugation. It is kept only if the account's group has `samples: true`
(`POST /teacher/samples`, by the group's guardian or the administrator;
default false), and only if it passes `cleanSample`: `w` is a word of the
lexicon, `m` one of its cells, `right` one of that cell's forms, and `typed`
one word of Icelandic letters, at most 32, that is not the right answer and
resembles a form of the word (it begins as one of them does — three letters,
two for a short form — or is within two letters of one). At most 6 per request and 20 per account per day; the server
keeps 500 as a reservoir sample in random order, each with the month it was
taken and nothing else, for 12 months. `samples.json` is in the backup.

The classifier check compares each sample with every form of its word
(`ruleReading`) and reports where that reading and the classifier's patterns
cannot both be right (`agreement`); `classifiercheck.js` says what the measure
can and cannot show. The downloaded file is the format of
`tests/fixtures/wrong-answers.json`.

`/account/export` carries the account's own switch as
`account.countedInStatistics`. Erasing an account removes it from today's
tally; the anonymous counts and samples cannot be traced to it and stay.

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
of a learner **in their own group** and nothing else here — not the default, not
another group. Until v6.3 a guardian could change the default for everybody.
(Since v6.13 a guardian also has the teacher's routes, for the same group only.)

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
