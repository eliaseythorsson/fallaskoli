# Putting Fallaskóli on the internet with Fly.io

> **The owner's short version is `WEBSITE.md`**: the app, its disk, the first
> deploy and the administrator account are made by the GitHub workflow *Set up
> website (once)*, and every change to `main` is deployed by *Deploy website*.
> This file is the manual way and the reference behind it.

This replaces Part 2 of `docs/SERVER.md` (renting a machine and looking after it
yourself). It is written the same way: what you type, what you should see, what
to do if you do not.

**Why Fly.io.** Of the hosts that run a program for you and give it a disk that
survives restarts, it is the cheapest for something this small: you pay for one
small machine by the second and 15 US cents a month for the disk. With the
settings in `fly.toml` the machine sleeps when nobody is practising, so a
family's use costs well under the always-on price of about **4 USD a month**
(512 MB machine ≈ 3.70, 1 GB disk 0.15; European regions can be slightly more —
check <https://fly.io/pricing>). There is no free tier; a payment card is needed.

**What you give up.** Fly.io is an American company. The data stays in
Amsterdam, but that makes Fly a processor outside the EEA in the legal sense.
`docs/PRIVACY.md` §4 says what that requires of you (a signed data processing
agreement — it takes five minutes).

**Time:** about half an hour the first time.

---

## 0. Before you start

1. Build the program on your own computer, as in `docs/SERVER.md` Part 1:

   ```
   ./build.sh
   ```

   **You should see** `built dist/fallaskoli-v<version>.html` at the end (the version is in `package.json`). Nothing is built
   on Fly: the container only carries this file and the server.

2. Decide two things you will be asked for:
   - **Your name and an email address** people can reach you at. They are
     printed in the privacy notice. Consider an address made for this
     (`fallaskoli@…`) rather than your personal one.
   - **A name for the app**, lowercase, no spaces, unique on Fly — for example
     `fallaskoli-jonsson`. The address becomes `https://fallaskoli-jonsson.fly.dev`.

## 1. Install the Fly tool and make an account

Follow <https://fly.io/docs/flyctl/install/> for your computer, then in a **new**
command window:

```
fly auth signup
```

(or `fly auth login` if you already have an account). A browser window opens;
add a payment card when asked.

## 2. Fill in `fly.toml`

Open `fly.toml` in the Fallaskóli folder with a text editor and change four
lines:

```
app = "fallaskoli-jonsson"

  FALLASKOLI_CONTROLLER = "Jón Jónsson"
  FALLASKOLI_CONTACT = "fallaskoli@example.is"
```

and read the `FALLASKOLI_HOSTING` line — it is the sentence about hosting that
appears in the privacy notice. Leave it unless you change region.

## 3. Create the app and its disk

In the Fallaskóli folder:

```
fly apps create fallaskoli-jonsson
fly volumes create fallaskoli_data --region ams --size 1
```

Answer `y` when it warns that one volume means one machine. That is intended:
all the data is files on this one disk.

## 4. Send it up

```
fly deploy --ha=false
```

`--ha=false` matters: without it Fly starts **two** machines, and the second
would have its own empty disk. This takes a few minutes. **You should see**
`Visit your newly deployed app at https://fallaskoli-jonsson.fly.dev/`.

Check it:

```
fly status
```

**You should see** exactly one machine. Then open
`https://fallaskoli-jonsson.fly.dev/health` in a browser. **You should see**
`"ok":true` and `"privacy":true`. If it says `"privacy":false`, the two lines in
step 2 are empty — fill them in and run `fly deploy --ha=false` again.

## 5. Create your administrator account

```
fly ssh console -C "node server/admin.mjs nyr <your-username> --umsjon"
```

**You should see** three lines; the middle one is your password. Write it down
now — it is not shown again. (Lost it later? The same command with `lykilord
<your-username>` instead of `nyr … --umsjon`.)

Open `https://fallaskoli-jonsson.fly.dev`, log in, and go to **Stillingar og
námsefni → Umsjón**. Everything else is done from there:

| What you want | Where |
|---|---|
| Let a family in | *Boðskóðar* → make a code, give it to the **parent** |
| Make an account yourself | *Notendur* → *Nýr notandi* |
| A forgotten password | *Notendur* → *Meira* → *Nýtt lykilorð* |
| Keep classes or families apart | *Hópar*, then move people under *Meira* |
| "What do you hold about my child?" | *Meira* → *Sækja gögn* |
| "Delete my child" | *Meira* → *Eyða alveg* |
| A backup | *Öryggisafrit* |
| Who did what | *Atburðaskrá* |

Make a **second administrator** now (create a user, then *Meira* → *Hlutverk* →
*umsjón*) for somebody you trust, or for yourself with a different password
kept somewhere else. Two is the maximum, and one is one lost password away from
needing step 5 again.

## 6. Before you invite anybody

Work through the list at the top of `docs/PRIVACY.md`. The two that cannot wait:
read `https://<your-app>.fly.dev/personuvernd` and check it is true for you, and
sign Fly's data processing agreement.

---

## Day to day

| What you want | What you type |
|---|---|
| Is it up? | open `/health` in a browser |
| What happened? | `fly logs` |
| Restart | `fly apps restart fallaskoli-jonsson` |
| A new version | `./build.sh`, then `fly deploy --ha=false` |
| Take it offline at once | `fly scale count 0` (and `fly scale count 1` to bring it back) |
| More than ~150 pupils practising at the same time | `memory = "1gb"` under `[[vm]]` in `fly.toml`, then deploy (`docs/SERVER.md` §4.4) |

**A new version does not touch the data.** The disk is separate from the
program; `fly deploy` replaces the program only. (This is the step that needed
a `cp -r` you must not forget, in the old instructions.)

### Your own domain (optional)

```
fly certs add fallaskoli.is
```

It prints the DNS records to create at your registrar. The padlock is automatic.

### Keeping the machine awake

With the settings as shipped, the first visit after a quiet spell takes a second
or two while the machine wakes. To keep it awake always, change two lines in
`fly.toml` and deploy:

```
  auto_stop_machines = "off"
  min_machines_running = 1
```

## Backups

Two kinds, and you want both.

1. **Fly's daily snapshot of the disk** — automatic, kept 30 days
   (`snapshot_retention` in `fly.toml`). It protects against a mistake. Restore:
   `fly volumes snapshots list <volume-id>`, then
   `fly volumes create fallaskoli_data --snapshot-id <id> --region ams` and
   deploy. It does not protect against losing the Fly account.

2. **Your own encrypted copy** — *Umsjón → Öryggisafrit*, once a month or so.
   You choose a passphrase; the file is useless without it and it is stored
   nowhere, so keep the passphrase somewhere other than the file. Delete copies
   older than 30 days: they still contain people who have since deleted their
   accounts, and the privacy notice promises those are gone within 30 days.

   To restore one onto a server:

   ```
   fly ssh sftp shell
   put fallaskoli-afrit-2026-12-01.json /data/afrit.json
   ```

   (Ctrl-D to leave), then

   ```
   fly ssh console -C "sh -c 'FALLASKOLI_BACKUP_KEY=\"your passphrase\" node server/backup.mjs lesa /data/afrit.json && rm /data/afrit.json'"
   fly apps restart fallaskoli-jonsson
   ```

   The restart is not optional: the running server holds everybody's progress
   in memory and would write the old picture back over the restored one.

## Settings

All optional except the first two. Set them under `[env]` in `fly.toml`.

| Name | What it does | Default |
|---|---|---|
| `FALLASKOLI_CONTROLLER` | Who is responsible, in the privacy notice | — (required) |
| `FALLASKOLI_CONTACT` | How to reach them | — (required) |
| `FALLASKOLI_HOSTING` | The sentence about hosting in the notice | generic |
| `FALLASKOLI_INACTIVE_MONTHS` | An account unused this long is erased | 18 |
| `FALLASKOLI_PENDING_DAYS` | An unanswered request for access is erased | 30 |
| `FALLASKOLI_BACKUP_DAYS` | What the notice says about backups; keep equal to `snapshot_retention` | 30 |
| `FALLASKOLI_OPEN_REGISTRATION` | `1` lets anybody ask for an account without an invitation; they wait for you | off |
| `FALLASKOLI_CALIBRATION` | `0` switches off the anonymous counting of answers and the weekly adjustment of difficulty; `strict` counts only consent given to the notice that describes it (`docs/SERVER.md` §4.3) | on |
| `FALLASKOLI_SAMPLES` | `0` forbids the sample of wrong answers a teacher can otherwise switch on for their group | allowed |
| `FALLASKOLI_DATA` | Where the data lives | `/data` in the container |
| `FALLASKOLI_TRUST_PROXY` | Believe the proxy about the visitor's address | `1` in the container |
| `FALLASKOLI_UID` | The user the server becomes after starting | `1000` in the container |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google login. Use `fly secrets set`, not `[env]`. Not recommended for children — see `docs/PRIVACY.md` §4 | off |

## If something goes wrong

| What you see | What it means |
|---|---|
| `"privacy":false` on `/health`, a red warning on the admin page | `FALLASKOLI_CONTROLLER` / `FALLASKOLI_CONTACT` are empty in `fly.toml` |
| Two machines in `fly status` | It was deployed without `--ha=false`. `fly scale count 1`, then check both show the same users |
| Everybody has to log in again after upgrading from v6.2 | Expected, once: sessions are stored differently from v6.3 |
| `Forritsskráin fannst ekki` | `./build.sh` was not run before `fly deploy`, or the version in `package.json` has no matching `fallaskoli-v….html` |
| A user is missing from the leaderboard | In order: they have not switched themselves on (*Aðgangurinn minn*); they are in another group; you took them off; or the row says *í yfirferð* — the server saw a number practice does not produce, and waits for you (*Meira* → *Ljúka yfirferð*) |
| `Hér þarf boðskóða` | Correct: nobody registers without an invitation |

I have not been able to run these `fly` commands against a real account while
writing this; they follow Fly's documentation as of November 2026. If a command
has changed, `fly help <command>` shows the current form — the files
(`Dockerfile`, `fly.toml`) are what matter, and the server in them has been run
and tested exactly as the container runs it.
