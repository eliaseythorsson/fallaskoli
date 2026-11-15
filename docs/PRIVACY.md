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
| Collect as little as possible | No email, no birth date, no real name, no kennitala. A username, a nickname, a password hash, progress. Answers are never stored — only whether they were right. |
| Private by default (Art. 25) | Nobody is on the board or roster until they switch it on themselves; minutes are a second switch. Groups never see each other. |
| Consent that can be shown (Art. 7, 8) | Each account records who consented, when, and to which version of the notice (§3). |
| A notice a child can read (Art. 12–13) | `/personuvernd`, linked from the login card and from *Aðgangurinn minn*. Its retention figures are read from the same settings the server acts on. |
| Access and portability (Art. 15, 20) | *Sækja gögnin mín* — everything, one JSON file. You have the same button per user. |
| Rectification (Art. 16) | The user changes their own nickname and password. |
| Erasure (Art. 17) | *Eyða aðganginum mínum*, your *Eyða alveg*, and the retention sweep all run the same erasure: account, progress, curriculum ceiling, sessions, hidden-list entry, invitation trace. |
| Storage limitation (Art. 5(1)(e)) | Unused accounts erased after 18 months, unanswered requests after 30 days, automatically. |
| Security (Art. 32) | Passwords as scrypt hashes; session tokens stored hashed; HTTPS only; login and registration rate-limited per address; strict content-security policy; the server does not run as root; backups encrypted with your passphrase. |
| No third parties | The page loads nothing from anybody: fonts are inside the file. No analytics, no advertising. One cookie, strictly necessary, so no cookie banner. |
| Accountability | *Atburðaskrá* records every administrative action, by id. |

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

## 2. Record of processing (Art. 30) — *vinnsluskrá*

Fill in the bracketed parts and keep it with your papers. If Persónuvernd ever
asks for it they may want it in Icelandic; the content is what matters.

| | |
|---|---|
| **Controller** | [your name], [address], [the contact address in the notice] |
| **Purpose** | Running an Icelandic grammar trainer for invited children and their families: logging in, keeping progress across devices, an optional leaderboard within a group. |
| **Legal basis** | Consent, Art. 6(1)(a) — the user's own from 16, a parent's or guardian's below. Recorded per account. |
| **Data subjects** | Invited learners (mostly teenagers); their parents or guardians (name only, as the consent record); administrators. |
| **Data** | Username; nickname; password hash; role, group, status; date created; day last seen; consent record (who, when, how, notice version); visibility choices; progress (XP, levels, badges with dates, which words and inflection cells were practised and how often right or wrong, answers and minutes per day, settings). Transiently: IP address, for rate-limiting, in memory only. |
| **Not collected** | Email, real name, date of birth, kennitala, phone, photos, free text. No special categories. |
| **Recipients** | Other users of the same group, only what the user switches on. Processor: Fly.io, Inc. (hosting). Nobody else. |
| **Transfers outside the EEA** | Data is stored in Amsterdam. The processor is a US company certified under the EU–US Data Privacy Framework and bound by its data processing agreement (check the signed copy for the transfer terms). |
| **Retention** | While the account exists; erased after 18 months without a login; unanswered access requests after 30 days; backups at most 30 days. |
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

---

## 4. Processors

| Who | For what | What you do |
|---|---|---|
| **Fly.io, Inc.** | Runs the server and holds the disk | Sign their Data Processing Agreement: Fly dashboard → your organisation → *Compliance* / documents. Keep the PDF. |
| Your domain registrar (if you use your own domain) | DNS only; sees no user data | Nothing |

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
| "Take them off the leaderboard" | The user's own switch — or *Taka af stigatöflu* if they cannot. |
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
| An account taken over | Rate limits; hashed passwords; reset logs out everywhere; nothing sensitive inside |
| The data folder exposed | No contact details or real names in it by design; hashes, not passwords; encrypted backups |
| Data kept after it is wanted | Automatic retention; one erasure for every route |
| The host misusing data | DPA; EEA region; nothing but this app on the machine |

If you would rather be certain, Persónuvernd publishes a list of processing that
requires an assessment; check it against the above.
