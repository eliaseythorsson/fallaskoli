# Privacy: what you have to do, and what the program does for you

Fallaskóli run for invited friends and families makes **you** the controller
(*ábyrgðaraðili*) under GDPR and the Icelandic Act No. 90/2018. This file is
your side of that: a checklist, the record you are required to keep, how
consent works, what to do when somebody asks for something, and what to do if
something leaks.

It is not legal advice. For a real question, Persónuvernd answers them:
`postur@personuvernd.is`, tel. 510 9600.

> **If this ever goes to a school**, stop and read §8 first. A school changes
> who is responsible, and this file no longer describes your situation.

---

## 0. Before the first invitation

- [ ] `FALLASKOLI_CONTROLLER` and `FALLASKOLI_CONTACT` are set (`docs/HOSTING.md` §2);
      `/health` says `"privacy":true`.
- [ ] You have read `/personuvernd` on your own server, and every sentence is
      true for you. It is written in Icelandic for a teenager — **have a second
      person proofread it**; it was drafted with the rest of this version.
- [ ] Fly's data processing agreement is signed (§4).
- [ ] The record in §2 has your name and today's date on it.
- [ ] There is a second administrator, or you have decided there is not.
- [ ] You know where §7 (a leak) is.

---

## 1. What the program now does by itself

| Requirement | How it is met |
|---|---|
| Collect as little as possible | No email, no birth date, no real name, no kennitala. A username, a nickname, a password hash, progress. Answers are never stored — only whether they were right. (One exception, off unless a teacher switches it on for their group: an anonymous sample of wrong word forms, §1b.) |
| Private by default (Art. 25) | Nobody is on the board or roster until they switch it on themselves; minutes are a second switch. Groups never see each other. |
| Consent that can be shown (Art. 7, 8) | Each account records who consented, when, and to which version of the notice (§3). |
| A notice a child can read (Art. 12–13) | `/personuvernd`, linked from the login card and from *Aðgangurinn minn*. Its retention figures are read from the same settings the server acts on. |
| Access and portability (Art. 15, 20) | *Sækja gögnin mín* — everything, one JSON file. You have the same button per user. |
| Rectification (Art. 16) | The user changes their own nickname and password. |
| Erasure (Art. 17) | *Eyða aðganginum mínum*, your *Eyða alveg*, and the retention sweep all run the same erasure: account, progress, curriculum ceiling, sessions, hidden-list entry, invitation trace, assignment results (an assignment a guardian set stays with the group, without their id). |
| Storage limitation (Art. 5(1)(e)) | Unused accounts erased after 18 months, unanswered requests after 30 days, automatically. |
| Security (Art. 32) | Passwords as scrypt hashes; session tokens stored hashed; HTTPS only; login and registration rate-limited per address; strict content-security policy; the server does not run as root; backups encrypted with your passphrase. |
| No third parties | The page loads nothing from anybody: fonts are inside the file. No analytics, no advertising. One cookie, strictly necessary, so no cookie banner. |
| Accountability | *Atburðaskrá* records every administrative action, by id. |
| Statistics without people (v6.14) | Right and wrong answers are counted per question type, level, inflection cell and irregularity score, with no account, group or time, to set the difficulty automatically. A learner can switch their own contribution off. See §1b. |
| A class goal shows totals only (v6.14) | When a guardian sets a weekly goal, the group sees one total its learners' answers feed into — never who put in what, and nothing in a group of fewer than five. See §1c. |
| A live round keeps nothing; a team duel keeps numbers (v6.14) | A round on the projector lives in memory for the lesson; the wall names only pupils who are on the leaderboard, everyone else is a numbered player. A team duel keeps numbers only; the teacher sees their own pupils' results, the pupils only the teams' means. See §1d. |
| A second-language flag that nobody else sees (v6.14) | One yes/no, set by the pupil or by their group's guardian; it changes what the app shows and nothing else. Reading aloud uses an on-device voice only. See §1e. |
| A pupil's own sentences are checked and forgotten (v6.14) | Ritun vikunnar: off for every group until its guardian switches the check on; the text is read over by GreynirCorrect on this server and kept only if the guardian also switches keeping on (at most 12 per pupil, 60 days). See §1f. |
| A teacher sees only what helps them teach (v6.14) | The guardian of a group sees, for the learners of that group only, the error-pattern figures the child sees themselves, the scores of assignments and (issue #17) the words the child finds hard now — never anything typed, never a date. The child's account page names who that is. See §1a. |

What it does **not** do, and you should know:

- **It does not verify that the guardian is the guardian.** The form asks for
  the guardian's name and a tick. GDPR asks for "reasonable efforts"; the
  effort here is that *you* hand the invitation code to the parent, not the
  child. Keep doing that.
- **No two-factor login** for the administrator. Use a long password that is
  used nowhere else.
- **The disk is not encrypted by the program.** Fly encrypts volumes at rest;
  the backups you download are encrypted by you.
- **A child who edits their own progress plausibly is not caught.** Implausible
  numbers are held off the board for you to look at; that is all.

---

## 1a. What a teacher sees (v6.14, items 37 and 65)

A **guardian** (role `guardian`, shown as *forsjáraðili eða kennari*) is the
adult of one group: the teacher of a class, or a parent for a family. Since
v6.14 that account has a part of its own in Skólastofan, and it is the first
time anybody but the child and you can see anything of a child's progress
without the child switching it on. So, precisely:

| The teacher sees | Why | Not |
|---|---|---|
| The nickname of each **learner** in **their own group** who is active | To know whose row is whose | Learners in other groups; anybody pending or blocked; usernames, consent records, last-seen days |
| For each error pattern: how many of the child's recent answers that test it went wrong, the totals, whether it is getting better, and whether it is "algengt núna" — **the same figures the child sees** under *Framvinda*, computed by the same function (`core/classview.js`) | To see what the class needs to practise, and who needs help with what | The example words and marks the diagnosis keeps, the date of the last miss, the raw history — and nothing the child typed, which is never stored |
| How many wrong answers the diagnosis could not classify (*Ógreint*) | So the teacher can judge how far the table can be trusted | — |
| **One pupil's skill map** (v6.14, item 83; `GET /teacher/skillmap`): for every node of the curriculum map the mastery mark and what it rests on (how many recent answers at the child's level, how many right, the step of difficulty), how many reviews are due and waiting there, which error patterns are active; opened, the patterns' figures and the grammatical cells missed ("þágufall, fleirtala") with their counts — **the map the child sees** under *Framvinda*, drawn by the same code from `teacherMap` (`core/skillmap.js`) | To see where one child stands in the curriculum, not only which mistakes they make | When anything was last practised (no date, no "days ago"), the **words** the child missed, XP and stig, the raw histories — and nothing the child typed |
| For an assignment the teacher set: questions answered, how many right, finished or not | So homework can be set and checked | When it was done, how many tries, how long it took |
| **One pupil's hard words** (issue #17; beside that pupil's skill map, `GET /teacher/skillmap`, `hard`): each word the child has answered wrong three times within fourteen days and not yet put right, with its word class and a reason such as *3 röng svör innan 14 daga, í 2 gerðum spurninga; síðan 1 af 1 svar rétt* (`hardWords`, core/wordknowledge.js) | So the adult can help with the very words a child is stuck on | Any other word the child missed, the day of any answer, the dated history behind the reason, the question asked or what was answered — and nothing the child typed |

**Lawful basis.** It is still consent, the same consent the account was made
with — but showing a child's results to a teacher is a new recipient, so
the notice of v6.14 (`PRIVACY_VERSION` `2026-11-16`, §3) says it in the child's
own words. **Tell the families** before the upgrade goes live. If a family does
not want it, either give them a group of their own, or erase the account; there
is deliberately no per-child switch to hide from the teacher, because a teacher
who sees only the children who opted in sees a class that is doing better than
it is.

**The skill map (item 83)** is in the same version of the notice. The
recipient is the same teacher; what is new is how much of one child they see: not only which error patterns, but how
well the child commands each of the fifty-odd nodes of the curriculum. The
route is authorised exactly as the class table (a guardian for their own
group, the administrator for any), the pupil must be an active learner of that
group, and every other case — another group's pupil, an adult, an id that does
not exist — gets one and the same 404. The copy sent is smaller than the
child's own on purpose: the notice promises that a
teacher does not see *when* a child practises, so "last trained" is not sent,
and neither are the words a child missed. `tests/skillmap.test.js` and
`tests/teacher.test.js` hold both. **Tell the families** as for the table.

**Hard words (issue #17)** are the one place a teacher sees **words** of one
child. Before it, the skill map deliberately sent none. The list is short by
construction (only the words that are hard now; a word leaves it after three
right answers in a row on a later day), and its reasons are built without a
date (`tests/hardwords.test.js`). The child is shown no list and no "hard"
label. The recipient is the same teacher as for the skill map, the route the
same, so it needs no new lawful basis — but it is something new the teacher
sees, so the notice should say it (*orðin sem þú átt erfiðast með*) and
`PRIVACY_VERSION` move with the release that carries it, and **tell the
families** as for the map. Nothing new is stored: the list is worked out from
the dated history per word the progress already holds (issue #8).

**Who is guardian is your decision.** The role is given by you, per group. A
parent made guardian of a group of several families sees every child in it.
Look at the guardians of each group when you upgrade (`docs/SERVER.md` §4.2).

**Not audited:** a teacher looking at the table. A teacher looks every day,
and the trail keeps 2,000 lines. Setting and deleting an assignment is audited.

**The CSV file** the teacher downloads holds the same table. Once downloaded it
is outside this program: it is the teacher's to keep safe and delete. The
notice says nothing about it because it carries nothing the teacher could not
see on the screen.

**Offline and hosted-page pupils** (no server) have no teacher and no
assignments; nothing changes for them.

---

## 1b. Counting answers, and the sample of wrong answers (v6.14, items 17 and 38)

Two new things the server does with what happens in practice. Neither needs
anything from you once you have decided the two questions marked **Decide**.

### The anonymous count

| | |
|---|---|
| **What arrives** | For each fresh question a counted learner answers: the question type, the level (þyngd) their skill stood at, the inflection cell(s) asked for (BÍN marks), the built-in irregularity score of the word (1–5) — not the word — and right or wrong. The server accepts nothing else; there is no field a typed answer could travel in. |
| **What is kept** | `calibration.json`: per (type, level, cell, score) two numbers, right and total, added up over everybody; the adjustment table worked out from them; a log of what each weekly run changed. No account, no group, no time of an answer. |
| **What is personal, and for how long** | `calibration-quota.json`: how many answers each account has contributed **today**, in all and towards each number — needed to hold the caps that stop one account flooding the count. Replaced when the day changes, removed at once when the account is erased, and **not** in backups. This is the only place an account stands next to its answers. |
| **Why** | So the difficulty of the questions follows what pupils actually find hard, without anybody reviewing numbers (`docs/SERVER.md` §4.3). |
| **Who is counted** | Learners only, active, with a consent record, not held for review — and not if they untick *Telja svörin mín með í nafnlausri talningu* under *Aðgangurinn minn*. Guardians, teachers and you are never counted. |
| **Who sees it** | You: totals, the table and the log, on the admin page. Every logged-in browser receives the adjustment table (it has to apply it). |
| **Can a published number be one child's?** | No adjustment is made unless at least three different accounts contributed to that number on one day and at least three counted learners were active in the last two weeks. On a server with one or two children nothing is ever published. |
| **Erasure** | The counts carry no identity, so an erased account's past answers stay in the sums and cannot be taken out — the notice says so. They fade by themselves: every week each count is multiplied by 0.85. |

**Lawful basis, and the decision.** The account's consent, as for everything
else: the notice of v6.14 (`2026-11-16`) describes the
counting, in the short version too. What is stored is anonymous; the only
personal processing is receiving the answer and the one-day tally.

**Decide (1): who is counted from the day you upgrade.**

- *Default* — every learner with a consent record is counted, with the switch
  to opt out. This follows what was done for the teacher's view in this same
  version: the notice changed, the families are told, and nobody has to do
  anything. It is the right choice if you tell the families before upgrading.
- `FALLASKOLI_CALIBRATION=strict` — an account is counted only if its consent
  was recorded for the notice of 2026-11-16 or later (new accounts; or existing
  ones after you record consent again under *Meira*), or if the learner ticked
  the box themselves. Choose this if you would rather nobody's practice were
  counted on the strength of a notice they agreed to before it said so. On a
  small server it may mean the calibration never has enough pupils to do
  anything, which is harmless.
- `FALLASKOLI_CALIBRATION=0` — none of it.

### The sample of wrong answers

This is the **one exception** to "nothing a child types is stored", so it is
built to be small, anonymous and somebody's deliberate choice.

| | |
|---|---|
| **Off by default** | Nothing is sampled until a teacher (the guardian of a group, or you) ticks *Geyma nafnlaust sýni af röngum svörum úr þessum hópi* in Skólastofan. Per group. Unticking stops it. Switching it on or off is written to *Atburðaskrá*. `FALLASKOLI_SAMPLES=0` forbids it for the whole server. |
| **What is kept** | `samples.json`, at most 500 entries: the question type, the word asked about, the cell asked for, the form expected, **the wrong form the pupil typed**, how the error diagnosis classified it, and the month. No account, no group, no day. Entries are stored in random order, so neighbours in the file say nothing about having come from one pupil. |
| **What is never kept** | Anything that is not one word of letters resembling a form of the word on the card: a sentence, a name, a number, a swear word, "veit ekki" are dropped by the browser before sending and again by the server (`cleanSample`). A right answer, and an answer to anything but a written inflection, is never a sample. |
| **Why** | To check automatically whether the error diagnosis classifies real mistakes correctly; until now it was tested only on invented ones. Nobody reads the sample as part of running the server: the check is a program (`docs/SERVER.md` §4.3). |
| **Who sees it** | You, on the admin page (as figures per error pattern) and as a file if you download it — for a developer to add to the tests. Not the teacher, not other pupils. |
| **The pupil's side** | The notice says it; *Aðgangurinn minn* shows, in bold, when the pupil's group has it switched on; unticking the counting there takes the pupil out of the sample as well. At most 20 of one pupil's answers a day can enter it. |
| **Retention** | 12 months from the month it was taken, or until you press *Eyða sýninu*. A newer answer replaces a random older one once there are 500. |
| **Erasure** | A sample cannot be traced to an account — that is the point — so it cannot be found to erase for one person. The notice says so plainly. If a family asks, *Eyða sýninu* erases the whole sample. |

**Decide (2): whether teachers may switch it on at all.** It is defensible: a
wrong inflection of a given word, with nothing to connect it to anybody, tells
nothing about a person. But it does change the sentence families have been
told — "what you type is not stored" — and a teacher is not the child's
guardian. So: either set `FALLASKOLI_SAMPLES=0`, or make it a rule that the
families of a group are told before its teacher ticks the box. If the
downloaded file is ever put in the public repository, look through it first
(it holds only word forms, but it is the one moment a person should look).

---

## 1c. The class goal: one total the whole group sees (v6.14, item 59)

A group's guardian can set a **weekly goal the group reaches together** — "2.000
right answers together", or "everyone finishes three sessions" — and every
member of the group sees one bar in Skólastofan. When it is full, every learner
in the group gets the same badge. This is the first thing on the server that
every learner's progress feeds into **whether or not they switched the board
on**: that is deliberate, because the goal is for the pupils who keep off the
board as much as for those on it. So, precisely:

| The group sees | Not |
|---|---|
| The goal the guardian set, and **one total for the current week** (Monday–Sunday): the group's right answers added up, or how many learners have finished the number of sessions, out of how many | Who put in what — no names, no per-pupil figure, no order; nothing about any other week except whether last week's goal was met |

- **Who is counted:** the learners of the group whose account is active (not
  pending, not blocked) and not held for review (implausible numbers, which
  keep a pupil off the board too). The sum is computed on request from the day records
  and the session list the state already holds; nothing new is stored about a
  pupil. The goal itself is kept on the group's record (`groups.json`: kind,
  size and the Monday it applies from), with no pupil id; who set or removed it
  is in the audit trail, by id.
- **Small groups:** with fewer than five learners nothing is shown and no goal
  can be set (`CLASS_GOAL.minPupils`, `src/js/core/classgoal.js`). In a group of
  three, "2 of 3 have finished" would tell a pupil who has not that both the
  others have. Five is the program's figure elsewhere for "nobody else here".
  A total can still be read at its extremes ("0 of 24", "24 of 24"); that is
  the limit of what a total hides, and it is no more than a teacher saying
  "everybody did it" to the class.
- **Lawful basis:** the same consent. It is a new recipient (the group) of
  something derived from a child's progress, so the notice of v6.14
  (`2026-11-16`) says it in the child's words, in the summary and
  under *Hver sér hvað?*. **Tell the families** with the rest of v6.14. As with
  §1a there is no per-child switch: a class total that leaves out whoever
  opted out would be one more board the weakest pupils keep off.
- **Offline and hosted-page pupils** have no group and no goal.

---

## 1d. A live round in class, and team duels (v6.14, items 64 and 67)

**A live round** is a game on the projector: the teacher starts it, the pupils
of the group join on their own devices and answer the same questions at the
same time. What it means for privacy:

- **Nothing is stored.** The round lives in the server's memory for the lesson:
  who joined, right or wrong and the points per question. It is never written
  to disk, is not in a backup, and is forgotten 10 minutes after the round ends
  (or at once, if the server restarts). The answers are sent to the server to
  be graded, as a duel's, and dropped. What stays is in the pupil's own
  progress, as with any question they answer.
- **The wall is a public screen.** The projector shows the top five after each
  question and the top three at the end. A pupil is named there only if they
  have chosen to be on the leaderboard (and are not hidden or held — the
  leaderboard's own rule); everybody else is *Leikmaður 1, 2 …*, a number that
  belongs to that round only, and each pupil's own screen says which number is
  theirs. Nobody is listed at the bottom.
- The class's commonest error pattern at the end is a count of pupils, not a
  name.

**A team duel** is half a class against the other half, or one class against
another. It is stored (`teamduels.json`): the teams as user ids, each pupil's
key to their own questions and their result as numbers (`c` right of `n`), never
the answers. **The group's teacher sees each of their own pupils' result by
name** — a new thing a teacher sees, like an assignment's result, so the notice
of v6.14 (`2026-11-16`) says it. The pupils see their own
result and the two teams' means and how many have played, never a classmate's
or an opponent's score or name. Against another class, that class's teacher
sees only the teams' figures, and must accept before their pupils are put in
the game. A guardian setting one is shown the names and sizes of the other
groups (to pick an opponent) — group names, not people. Erased 30 days after it
is over, and with a pupil's account; in the pupil's own export and in the
backup.

---

## 1e. Icelandic as a second language (v6.14, item 45) — a separate paragraph

*In the notice from version `2026-11-16` (§3).*

A pupil can switch on the **second-language mode** under Stillingar, or the
group's guardian can switch it on for a pupil in Skólastofan. It changes what
the program shows (word glosses, a slower climb in difficulty, the kind of error
hunt, reading aloud) and nothing else.

- **What is stored:** one yes/no. The pupil's own switch is a setting in the
  progress (`settings.secondLanguage`), like every other setting. The guardian's
  is one flag on the account (`l2` in `users.json`), returned to the pupil's
  app as `profile.secondLanguage` and copied into the settings at start-up. It
  is in the pupil's own export and goes with the account. Turning it on or
  off is written to the audit trail, by id.
- **Why it is worth a paragraph:** "learns Icelandic as a second language" can
  hint at a child's background. It is not a special category (Art. 9) by
  itself, but it is the kind of fact a family may not want recorded without
  being asked. So: it is never shown to other pupils, never on the board,
  never in the class table or the skill map; the guardian sees it only for
  their own group's pupils; and **agree with the pupil (and the family) before
  switching it on** — the pupil can always do it themselves, which is the
  better route.
- **Reading aloud** uses only a voice that runs on the device itself
  (`localService`); a browser's network voice, which would send the sentence
  to a company to be spoken, is not used, and with no on-device Icelandic
  voice the button is not shown. Nothing is sent anywhere.
- **The glosses** come from the dictionary bundled in the program (or the
  server's `/definitions`, which already exists); looking a word up sends
  nothing new.

## 1f. Ritun vikunnar: what a pupil writes (v6.14, item 46) — a separate paragraph

*In the notice from version `2026-11-16` (§3). The summary's sentence
"Það sem þú skrifar í svörin er ekki geymt" stays true for answers; the short
version says in its own sentence that the Ritun vikunnar text is sent only with
the check on and kept only with keeping on, and the notice's own paragraph on
Ritun vikunnar gives the details.*

Once a week the pupil writes three sentences of their own on an everyday topic.
This is the first place the server can receive **free text a child wrote**, so
the defaults are the strictest available:

| | |
|---|---|
| **Default** | **Off for every group.** The task is still offered; the pupil reads their text against a short checklist, and nothing is sent. |
| **The check** (`groups.json`: `writing.check`) | Switched on per group by its guardian (or the administrator). Then "Lesa yfir" sends the text to **this server**, where GreynirCorrect (Miðeind's open-source checker, run as a local process: `server/greynir_worker.py`) reads it and the remarks come back. **No third party** receives it; it is not a new processor. The text is held in memory for one request, passed to the worker over a pipe, and **not written to any file or log** (errors are logged by kind only; the worker's stderr is discarded). |
| **Keeping** (`writing.keep`) | A second, separate switch, only possible with the check on. Then each checked text is stored in `writing.json` with the pupil's id, the group, the week and the topic, for the group's guardian (and the administrator) to read in Skólastofan. At most **12 per pupil**, none older than **60 days** (`WRITING.keepPerPupil`, `WRITING.keepDays` in `src/js/core/writing.js`; pruned on every read and write and by the daily sweep). Switching keeping (or the check) **off deletes every kept text of the group at once.** |
| **What the pupil is told** | Before sending, the card says whether the text will be kept, in so many words. The notice (`/personuvernd`) has its own paragraph. |
| **Rights** | Kept texts are in the pupil's own export (`keptTexts`) and are erased with the account (`eraseUser`); a pupil moved to another group is no longer shown to the old group's guardian. They are in backups for as long as a backup lives (§6). |
| **The progress** | Records only the Monday of the week the task was finished (`settings.writingDone`), never the text or the topic. |

**Before switching keeping on**, tell the families: it is the one place where
a pupil's own words, rather than numbers, are stored. Advise pupils (the card
does) to write about everyday things and nothing private; the topics are
chosen so that nothing private is needed. Abuse limits: 30 checks an hour per
account, 600 characters per text, 8 seconds per check, after which the worker
is killed and restarted.

## 1g. The pupil's own text in their progress: only for the pupil (issue #49, ADR 0003)

*The word cards (Orðakort) are the one part of the progress under this rule.
Since issue #15 a card holds what the pupil chose on it: how well they said
they knew the word (aldrei heyrt / heyrt það / get notað það) and, for each
step, which of the offered options they picked first and whether it was
right, with the day the card was finished. Since #37, for a pupil the
administrator switched on for server grading (§1h), it also holds the
pupil's own explanation of the word, as typed (at most 1,200 characters); since
#38 also their own sentence with the word and the three related words with how
each connects. Since #18, when the card comes back after a review of a
learned word, it also holds what the pupil added then, with the day: a newer
self-rating, and/or a sentence of their own with the word, as typed (at most
200 characters; the newest 12 additions per card). All in the same slice (`S.wordCards`, `src/js/core/wordcard.js`). The notice
(`/personuvernd`) still needs its paragraph: add it, and move
`PRIVACY_VERSION`, with the release that carries the cards.*

Some parts of a pupil's progress will hold **text the pupil wrote in their own
words**: on a word card, their own explanation of a word, their own sentence
and related words — and already now their answers and self-rating on the
card. In the code such a part is a slice marked `ownText: true`
(`src/js/core/slices.js`). It is the pupil's notebook, and **nobody but the
pupil can read it**:

| | |
|---|---|
| **Where it goes** | Only (1) between the pupil's own devices, as their progress syncs; (2) into their own export ("Sækja gögnin mín", `/account/export`); (3) to the server's text reader when the pupil asks for something they wrote to be graded — sent from the screen with that request, never read from the stored progress. |
| **Where it never goes** | A teacher's, guardian's or classmate's screen; the leaderboard, the roster, the badge statistics; any log. The administrator does not get it either: reading or exporting a pupil's progress (`GET /state/:id`, `/admin/users/:id/export`) leaves it out (`withoutOwnText`), and an administrator's write to a pupil's progress keeps what the pupil wrote (`keepOwnText`). |
| **Guardians** | See the list of hard words, never the text. |
| **Rights** | In the pupil's own export, and erased with the account, like the rest of the progress. In backups for as long as a backup lives (§6). An access request answered by the administrator (§5) leaves it out: the pupil gets it with their own export. |
| **Held by** | `tests/owntext.test.js`: a fixture slice with a marker in it is saved for a pupil, every server route that reads other pupils' progress is called as a classmate, a guardian and the administrator, and the marker must be in no answer, no log line and no file but the pupil's own progress, and gone when the account is. A new place in `server/` that reads progress fails that test until its route is called there. |

Opening any of this up — letting a guardian or a teacher read word cards —
would be a deliberate, separate decision, with its own line in the notice.

## 1h. Claude reads a pupil's own explanation — per pupil, off by default (issue #37)

*Not in the notice yet. **Before you switch it on for any pupil:** do the
four things in "Before switching it on" below, add a paragraph to the notice
(`/personuvernd`) and move `PRIVACY_VERSION`, so the families of those pupils
consent to it. Without the key nothing below happens at all.*

For a few pupils the program can ask Claude (Anthropic's model) to read
**what the pupil wrote in their own words** and tick a rubric. Such questions
today are the free-text steps of the Orðakort and the same questions in
practice: the explanation of a word (*Orð útskýrt með eigin orðum*, #37, and
the graded meaning question *Hvað þýðir orðið? (lesið yfir)*, #38); **a
sentence about the pupil's own life** that uses the word (*Mín setning*, #38);
and **three words related to the word**, with how each connects (*Þrjú skyld
orð*, #38). Since #39 also, in Lesskilningur, **the main idea of a short subject
text** in one sentence of the pupil's own (*Aðalatriðið með þínum orðum*) and
**a short summary of a story** (*Sagan með þínum orðum*).

| | |
|---|---|
| **Who** | Only a pupil the **administrator** switched on, one by one (the pupil's curriculum settings on the admin page: "Leyfa spurningar sem þjónninn les", `allowed.serverGrading`; missing means off, docs/adr/0004). Not a guardian, not a teacher, not a default. Everybody else never sees the question, and on a file or a plain host it does not exist. |
| **What is sent** | The pupil's answer (at most 1,200 characters) — the explanation, the sentence, or the three words and how they connect, sent as one numbered text — with **names stripped** first: every name and username of an account in the pupil's group, and every word with a capital letter inside a sentence, is replaced by *[nafn1]*, *[nafn2]* … before it leaves the server (`server/reader-claude.mjs` `stripNames`). With it: the word, its class and its definition from the dictionary (ÍNO) where it has one, and the rubric. For a text's main idea or a story's summary (#39): the text the pupil read (one of the program's own texts, `content/textar/`, read by the server from its own data — the browser sends only the text's id), with its marks and the summary written with it, and the rubric. The names of the story's own characters are not stripped (they are the program's, not the pupil's); every other name is. **The sentence about the pupil's own life may say something personal** (a move, a family member, a hobby): the step tells the pupil they need not name anyone, names are stripped anyway, and nothing more about the pupil goes with it. **Never** the pupil's name, id, group, age or anything else from the account. |
| **From where** | From **this server**, with the key as a server secret. The browser never talks to Anthropic, and the key is never in the page. |
| **What comes back** | For each point of the rubric: met or not, with a quote from the text. The server drops any claim whose quote is not in the pupil's text, and returns only that; right/wrong and XP are decided in the browser. Claude writes nothing the pupil reads: the checklist and the one follow-up question are the program's own words. |
| **What is kept** | On the server: **nothing** of the text — held in memory for one request, written to no file and no log (`server/reader.mjs`). In the pupil's own progress: what they wrote on the card (the explanation, the sentence, the three words and their connections) as typed, on their word card (§1g: only the pupil sees it, in their export, erased with the account). **A text's main idea and a story's summary (#39) are kept nowhere**, not in the progress either: only that the pupil was asked about that text (its id, like every Lesskilningur question), and whether the answer was right. A cost line per call, **anonymous**: the day, the model, the effort, the number of tokens and the price (`claude-cost.jsonl` in the data folder; no account, group or text). |
| **At Anthropic** | Under Anthropic's commercial terms, what is sent through the API is not used to train models. **Zero data retention** — nothing stored after the answer — is an arrangement for the *organisation* the key belongs to; it is not something a request can ask for. See below. |
| **Model** | Claude Opus 5.5 at low effort (default), or Claude Fable 5.2 (`FALLASKOLI_CLAUDE_MODEL=fable`). **Fable 5.2 requires 30-day retention at Anthropic and cannot run under zero data retention**: use it to compare on made-up texts, not for pupils, unless you accept and say that. |

**Before switching it on:**

1. **Zero data retention.** Ask Anthropic's sales team to enable zero data
   retention for the organisation the key belongs to (it is enabled per
   organisation, by Anthropic, and does not carry over to another
   organisation). Use a key of that organisation only. Keep the confirmation.
   Even then Anthropic may keep a request flagged for abuse for up to two
   years; the names are stripped for that reason too.
2. **Processor.** Anthropic becomes a processor (§4): accept their commercial
   terms and data processing addendum, keep the copy, and add Anthropic to
   §2's recipients and transfers (a US company).
3. **The notice.** A paragraph: which pupils, what is sent (their own
   explanation, their own sentence and three related words, the main idea of a
   text and the summary of a story they read, without names),
   to whom, that it is not kept by the server and not used for training, and
   that what they wrote on a word card stays on their own card.
   Then move `PRIVACY_VERSION` so those families consent again.
4. **The key.** `fly secrets set ANTHROPIC_API_KEY=…` — never in `fly.toml` or a
   file. Without it the server has no grader and the question does not exist.

Cost: roughly 2–9 US cents a reading at the planned settings; add up
`claude-cost.jsonl` to see the real figure. Limits: 120 readings an hour per
pupil, 1,200 characters, 15 seconds a reading (`server/grading.mjs`).

---

## 2. Record of processing (Art. 30) — *vinnsluskrá*

Fill in the bracketed parts and keep it with your papers. If Persónuvernd ever
asks for it they may want it in Icelandic; the content is what matters.

| | |
|---|---|
| **Controller** | [your name], [address], [the contact address in the notice] |
| **Purpose** | Running an Icelandic grammar trainer for invited children and their families: logging in, keeping progress across devices, an optional leaderboard within a group, (v6.14) letting the group's teacher or guardian see the group's error patterns and a pupil's skill map, set and check assignments and set a weekly class goal, (v6.14) live rounds in class and team duels set by the teacher, (v6.14) setting the difficulty of the questions from anonymous counts of right and wrong answers and checking the error diagnosis against an anonymous sample of wrong word forms, (v6.14) adapting the practice for a learner of Icelandic as a second language, and (v6.14) reading over a few sentences a pupil writes, where the group's guardian switches it on. |
| **Legal basis** | Consent, Art. 6(1)(a) — the user's own from 16, a parent's or guardian's below. Recorded per account. |
| **Data subjects** | Invited learners (mostly teenagers); their parents or guardians (name only, as the consent record); administrators. |
| **Data** | Username; nickname; password hash; role, group, status; date created; day last seen; consent record (who, when, how, notice version); visibility choices; progress (XP, levels, badges with dates, which words and inflection cells were practised and how often right or wrong, answers and minutes per day, settings); a dated history per word — for every answer about a word, the day, the kind of question and whether it was right, wrong or only seen, never what was typed (issue #8; in the learner's export, erased with the account, shown to nobody else — only the list of words that are hard now, worked out from it without dates, is shown to the group's guardian, issue #17, §1a); which words of the LÍNO-2 academic word list the learner is learning now and which they have learned, with the day each moved, and for a word that came back because it was hard how many times its word card must have been done (issues #12, #17; in the learner's export, erased with the account, shown to nobody else); the learner's word cards — per word, the day the card was finished, the learner's own rating of how well they knew the word and which options they chose on the card, what they added when the card came back in a review (a newer rating and/or a sentence of their own with the word, with the day; issue #18), and — for a learner the administrator switched on for server grading — their own explanation of the word, their own sentence with it and three related words with how each connects (issues #15, #37, #38; the learner's own text, §1g: in the learner's own export only, erased with the account, shown to nobody else, the administrator included); results of assignments set by the group's guardian (answered, right, finished); team duels (team, right answers); during a live round only, in memory, right answers and points; the learner's own choice about being counted in the statistics; whether Icelandic is the learner's second language (one yes/no, §1e); the Monday of the week the learner finished Ritun vikunnar, and — only where the group's guardian switched keeping on — the text the learner wrote there, with week and topic (§1f). For one day: how many of the account's answers have been counted that day (§1b). Transiently: IP address, for rate-limiting, in memory only. **Anonymous, not personal data:** the counts of right and wrong answers; and, only for groups whose teacher switched it on, the sample of wrong word forms (§1b). |
| **Not collected** | Email, real name, date of birth, kennitala, phone, photos, free text (the sample of §1b keeps single word forms that resemble the word asked about; the one exception is Ritun vikunnar, and only where keeping is switched on, §1f). No special categories (the second-language flag is not one, but is treated with care, §1e). |
| **Recipients** | Other users of the same group, only what the user switches on. The guardian(s) of the user's own group: the error-pattern figures, the skill map, assignment and team-duel results (§1a, §1d), the second-language flag (§1e), and kept Ritun vikunnar texts where keeping is on (§1f). The whole group, only when its guardian sets a weekly goal: one total for the week that the user's right answers or sessions are part of (§1c). The group, on the projector in a live round: the nickname of a pupil on the leaderboard among the top five, otherwise an alias (§1d). Processor: Fly.io, Inc. (hosting). Nobody else. |
| **Transfers outside the EEA** | Data is stored in Amsterdam. The processor is a US company certified under the EU–US Data Privacy Framework and bound by its data processing agreement (check the signed copy for the transfer terms). |
| **Retention** | While the account exists; erased after 18 months without a login; unanswered access requests after 30 days; backups at most 30 days. The one-day tally: until the next day. Anonymous counts fade by 15 % a week; a sampled answer is kept at most 12 months. A text written in Ritun vikunnar: not at all, or — with keeping on — at most 12 per pupil and 60 days, and all of a group's at once when keeping goes off. |
| **Security** | See §1. |
| **Last reviewed** | [date] |

---

## 3. Consent — how it works here

**The age.** Icelandic law lets a child consent to an online service alone from
**13** (Act 90/2018, Art. 10(5)). A government bill before Alþingi in the
2026–27 session would raise that to **15**. The program asks for a guardian
below **16**, which satisfies today's law, the bill, and GDPR's own default — so
nothing has to change when the law does. The number is one constant,
`CONSENT_AGE` in `server/privacy.mjs`.

**The three ways an account comes to exist, and what is recorded each time:**

| Route | Who consents | Recorded as |
|---|---|---|
| Invitation code (the normal one) | Under 16: the guardian types their name and ticks the box on the registration form. 16+: the user ticks it. | `by: "<guardian's name>"` or `"self"`, `how: "invite"`, the invitation's id |
| You create it (*Nýr notandi*, or `admin.mjs nyr`) | You enter the guardian's name, or tick "16 or older", after they told you so | `how: "admin"`, your id as `recordedBy` |
| Open registration or Google (off by default) | Nobody yet — the account waits | Cannot be admitted until you record consent under *Meira* |

Every record also holds the time and the version of the notice that was in
force. Accounts from before v6.3 have none: the list marks them *samþykki
vantar*. They keep working (nobody is locked out by an upgrade), and you should
record consent for each under *Meira*.

**Withdrawing consent** is deleting the account, and the notice says so. It
takes effect immediately; backups follow within 30 days.

**If you change the notice** in a way that matters (new data, a new recipient),
bump `PRIVACY_VERSION` in `server/privacy.mjs`, tell the families, and decide
whether the change needs fresh consent.

**Versions.** v6.12 and earlier published `2026-11-11`. v6.14 publishes one
new version, `2026-11-16`, which covers everything it adds: the group's teacher
sees error patterns, assignment and team-duel results and one pupil's skill map
(§1a, §1d); the anonymous count of answers, the optional sample of wrong
answers, and the sentence that a duel's answers are graded on the server and
not stored (§1b); the class goal's weekly total (§1c); live rounds in class
(§1d); the second-language flag (§1e) and Ritun vikunnar, the first free text a
pupil writes that the server may receive and, with keeping on, store for the
teacher (§1f). One message to the families covers all of it. (While v6.14 was
being built the date was moved for each of these on the branch; none of those
dates was ever published, so they are folded into this one.)

The date is the day the notice's text was settled, not the day you deploy, and
never a day in the future. `CALIBRATION_NOTICE` in the same file names the
first version that describes the anonymous count — `2026-11-16` as well — and
stays where it is when the notice changes again for something else; it must
never be later than the notice that is live (a test holds it).

---

## 4. Processors

| Who | For what | What you do |
|---|---|---|
| **Fly.io, Inc.** | Runs the server and holds the disk | Sign their Data Processing Agreement: Fly dashboard → your organisation → *Compliance* / documents. Keep the PDF. |
| Your domain registrar (if you use your own domain) | DNS only; sees no user data | Nothing |
| **Anthropic** — only if you set `ANTHROPIC_API_KEY` (§1h) | Claude reads what pupils you switched on wrote in their own words (explanation, own sentence, related words, a text's main idea, a story's summary), names stripped | Zero data retention for the key's organisation, their DPA, a paragraph in the notice — §1h, before the first pupil |

**Do not add** analytics, error-tracking services, an email provider or font
CDNs without adding them here, to §2 and to the notice. The content-security
policy the server sends will block most of them anyway, by design.

**Google login** is still in the code and off. It was changed in v6.3 to ask
Google for an identifier only (no email, no name), but it still tells Google
which children use the site, and Persónuvernd fined five municipalities in 2023
over Google's school services. For children, leave it off.

---

## 5. When somebody asks for something

You have one month to answer (Art. 12(3)). A parent may ask on behalf of a child
under 16; make sure it *is* the parent — the consent record names them.

| They ask | You do |
|---|---|
| "What do you hold?" | *Notendur → Meira → Sækja gögn*. Send them the file. (Or tell them the child can press *Sækja gögnin mín*.) |
| "Correct it" | Nickname: the user does it, or you do it. Nothing else here is free text. |
| "Delete it" | *Meira → Eyða alveg*. Tell them backups clear within 30 days. Delete any backup files of your own that are older. |
| "What does the teacher see?" | §1a, and the child's *Aðgangurinn minn* names the group's guardian. |
| "The teacher must not see it" | Move the child to a group of its own (*Meira → Hópur*), or erase the account. |
| "Take them off the leaderboard" | The user's own switch — or *Taka af stigatöflu* if they cannot. |
| "Do not count my child's answers" | The child unticks *Telja svörin mín með í nafnlausri talningu* under *Aðgangurinn minn* (it also keeps them out of the answer sample). For everybody: `FALLASKOLI_CALIBRATION=0`. |
| "Delete what my child typed" | Nothing typed is stored unless the group's teacher switched the sample on. If so: the sample is anonymous and cannot be searched by child — press *Eyða sýninu* on the admin page, which erases all of it. |
| "Stop processing but keep it" (restriction) | *Útiloka* — the account is blocked and its progress kept. |
| A complaint | Answer it. They may also go to Persónuvernd, and the notice tells them so. |

Note each request and what you did; a line in a notebook is enough.

---

## 6. Retention, in one place

| What | How long | Who does it |
|---|---|---|
| An account and its progress | Until deleted, or 18 months without a login | Automatic; the user list shows *eyðist <date>* in the last 60 days so you can warn the family |
| A request for access you have not answered | 30 days | Automatic |
| Expired or used-up invitations | 30 days after expiry | Automatic |
| Login sessions | 30 days | Automatic |
| Fly's disk snapshots | 30 days | Automatic (`snapshot_retention`) |
| Backups you downloaded | **30 days** | **You.** This is the only one the program cannot do for you. |
| The audit trail | The last 2,000 entries; ids, never names | Automatic |
| The monthly badge-rarity count | 24 months; anonymous counts | Automatic |
| An assignment and its results | 30 days after its deadline | Automatic (`ASSIGN.keepDays`, printed in the notice from the same constant) |
| A live round | In memory only; 10 minutes after it ends, or at a restart | Automatic (`LIVE.keepMs`) |
| A team duel and its results | 30 days after it is over; a challenge nobody accepted after 3 days | Automatic (`TEAM.keepDays`, `TEAM.pendingDays`) |
| How much an account has contributed to the count today | Until the next day; at once when the account is erased; never in a backup | Automatic |
| The anonymous counts of right and wrong answers | They fade: ×0.85 every week, and a count that has faded to nothing is dropped | Automatic |
| The log of what calibration changed | The last 60 weekly runs; no people in it | Automatic |
| A sampled wrong answer (only if a teacher switched it on) | 12 months (`SAMPLE.months`, printed in the notice), at most 500 at a time | Automatic; *Eyða sýninu* erases all at once |
| An answer Claude read — explanation, own sentence, related words, a text's main idea, a story's summary (§1h) | Not on the server: one request in memory. On the pupil's own word card, as their progress (not the main idea or the summary: those nowhere). At Anthropic: nothing, under zero data retention (30 days for Fable 5.2) | Automatic, given §1h's arrangement |
| The cost log of Claude readings | Anonymous lines (day, model, tokens, price); until you delete `claude-cost.jsonl` | You |
| A text written in Ritun vikunnar | Not kept, unless the group's guardian switched keeping on: then at most 12 per pupil and 60 days (`WRITING.keepPerPupil`, `WRITING.keepDays`, printed in the notice) | Automatic; switching keeping or the check off erases the group's texts at once |

---

## 7. If something leaks — the breach plan

A "breach" is any of: somebody got into an account that is not theirs; the data
folder or a backup file went somewhere it should not; the server was broken
into; you sent a file to the wrong person; a laptop with a backup on it was lost.

**Within the hour — stop it.**

1. Take the server offline if it is still happening: `fly scale count 0`.
2. One account: *Meira → Nýtt lykilorð* (this logs it out everywhere).
   The administrator's: `fly ssh console -C "node server/admin.mjs lykilord <name>"`.
3. If you cannot tell how far it went: reset every password (*Nýtt lykilorð*
   on each row). Each reset logs that account out on every device.
4. Write down the time you noticed. **The 72 hours run from here.**

**The same day — find out what.**

- *Atburðaskrá* and `fly logs`: what was done, from when.
- Which accounts, and what was in reach: nicknames and progress (low risk);
  usernames and password hashes (reset them); guardians' names in the consent
  records.
- A lost **encrypted** backup whose passphrase was not with it is very unlikely
  to be a risk to anybody — record it and why, and you are probably done.

**Within 72 hours — notify Persónuvernd**, unless the breach is unlikely to be
a risk to anybody (Art. 33). Use the breach notification form on
`personuvernd.is`. They ask: what happened and when; what kind of data and
roughly how many people; likely consequences; what you have done. Send what you
know on time and the rest later — late is worse than incomplete.

**Tell the families** without delay if the risk to them is high (Art. 34) — for
example if passwords may be guessable and reused elsewhere. In plain words:
what happened, what it means for them, what you did, what they should do
(change the password anywhere it was reused).

**Afterwards — write it down**, notified or not (Art. 33(5)): date, what, who
was affected, what you did, whether you notified and why or why not. Keep it
with §2.

---

## 8. What would change the picture

- **A school or a municipality uses it.** Then *they* are the controller and you
  are their processor: they need a processing agreement with you, they will
  almost certainly need a data protection impact assessment, the legal basis is
  no longer consent, and a US host becomes a much harder conversation.
  Persónuvernd's 2023 decisions on school software are the reading list.
- **It is opened to the public.** Volume alone changes the risk; an impact
  assessment and a proper database come first.
- **You add email.** A new category of data, a new processor, a new way in
  ("forgot password") — §2, §4 and the notice all change.
- **The bill on the age of consent passes.** Nothing to do: 16 already covers 15.
- **More than about a hundred users.** Nothing legal changes; the storage
  should move from JSON files to SQLite (`server/store.mjs` is the one file).

---

## Is an impact assessment (DPIA) needed?

Probably not required at this scale: no special categories, no large-scale
processing, no systematic monitoring. Children's data does raise the bar, and
the honest answer to "what could go wrong" is short enough to write down here:

| Risk | What limits it |
|---|---|
| A child's practice habits visible to peers | Off by default; own switch; minutes separate; groups isolated |
| A child's weak points visible to a teacher | Only the guardian of their own group; figures the child sees too, no examples, no dates, nothing typed; named on the child's page; the role is the controller's decision per group |
| An account taken over | Rate limits; hashed passwords; reset logs out everywhere; nothing sensitive inside |
| The data folder exposed | No contact details or real names in it by design; hashes, not passwords; encrypted backups |
| Data kept after it is wanted | Automatic retention; one erasure for every route |
| A published difficulty adjustment revealing how one child does | Nothing is adjusted on fewer than three accounts; the table says nothing about who |
| Something personal typed into an answer box and kept in the sample | Off by default, per group, a teacher's audited choice; only single words resembling a form of the word asked about pass; no account, group or day beside them; 500 at most, 12 months |
| Somebody flooding the count to make the program easier or harder | Caps per account per day and per number; shrinkage; a quarter step a week, one level at most; accounts held for review are not counted |
| The host misusing data | DPA; EEA region; nothing but this app on the machine |
| A pupil's own words sent to an outside model (§1h) | Off unless the administrator switches one pupil on; names stripped; nothing kept on the server; zero data retention at Anthropic; the model only ticks a rubric and writes nothing the pupil reads |

If you would rather be certain, Persónuvernd publishes a list of processing that
requires an assessment; check it against the above.
