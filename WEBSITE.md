# Fallaskóli as a website — the short version

This is the whole story for the owner. You need no Terminal and no server
knowledge. (The long, technical version is `docs/HOSTING.md`; you do not need it.)

**What it costs.** Fly.io bills by the second while the server is awake. With
the settings in `fly.toml` the server sleeps when nobody is practising and
wakes in a second or two on the next visit. Expect **about 2–5 USD a month**
(even awake day and night it is about 4 USD). A payment card is required.

**How it works once it is set up.**

```
 your Mac folder  ──  double-click "Update website.command"  ──▶  GitHub
                                                                    │
                                                 tests pass? ───────┤
                                                                    ▼
                                                    https://fallaskoli-elias.fly.dev
```

Every time `main` on GitHub changes — from your Mac, or when you merge a pull
request on GitHub — GitHub runs the tests, and if they pass the website is
updated by itself in about 10 minutes. If a test fails, the website simply
keeps the previous version. The pupils' accounts and progress are on the
website's own disk and are never touched by an update.

---

## Setting it up (once, about 20 minutes)

### 1. Make a Fly.io account

1. Go to <https://fly.io/app/sign-up> and sign up (signing up with your GitHub
   account is easiest).
2. When asked, add a payment card. (Billing → Payment methods, if it does not ask.)

### 2. Give GitHub the key to Fly.io

1. Open <https://fly.io/dashboard/personal/tokens>.
2. Create a token: name it `github`, leave the type as an **organization**
   (org deploy) token, and press *Create*. Copy the long text it shows
   (it starts with `FlyV1`). It is shown only once.
3. Open <https://github.com/eliaseythorsson/fallaskoli/settings/secrets/actions/new>.
4. **Name:** `FLY_API_TOKEN` — **Secret:** paste the text — press *Add secret*.

### 3. Press the button that builds the website

1. Open <https://github.com/eliaseythorsson/fallaskoli/actions/workflows/setup-website.yml>.
2. Press **Run workflow** (on the right). Leave the two boxes as they are
   (website name `fallaskoli-elias`, username `elias`) unless you want
   something else, and press the green **Run workflow**.
3. Wait about 10 minutes. Refresh the page; when the run has a green ✓, click it,
   click **setup**, and open the step **4. Your administrator account**.
   It shows your website address, username and **password**.
4. **Write the password down.** Then delete the run so the password is not kept
   on GitHub: the **⋯** menu at the top right of the run → *Delete workflow run*.

If it stops with a red ✗, click the step with the ✗: the last lines say what is
wrong in plain words (most often: the name is taken — run it again with another
name, e.g. `fallaskoli-elias-2`).

### 4. Log in and check two things

1. Open <https://fallaskoli-elias.fly.dev> and log in. Everything else
   (inviting families, making accounts, groups, backups) is under
   **Stillingar → Umsjón**.
2. Read <https://fallaskoli-elias.fly.dev/personuvernd> (the privacy notice
   pupils and parents see) and check it is true for you.
3. Fly.io holds data about children for you, so the law wants a signed data
   processing agreement with them. It takes five minutes: `docs/PRIVACY.md` §4.

---

## Day to day

| You want to… | Do this |
|---|---|
| Put changes from your Mac on the website | Double-click **Update website.command** in the project folder |
| Get Claude's/GitHub's latest changes into your Mac folder | The same double-click (it does both directions) |
| See whether an update went through | <https://github.com/eliaseythorsson/fallaskoli/actions> — green ✓ = live |
| Check the website is up | Open <https://fallaskoli-elias.fly.dev/health> — it should say `"ok":true` |
| Let a family in | **Umsjón → Boðskóðar** → make a code, give it to the parent |
| A forgotten password | **Umsjón → Notendur → Meira → Nýtt lykilorð** |
| A backup you keep yourself | **Umsjón → Öryggisafrit**, about once a month (Fly also keeps daily copies of the disk for 30 days) |
| See the bill | <https://fly.io/dashboard/personal/billing> |

The project folder on your Mac is `~/Projects/fallaskoli` (in Finder:
your home folder → *Projects* → *fallaskoli*). The old folder in *Documents*
is only an archive.

**If "Update website.command" asks for a GitHub password**, open Terminal once
and type `gh auth login`, then choose GitHub.com → HTTPS → *Login with a web
browser*. After that it never asks again.

## If something goes wrong

| What you see | What to do |
|---|---|
| A red ✗ on GitHub → Actions under *Deploy website* | Nothing is broken: the website kept the previous version. Ask Claude to look at the failed run. |
| The website does not open | Open `/health` (above). If that fails too, look at <https://fly.io/dashboard> → *fallaskoli-elias* → *Monitoring*, or ask Claude. |
| You lost your own administrator password | Ask Claude: it is one command (`docs/HOSTING.md` step 5, `lykilord`). |
| You want your own address (e.g. fallaskoli.is) | Possible at any time; ask Claude (`docs/HOSTING.md`, "Your own domain"). |
