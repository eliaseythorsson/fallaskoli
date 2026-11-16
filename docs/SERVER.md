# Putting Fallaskóli on a web server

This document is written for somebody who **does not write code**. It is not a
code snippet with commentary around it — it is a sequence of steps. Each step
says what you type, what you should see, and what to do if you do not see it.

You do not need to understand anything that happens underneath. You need to be
able to copy a line, paste it, and read the answer.

**Time:** part one (on your own computer) takes ten minutes. Part two (on the
internet) takes about an hour the first time.

---

> **v6.3 — read this first.** Part 1 below (trying it on your own computer) is
> current. For putting it on the internet, **`docs/HOSTING.md` replaces Part
> 2**: it uses Fly.io, which runs the program for you, so there is no machine to
> rent, patch or back up. Part 2 is kept for anybody who prefers their own
> machine, and has been corrected: the service no longer runs as root, and the
> data lives outside the program folder so an upgrade cannot forget it.
> What you are responsible for towards the families is in `docs/PRIVACY.md`.

## Part 0 — what you are about to do, in one sentence

Today your son opens a file on his computer. After this he opens a **URL**, logs
in with a username, and his progress lives on a machine that is always running —
so it follows him between phone and computer and is not lost if the browser
storage is cleared.

Three things come with it that were not possible before: a **leaderboard**,
**badge rarity** (which needs more than one user to exist at all) and your
**admin page**.

---

## Part 1 — try it on your own computer first

Do not start on the internet. Start here, because here a mistake costs nothing.

### 1.1 Get Node

You need a program called **Node.js**, version 20 or newer. Download it from
`https://nodejs.org` and install it like any other program (next, next, done).

To check that it worked, open a **command window**:

- **Mac:** press ⌘ + space, type `Terminal`, press Enter.
- **Windows:** press the Windows key, type `PowerShell`, press Enter.

Type:

```
node --version
```

**You should see** something like `v22.11.0`. If you see `command not found` the
installation did not work — install Node again and open a **new** command window
(the old one does not know about the new program).

### 1.2 Get Python

The build also needs **Python, version 3.10 or newer**. In the same command
window, type:

```
python3 --version
```

**You should see** `Python 3.10.x` or higher.

On a Mac you will very likely see `Python 3.9.6` instead, or
`command not found`. The Python that comes with macOS is too old — the
Icelandic grammar libraries the build uses are not published for it, and the
build will stop with a confusing complaint that a library version "could not be
found". Install a current Python from `https://www.python.org/downloads/`
(next, next, done), open a **new** command window, and check again.

You do not need to do anything else with Python. The build finds it by itself.

### 1.3 Go to the folder and build the program

```
cd <the path to the fallaskoli folder>
./build.sh
```

This takes a few minutes the first time. **You should see** the line
`built dist/fallaskoli-v<version>.html` at the end (the version is in
`package.json`). If it stops, the message says why: a
missing Python, a data change waiting for `--accept`, or a failing test.

### 1.4 Create your administrator account

```
node server/admin.mjs nyr <your-username> --umsjon
```

(The subcommands of this tool are in Icelandic: `nyr` = new, `listi` = list,
`opna` = admit, `loka` = block, `lykilord` = new password. They are the tool's
interface, not documentation, so they have been left alone.)

**You should see** three lines, and the middle one is your password:

```
Búinn til: jon  (admin)
Lykilorð:  hestur-tunga-máfur-diskur
Skrifaðu það niður — það birtist ekki aftur.
```

Write it down **now**. It is not stored anywhere in readable form and it will not
appear again. If you lose it, make a new one with
`node server/admin.mjs lykilord <username>`.

> The password is four Icelandic words rather than a random string on purpose:
> it should be possible to read it aloud down the phone and write it on paper.

### 1.5 Start the server

```
node server/server.mjs
```

**You should see:**

```
Fallaskóli þjónar á http://localhost:8080
  notendur: 1   Google: nei
```

Open `http://localhost:8080` in a browser. **You should see a login screen.** Log
in with the name and password from 1.4.

To stop the server: press `Ctrl` + `C` in the command window.

### 1.6 Create an account for the child

Three routes, all correct. Each one records **who consented** to the account,
because for anybody under sixteen that has to be a parent or guardian
(`docs/PRIVACY.md` §3).

**An invitation — the normal one.** On the admin page (**Stillingar og
námsefni → Umsjón → Boðskóðar**) you make a code and give it to the parent. On
the login screen they choose *Ég er með boðskóða*; a child under sixteen gets no
further until the parent has typed their own name and ticked the box.

**You make it, on the admin page.** *Notendur → Nýr notandi*. You enter the
guardian's name (or tick "16 or older") and get a password to hand over.

**You make it, from the command window.**

```
node server/admin.mjs nyr <the-child's-name> --forsja="The parent's name"
```

Nobody can register without an invitation. A program for children should not be
open to whoever finds the URL.

### 1.7 Move across the progress that already exists

If he has already practised in the old file, this happens **automatically** the
first time he logs in **in the same browser he practised in**: the progress moves
up to the server and the local copy is left untouched.

If it is a different browser or a different computer: open the old file there, go
to **Stillingar og námsefni → Færa milli tækja** and press **Afrita framvindu**
(the progress is copied as text; save it in a file), then log in on the server,
open the same place and press **Líma inn framvindu** or **Lesa inn skrá** with it.

Do this **before** you start using the server in earnest. Moving progress is the
only operation in the whole program that can lose data, and it is simple while
there is little to move.

---

## Part 2 — onto the internet

It now works on your computer. For it to work from his phone, from school and at
his grandmother's, three things are needed: a **machine that is always running**,
a **name** and a **certificate** (that is the `https` padlock).

### 2.1 Choose a machine

The cheapest option is enough several times over. Fallaskóli uses under 100 MB of
memory and writes a few kilobytes a day. For a family or a class, the **smallest
VPS on offer** (5 dollars a month, 1 GB of memory) is far more than enough.

Names that work: Hetzner, DigitalOcean, Vultr, Linode, 1984 Hosting (Icelandic).
Choose **Ubuntu 24.04** when asked about an operating system. Choose a machine in
Europe — the response is quicker and the data stays inside GDPR.

Two more choices on that page matter, and both are easy to get wrong, because
the wrong answer is usually the cheaper one:

- **Processor: choose Intel or AMD — not ARM.** Hosts now also sell ARM
  machines (Hetzner calls them CAX; elsewhere they say "Ampere" or "Arm64")
  and they cost a euro or two less. The Icelandic grammar libraries the build
  needs are published ready-made for Intel and AMD only. On ARM the build has
  to compile them itself, which takes a long time and often fails.
- **Do not pick an older Ubuntu or Debian.** 24.04 is right. Debian 12 also
  works. Debian 11 and Ubuntu 20.04 carry a Python that is too old, and
  `./build.sh` in 2.4 will stop and say so.

You get an **IP address** by email, something like `203.0.113.45`. Keep it.

### 2.2 Get onto the machine

```
ssh root@203.0.113.45
```

(with your own IP address). The first time it asks whether you trust the machine
— answer `yes`. **You should see** a command line ending in `#`. You are in.

### 2.3 Install Node and Python

The program runs on Node. The build that produces it also needs Python — the
Icelandic word forms and the grammar checking are done there. Ubuntu has Python
already, but not the part that installs libraries, so ask for that too.

Paste these in order:

```
apt update && apt install -y nodejs npm git python3 python3-pip
node --version
python3 --version
```

**You should see** two version numbers: Node **20 or higher**, and Python
**3.10 or higher**.

If Node is lower:

```
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs
```

If Python is lower than 3.10, the machine is running an operating system older
than the one asked for in 2.1. The simplest cure is to throw the machine away
and make a new one with Ubuntu 24.04 — you have not put anything on it yet.

### 2.4 Get the program there

The easiest way is to copy across the zip file you were given. On **your own
computer**, in a new command window:

```
scp fallaskoli-v<version>-src.zip root@203.0.113.45:/opt/   # the zip you were given
```

Then, back on the machine:

```
cd /opt && apt install -y unzip && unzip fallaskoli-v<version>-src.zip
mv fallaskoli-v<version> fallaskoli && cd fallaskoli && ./build.sh
```

The build takes a few minutes. **You should see** `built dist/fallaskoli-v<version>.html`.

### 2.5 Create the accounts and try it

```
node server/admin.mjs nyr <your-name> --umsjon
node server/server.mjs
```

Open `http://203.0.113.45:8080` in a browser. **You should see** the login. Do
not admit anybody yet — the padlock is still to come.

Stop it with `Ctrl` + `C`.

### 2.6 Make it start by itself

Right now the server only runs while the command window is open. That needs
fixing — otherwise the program goes dark when you close your laptop, and again
every time the machine restarts.

First a user for it to run as, and a folder for the data that is **not** inside
the program folder — so that an upgrade replaces the program and cannot touch
the data:

```
useradd --system --home /var/lib/fallaskoli --create-home fallaskoli
chmod 700 /var/lib/fallaskoli
```

Then create the file with **this single command** (paste everything from `cat`
to the line that says only END), with your own name and address in the two
lines that have them:

```
cat > /etc/systemd/system/fallaskoli.service <<'END'
[Unit]
Description=Fallaskoli
After=network.target

[Service]
WorkingDirectory=/opt/fallaskoli
ExecStart=/usr/bin/node server/server.mjs
Environment=PORT=8080
Environment=FALLASKOLI_DATA=/var/lib/fallaskoli
Environment=FALLASKOLI_TRUST_PROXY=1
Environment="FALLASKOLI_CONTROLLER=Your Name"
Environment=FALLASKOLI_CONTACT=you@example.is
Restart=always
User=fallaskoli
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/fallaskoli
PrivateTmp=true

[Install]
WantedBy=multi-user.target
END
```

(`/opt/fallaskoli` is the folder from 2.4, renamed from `fallaskoli-v<version>` so the
name does not change with every version. Run the admin tool as the same user
and with the same data folder:
`sudo -u fallaskoli FALLASKOLI_DATA=/var/lib/fallaskoli node server/admin.mjs listi`.)

Then:

```
systemctl enable --now fallaskoli
systemctl status fallaskoli
```

**You should see** the words `active (running)` in green. Press `q` to get out.

From here on the server starts on every reboot and restarts itself if it falls
over.

### 2.7 The name

An IP address works but cannot be remembered, and it is not enough for `https`.
Buy a domain (`isnic.is` for `.is`, `namecheap.com` for `.com` — 1,500-3,000 ISK
a year).

In the domain's control panel you create one record:

| Field | Value |
|---|---|
| Type | `A` |
| Name | `@` (or `fallaskoli`) |
| Value | your IP address |

It takes anything from a few minutes to a few hours to take effect. Check with
`ping fallaskoli.is` — **you should see** your IP address in the answer.

### 2.8 The padlock (https) — and this one is not optional

Without `https` the children's passwords travel across the internet **unlocked**.
This must not be skipped, and fortunately it has become easy and free.

```
apt install -y caddy
```

```
cat > /etc/caddy/Caddyfile <<'EOF'
fallaskoli.is {
    reverse_proxy localhost:8080
}
EOF
```

(put your own domain in place of `fallaskoli.is`). Then:

```
systemctl restart caddy
```

Caddy fetches the certificate itself, installs it itself and renews it itself
every three months without you doing anything.

Open `https://fallaskoli.is`. **You should see** a padlock in the address bar and
the login. Then you are done.

> **Why Caddy and not nginx:** nginx requires you to set up `certbot`, understand
> what `server_name` means and fix the configuration when the certificate
> expires. Caddy is three lines and never forgets to renew.

### 2.9 Backups

All the data — users, progress, badges, the data set — is in **one folder**:
`/var/lib/fallaskoli`. That is deliberate: a backup plan you can actually carry
out is one that says "copy a folder".

The copy that should leave the machine is the **encrypted** one: on the admin
page, **Umsjón → Öryggisafrit**, choose a passphrase and download. Do it once a
month, keep the passphrase somewhere other than the file, and delete copies
older than 30 days (they still contain people who have since deleted their
accounts). To read one back in:

```
systemctl stop fallaskoli
sudo -u fallaskoli FALLASKOLI_DATA=/var/lib/fallaskoli FALLASKOLI_BACKUP_KEY='your passphrase' node /opt/fallaskoli/server/backup.mjs lesa afrit.json
systemctl start fallaskoli
```

A daily copy on the machine itself protects against mistakes (not against the
machine disappearing), kept for 30 days and readable only by root:

```
(crontab -l 2>/dev/null; echo "0 3 * * * umask 077; tar czf /root/fallaskoli-\$(date +\%F).tgz /var/lib/fallaskoli && find /root -name 'fallaskoli-*.tgz' -mtime +30 -delete") | crontab -
```

---

## Part 3 — Google login (optional)

A username and password are enough. If you want Google as well:

1. Go to `https://console.cloud.google.com` and create a project.
2. **APIs & Services -> Credentials -> Create OAuth client ID -> Web application.**
3. Under *Authorized redirect URIs* type exactly:
   `https://fallaskoli.is/auth/google/callback`
4. You get a **Client ID** and a **Client secret**.
5. Add them to the service file (`/etc/systemd/system/fallaskoli.service`), under
   `Environment=PORT=8080`:

```
Environment=GOOGLE_CLIENT_ID=<what you were given>
Environment=GOOGLE_CLIENT_SECRET=<the other thing you were given>
```

6. `systemctl daemon-reload && systemctl restart fallaskoli`

Google login **also** yields `pending` — you admit people as before. If this is
not configured, the program says so plainly instead of breaking.

---

## Part 4 — running it day to day

| What you want | What you type |
|---|---|
| See whether everything is fine | open `https://fallaskoli.is/health` in a browser |
| Restart | `systemctl restart fallaskoli` |
| See what happened | `journalctl -u fallaskoli -n 50` |
| A new user, an invitation, a new password, a group | **Stillingar og námsefni → Umsjón** in the program |
| Admit, block, take off the leaderboard, erase | the same place, under *Meira* on each row |
| Install the dictionary | Umsjón -> *Hlaða upp skrá* |
| Upgrade to a new version | §5 below |

(`/heilsa` still answers as well — it was the original name of the health check
and anything already pointed at it keeps working.)

### 4.1 The admin page

It is the **Umsjón** section of **Stillingar og námsefni** and **only you can see it**. It holds:

- **The data set** — one button. You choose the JSON file once and it goes up
  whole. After that every word definition comes from there and the program
  **never** sends a request per word. The status shows what is installed, when,
  and how many definitions.
- **Users** — everyone, with a status. *Hleypa inn* (admit), *Útiloka* (block),
  *Fela úr stigatöflu* (hide from the leaderboard). Blocking takes nothing away
  from the progress; it waits intact.

You cannot lock yourself out or remove your own administrator rights — the server
refuses. Otherwise nobody could get in to undo it.

### 4.2 A teacher for a class (v6.13)

Make a group for the class, and an account for the teacher with the role
**forsjáraðili eða kennari** in that group (*Nýr notandi*, or *Meira → Hlutverk*).
That account then has a part of its own at the top of **Skólastofan**:

- **Verkefni** — homework for the group: a category, an error pattern, a node
  of the curriculum map or all of a year's material; 5–30 questions; a
  deadline up to 60 days ahead; a short note. The pupils see it at the top of
  *Æfa* and start it with one tap. The teacher sees who finished, their
  scores, and the class's patterns on that material. At most 12 open at once
  per group; each is erased 30 days after its deadline, results and all.
- **Villumynstur hópsins** — every pupil of the group down the side, the error
  patterns across the top (the class's worst first), the share of recent
  answers that went wrong in each cell, and a *CSV* download for a
  spreadsheet.
- **Lifandi umferð** — a round of 5, 10 or 15 questions on the projector,
  answered by the whole class at once on their own devices, 20–90 seconds a
  question. The teacher opens it (*Opna á skjávarpanum*), the pupils press
  *Vera með* on the strip that appears above their question, and the teacher
  starts. After each question the wall shows how many got it right, the answer
  and the top five; at the end the podium and the class's commonest error with
  its rule. Pupils who have not chosen to be on the leaderboard appear on the
  wall as *Leikmaður 1, 2 …*. A round lives in the server's memory only — see
  below.
- **Bekkjareinvígi** — the group split into two even teams, or the group
  against another group (whose teacher must accept). Each pupil plays it on
  their own within 1–7 days; the team with the higher mean of right answers
  wins.

**A live round and the server.** A round is held in the server's memory and
never written to disk, so **restarting the server, or deploying a new version,
ends every round that is running** — the teacher simply starts a new one. Do
upgrades outside lessons. The screens follow the round over a long-lived
connection (*server-sent events*). Caddy (§2.8) passes these on as they come,
and so does Fly.io; nginx does too, because the server sends
`X-Accel-Buffering: no`. If you put some other proxy in front, it must not
buffer `text/event-stream` responses. One round of 30 pupils is about 35 open
connections; the server allows 40 rounds and 800 connections at once.

A guardian sees **only their own group**. You, the administrator, see the same
part for every group (a group picker appears). What a teacher sees, and what
they do not, is in `docs/PRIVACY.md` §1 and in the notice; the pupils' own
account page names their group's teacher.

**Before you upgrade:** look at who has the guardian role in each group. A
parent you made guardian of a group of several families will, from v6.13, see
the patterns of every child in it. If that is not what the families agreed to,
give each family its own group, or change the role.

### 4.3 Difficulty that sets itself (v6.13)

**You do not have to do anything in this section, ever.** It is here so that
you know what the server is doing on its own, and where the off switch is.

The levels of the questions were set by hand, and the hardness of each word
and inflection cell was measured on the paradigm. Neither knows what pupils
actually find hard. So the server now counts, **anonymously**, how often each
kind of question is answered right — per question type, level (þyngd), cell
and irregularity score — and once a week it works out from those counts
whether something is harder or easier than it was labelled, and adjusts:

| What is adjusted | How far it can ever move |
|---|---|
| A question type's place on the level scale (a type pupils at þyngd 3 find harder than the other þyngd-3 questions is built for them as if they were a little lower) | a quarter of a level per week; never more than **one level** from where it was built |
| How hard an inflection cell counts (e.g. genitive plural) on the 1–5 scale | a quarter of a point per week; never more than **one point** |
| What an irregularity score (1–5) is worth | the same |

The browser fetches the small table of adjustments when the program loads and
applies it. A browser with no server (the file opened from disk, a hosted
page), or a server with too little data, uses the built-in values exactly as
before — the table only ever *adjusts*; no question is created or changed by
it. Duels ignore it, so both sides always get the same questions.

**Why it is safe to leave alone:**

- *Few answers change little.* Every estimate is pulled towards the built-in
  value with the weight of 40–60 answers, nothing moves on fewer than 40–60
  answers or on a difference that could be chance, and each thing is compared
  with the **typical** other question at that level (the median), so one odd
  type cannot drag the others.
- *One pupil is not a measurement.* Nothing is adjusted unless at least **3**
  different pupils contributed to that number on one day and at least 3
  counted pupils have been active in the last two weeks. A family server with
  one or two children therefore never adjusts anything — that is intended;
  the per-pupil difficulty (their own level per category) already handles it.
- *A flood cannot move it far.* One account can contribute at most 400
  answers a day, and towards any one number only 12 (a type and level) or 8
  (a cell) a day. Someone sending ten thousand wrong answers is counted as
  one pupil having a bad day. An account held for implausible numbers
  (*í yfirferð*) is not counted at all, and neither are you or the teachers.
- *Old answers fade.* Each week every count is multiplied by 0.85, so last
  term's pupils do not decide this term's difficulty, and the file stays small
  (at most 8,000 keys).

**The record.** *Umsjón → Sjálfvirk kvörðun og villugreining* shows the last
runs: when, how many pupils, how many new answers, and each value that moved
(*spurningagerð fill, þyngd 3: 0 → −0,25*). A run that changed something is
also a line in *Atburðaskrá* (`kerfi — kvörðun`). It is a log, not a to-do
list.

**The off switch.** Two settings (in `fly.toml` under `[env]`, or the
`Environment=` lines of the systemd unit), then restart:

| Setting | Effect |
|---|---|
| `FALLASKOLI_CALIBRATION=0` | Nothing is counted, no table is handed out — every browser is back on the built-in values at its next load — and no answers are sampled. What is already stored stays in `calibration.json`; delete that file if you want it gone. |
| `FALLASKOLI_CALIBRATION=strict` | As normal, but only pupils whose consent was recorded for the privacy notice of 2026-11-16 or later (or who ticked the box themselves under *Aðgangurinn minn*) are counted. See `docs/PRIVACY.md` §1b. |
| `FALLASKOLI_SAMPLES=0` | The sample of wrong answers (below) cannot be switched on by anybody. |

**Whose answers are counted.** Learners with a consent record, unless they
untick *Telja svörin mín með í nafnlausri talningu* under *Aðgangurinn minn*.
Only fresh questions of ordinary practice: not reviews, rescue drills, "Þrjár
í röð", duels, second tries or hinted answers.

**The files** (in the data folder): `calibration.json` (counts, the table, the
log — no account in it), `calibration-quota.json` (how much each account has
contributed *today*; replaced every day, not in backups), `samples.json`.

#### The sample of wrong answers (off unless a teacher turns it on)

The error diagnosis (*villugreining*) was only ever tested on mistakes somebody
made up. To check it against what pupils really write, a **teacher can switch
on, for their own group**, an anonymous sample of wrong inflected forms:
*Skólastofan → Fyrir kennarann → Sýni af röngum svörum*. It is **off by
default**, because it is the one place where something a child typed is kept.
What is kept, at most 500 in all: the word asked about, the form expected, the
form typed (one word, and only if it resembles a form of that word — a name or
a sentence is dropped), and how the diagnosis classified it. No account, no
group, no date beyond the month; a sample expires after 12 months.

The server then checks the diagnosis **by itself**: every sampled answer is
compared with all the forms of its word, and *Sjálfvirk kvörðun og
villugreining* shows, per error pattern, how often that comparison disagrees
with what the pupil was told, how often the form was ambiguous, and how many
answers the diagnosis could not read. *Sækja sýnið* downloads the sample; saved
as `tests/fixtures/wrong-answers.json` it becomes part of the test suite.
*Eyða sýninu* empties it.

**Before a teacher switches it on, the families of that group should be told**
(`docs/PRIVACY.md` §1b).

### 4.4 How many pupils one server carries (v6.13)

**In one sentence:** one server carries **about 300 pupils practising in the
same few minutes** with every answer saved in well under a second; around 500
it starts to make pupils wait, and at 1,000 at once it fails. Only pupils
practising *at the same time* count — a school of 1,000 whose classes practise
in different lessons is a few hundred at once. **On Fly.io give the machine
1 GB of memory** before more than about 150 pupils use it at once (below).

**How it was measured.** `node tools/load-test.mjs` (the method is written at
the top of that file) starts the real server on a fresh temporary data folder,
with N pupils in classes of 25 and a teacher for each class, every pupil with a
real state made by the program's own simulator (38 KB on average: three weeks
to three months of practice). Everybody logs in; then **all N practise at
once**: each opens the program at a random moment in the first minute (the
eleven requests a page load makes), answers a question every 12 seconds or so
(each answer saves the state), sends the anonymous calibration counts, ends a
session every ten answers (the board, the class goal and the assignments again,
the assignment result, and one time in five a duel with a classmate), while the
teachers look at their class page. It reports how long every kind of request
took, every error, the server's CPU and memory, and how the data folder grew.

```
node tools/load-test.mjs --pupils 30,300 --seconds 150 --arrive 60
node tools/load-test.mjs --pupils 1000 --profile      # where the CPU goes
```

**What it measured** (November 2026, v6.13 before release; a container with
2 CPUs, Node 22.23.4, which other jobs were sharing — two runs of the same size
differed by a factor of ten at the slow end, so read the table as sizes):

| pupils at once | errors | saving an answer, p95 | opening the program, p95 | server CPU, mean / busiest second | memory, peak |
|---:|---:|---:|---:|---:|---:|
| 30 | 0 | 73 ms | 0.2 s | 3% / 42% | 314 MB |
| 150 | 0 | 78 ms | 0.4 s | 10% / 42% | 375 MB |
| 300 | 0 | 94 ms (2.3 s in a run while the machine was busy with other work) | 0.2 s (0.6 s) | 32% / 100% | 467–556 MB |
| 500 | 0 | 301 ms | 1.1 s | 42% / 98% | 628 MB |
| 1,000 | ≈ 3,100 requests; 14% of pupils could not open the program | 2.9–3.6 s | 82 s | 53–58% / 100% | 1.1 GB |

(Saving: after everybody had arrived. Opening: all eleven requests of a page
load. CPU: of one core — Node answers on one thread, so a second at 100% is a
second in which everybody waits.)

At 1,000 the first minute is the end of it: a thousand page loads arrive
faster than one thread can answer them, requests queue for over a minute, and
the server's own 60-second limit cuts them off — pupils would see the program
fail to open. Nothing was lost on the server side: every save that arrived was
written whole.

**What gives way first, and why.** The profile (`--profile`): the largest
single cost is `clone` in `server/store.mjs` — every request makes a full copy
of the list of users and the list of sessions, so each request costs more the
more accounts there are, and the total grows with the *square* of the number
of pupils. At 500 pupils it was 40% of the time the server was busy; at 1,000,
with the garbage collector clearing up after it, nearly two-thirds. The
second is that every write — a save, a duel, the calibration counts, a login —
waits in one queue (`serial` in store.mjs), each as a chain of file
operations. Disk is not the problem: a state is rewritten in place, so the
data folder grows by the size of the states (≈ 40 KB per pupil after a few
months; 1,000 pupils ≈ 40 MB), not by the number of answers.

**Memory is the limit on Fly.io before the processor is.** The server holds
every pupil's state in memory along with what it works out from them (the
board, rarity): about 250 MB for the program and its vocabulary, and roughly
0.7–1 MB more per pupil practising. `fly.toml` gives the machine 512 MB, which
is enough for a family or two classes (≈ 150 at once). For more, set
`memory = "1gb"` under `[[vm]]` and deploy (about 2 USD a month more).

**When the limit comes near, in this order:**

1. *The cheap fixes, in `server/store.mjs` alone* (a day's work, measured with
   the same script before and after): hand out the cached users and sessions
   frozen, as the states already are, instead of copying them on every read,
   and look a session up by its hash in a `Map`; give each file its own write
   queue, so a pupil's save never waits behind somebody else's duel. These
   address the two costs above and should move the ceiling well past 500.
2. *Then SQLite*, when a school wants more than one server's worth of pupils
   at once, or the JSON files pass a few hundred megabytes. The plan:
   - `node:sqlite`, which is built into Node (no package to install; check
     its status in the Node version of the day — it was still marked
     experimental in Node 22). One file, `fallaskoli.db`, in the same data
     folder, in WAL mode. Tables: users, sessions, states (id, rev, at, json),
     duels, assignments, groups, policies, invites, audit, reports, calibration,
     the calibration quota and the samples — one per JSON file today.
   - `server/store.mjs` is the only file that changes: everything the server
     does with data already passes through it, and its functions keep their
     names and promises, so the whole test suite runs unchanged against it.
     A save becomes one synchronous transaction (well under a millisecond);
     the revision check becomes `UPDATE … WHERE rev = ?`.
   - Moving over: on the first start with no `fallaskoli.db`, everything in
     the JSON files is read in one transaction, and the files are renamed
     `*.pre-sqlite` and deleted after 30 days (the privacy notice's promise
     about copies). Backups keep their format (`backup.mjs` goes through
     `exportAll`/`importAll`), so an old backup restores into the new store.
   - Still one machine and one process: SQLite does not change
     "never `fly scale count 2`".
   - Then `tools/load-test.mjs` again, with 1,000 at once on 1 GB as the
     target, and this section rewritten with what it measures.

### 4.5 Íslenska sem annað mál (v6.13, item 45)

Nothing to set up. A pupil can switch the second-language mode on under
*Stillingar*; a teacher can switch it on for a pupil in *Skólastofan →
Íslenska sem annað mál* (a box beside each name). It gives a gloss on every
word of the sentence (ÍNO's definitions, already in the program), a slower
climb in difficulty and the generated kind of error hunt, and reads the
sentence aloud **if the pupil's device has an Icelandic voice of its own**
(some do and many do not; the button simply does not appear without one, and
a voice that would send the text to a company to be spoken is not used). Nothing is sent anywhere to be spoken. Agree with the
pupil and the family before switching it on for them (`docs/PRIVACY.md` §1e).

### 4.6 Ritun vikunnar — the writing check (v6.13, item 46)

Once a week every pupil is offered "Skrifaðu þrjár setningar um …" on an
everyday topic. Without anything set up it works offline: the pupil writes,
reads their text against a short checklist and finishes. Nothing is sent.

A teacher can switch on **yfirlestur** for their group in *Skólastofan →
Ritun vikunnar*. Then the text is read over on this server by
**GreynirCorrect** (Miðeind's open-source checker, `reynir-correct`), and the
pupil fixes its remarks one by one. A second box, **geyma textana**, keeps
the checked texts for the teacher to read (at most 12 per pupil, 60 days;
switching it off deletes them all). Both are off by default; read
`docs/PRIVACY.md` §1f before switching keeping on, and tell the families.

**The checker has to be installed** — it is Python, like the build:

```
pip install -r requirements.txt -r server/requirements-writing.txt
```

(in the program's folder; add `--break-system-packages` on a Debian/Ubuntu
whose Python refuses, or use a virtual environment and point
`FALLASKOLI_WRITING_PYTHON` at its `python`). The build's own pins come first
so GreynirCorrect cannot move the grammar libraries under the build.

How it runs, so you know what to expect from the machine:

- `server/writing.mjs` starts **one** Python process, `server/greynir_worker.py`,
  the first time a group with the check on needs it, and keeps it. It holds
  about **400 MB** of memory and takes a few seconds to start; after that a text
  takes a fraction of a second. On a small VPS give the machine 1 GB.
- Every text has a strict limit: 600 characters, 8 seconds. A text that takes
  longer gets "tók of langan tíma", and the worker is killed and started
  again for the next one, so one odd text cannot hold up the class. At most
  four texts are checked at once (more get "reyndu aftur eftir smástund"),
  and one account may ask 30 times an hour.
- If Python or the package is missing, the teacher's card says the check is
  not installed, and pupils simply write without it. The server tries again
  five minutes later.
- The text is passed to the worker over a pipe and is written to no file and
  no log; the worker's own error output is thrown away.

Settings (environment variables, all optional):

| variable | default | |
|---|---|---|
| `FALLASKOLI_WRITING` | on | `off` switches the check off on this server whatever teachers choose |
| `FALLASKOLI_WRITING_PYTHON` | `python3` | the Python that has `reynir-correct` |
| `FALLASKOLI_WRITING_WORKER` | `server/greynir_worker.py` | the worker script |
| `FALLASKOLI_WRITING_TIMEOUT_MS` | `8000` | per text, at most 60000 |

**On Fly.io (or any container host)** the default image is the small Alpine
one, without Python: GreynirCorrect ships no wheels for Alpine. The
Dockerfile has a second target with it:

```
fly deploy --build-target greynir
```

and give the machine at least 1 GB (`fly scale memory 1024`). Without the
target everything else works, and the weekly task is offered unchecked.

That target is pinned like the build container (`Dockerfile.build`): the same
exact Python and Node images on x86_64, and the Python packages installed by
hash from `requirements-build.txt` together with
`server/requirements-writing-build.txt`, so the checker reads a text with
exactly the parser the data was built with. To move GreynirCorrect, change
`server/requirements-writing.txt` and `server/requirements-writing-build.txt`
together (the hashes come from `pip download`, as the file says);
`tests/writing.test.js` holds them together.

---

## Part 5 — upgrading to a new version

On Fly: `./build.sh`, then `fly deploy --ha=false` (`docs/HOSTING.md`).

On your own machine, with the service file from 2.6:

```
systemctl stop fallaskoli
cd /opt && unzip -o fallaskoli-v<version>-src.zip
rm -rf /opt/fallaskoli && mv /opt/fallaskoli-v<version> /opt/fallaskoli
cd /opt/fallaskoli && ./build.sh
systemctl start fallaskoli
```

The data is in `/var/lib/fallaskoli` and is not touched. (Coming from an older
setup where it was in `server/data` inside the program folder: copy that
folder's contents to `/var/lib/fallaskoli` once, before the `rm`, and run
`chown -R fallaskoli: /var/lib/fallaskoli`.)

**Coming to v6.13:** a guardian now sees the error patterns and assignment
results of the learners in their own group (§4.2). The privacy notice has a new
version; read §3 of `docs/PRIVACY.md` and tell the families.

**Coming from v6.2:** everybody logs in again once (sessions are stored
differently); nobody is on the leaderboard until they switch themselves on; and
the user list marks existing accounts *samþykki vantar* until you record who
consented to each.

---

## Part 6 — what is true about the security

So that you know what you are putting on the internet, without varnish:

**What is done:**
- Passwords are **never stored**, only scrypt hashes with a per-user salt.
- The session token is in an **HttpOnly** cookie that javascript cannot reach,
  and on the server only its hash is kept.
- Login attempts are limited **per address**, so guessing is slow and nobody can
  lock a child out by guessing badly. Registration is limited too, and needs an
  invitation.
- A child can reach **only its own state**, checked on every request.
- **Nobody is shown to anybody by default.** The board and the roster hold only
  people who switched themselves on, and only for their own group.
- The server stores only what is **shaped like progress**, at most 2 MB, and
  holds implausible numbers off the board until you have looked.
- Two devices **merge** instead of overwriting each other.
- The page loads **nothing from anybody else** — fonts included — and the server
  tells the browser to refuse anything that tries.
- The server **does not run as root**.
- Backups you download are **encrypted** with a passphrase only you have.
- Unused accounts are **erased automatically**; deleting an account removes
  every trace.

**What is not done, and which you should know about:**
- **No two-factor authentication.** Give the administrator account a long
  password used nowhere else.
- **No email.** A forgotten password is reset by you with one button. That also
  means nobody can break in through a "forgot password" flow.
- **The guardian's consent is a typed name and a tick**, not a verified
  identity. What makes it reasonable is that you give the invitation to the
  parent yourself.
- **A child who edits their own progress plausibly is not caught.**

---

## If something goes wrong

| What you see | What it means |
|---|---|
| `Forritsskráin fannst ekki` | `./build.sh` was not run in this folder |
| The page does not load | `systemctl status fallaskoli` — is it `active (running)`? |
| `502 Bad Gateway` | Caddy is running but the server is not. `systemctl restart fallaskoli` |
| No padlock in the address bar | The domain does not point at the machine yet. Wait and try `ping` |
| `Beðið eftir samþykki` | Correct behaviour — admit them under **Umsjón → Notendur** (*Hleypa inn*) |
| The login clears itself and nothing happens, no error | The password was right — the browser threw away the login cookie because the server marked it "https only" while you are on plain `http`. Safari does this; Chrome does not. Fixed in `server/server.mjs`: stop the server with `Ctrl` + `C` and start it again. If it persists, try the same login in Chrome to confirm that is what you are looking at |
| The child cannot see his progress | Did he log into the right account? See 1.7 |
| The projector says *Tengist…* and nothing moves, or the pupils' screens lag a question behind | Something between the browser and the server holds the live round's events back. Caddy and Fly.io do not; another proxy must not buffer `text/event-stream` (4.2) |
| A live round vanished in the middle of a lesson | The server was restarted (a deploy, a crash, the machine slept). Rounds live in memory only: start a new one |
| `command not found: node` | Node is not installed, or the window was opened before it was |
| `permission denied: ./build.sh` | The file lost its right to run (this happens when it is downloaded). Type `chmod +x build.sh` once, then try again |
| `pip: command not found` | An old copy of `build.sh`. The one in this folder no longer uses that command |
| `Could not find a version that satisfies the requirement reynir==...` | Python is too old, **not** a broken version number. See 1.2 (your computer) or 2.3 (the server). Do not change `requirements.txt` |
| `This build needs Python 3.10 or newer` | The same thing, said properly. Install a current Python and open a **new** command window |

And one thing that should be reassuring: **the data is in one folder.** If
everything else goes wrong — the machine, the domain, the upgrade — that folder
(or one encrypted backup of it) is all you need to start again somewhere else.
