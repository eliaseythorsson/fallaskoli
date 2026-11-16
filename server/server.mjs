/* Fallaskóli — the web server.
 *
 * Run with:  node server/server.mjs
 * Configured through environment variables, see docs/HOSTING.md. Defaults: port
 * 8080, data in `server/data/` (or FALLASKOLI_DATA).
 *
 * ---------------------------------------------------------------------------
 * FOUR RULES THAT MUST NOT BREAK, and why they are here rather than in a
 * document nobody reads:
 *
 * 1. **No third-party packages.** Only what ships with Node. The owner does not
 *    write code; every package is one more thing that can break, demand an
 *    upgrade or disappear. `npm install` is not part of running this server.
 *
 * 2. **Ranking and rarity are computed with the SAME code the browser uses.**
 *    `rank`, `scorecard` and `aggregate` are imported straight out of
 *    `src/js/core/`. Server and browser therefore cannot drift apart, and the
 *    unit tests pin the server's behaviour as well.
 *
 * 3. **A child reads and writes only its own state.** That is checked on every
 *    request; the interface is not trusted to ask politely.
 *
 * 4. **Nobody is shown to anybody by default** (v6.3). A user appears on the
 *    board and the roster only after choosing to, only to their own group, and
 *    `visibleStates` is the one function that decides it.
 * ---------------------------------------------------------------------------
 */

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

import { createStore } from "./store.mjs";
import {
  hashPassword, verifyPassword, passwordProblem, newToken, newId, hashToken,
  cookieHeader, clearCookie, readCookie, createThrottle, SESSION_DAYS, clientIp,
  makePassword, makeInviteCode,
  googleConfig, googleAuthUrl, googleExchange,
} from "./auth.mjs";
import { cleanState, suspicion, MAX_STATE_BYTES } from "./guard.mjs";
import { privacyConfig, privacyPage, CONSENT_AGE, PRIVACY_VERSION } from "./privacy.mjs";
import { createCalibration } from "./calibrate.mjs";
import { createLive } from "./live.mjs";
import { createTeamDuels } from "./teamduel.mjs";
import { teamOf } from "../src/js/core/teamduel.js";
import { seal, passphraseProblem } from "./backup.mjs";
import { dropPrivileges } from "./privs.mjs";

import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { scorecard, rank, METRICS } from "../src/js/core/leaderboard.js";
import { aggregate, contribution, MIN_USERS, MIN_DAYS, measurable, monthKey, nextRefresh }
  from "../src/js/core/rarity.js";
import { ROLES, can } from "../src/js/core/profile.js";
import { weekKey, prevWeekKey, weekXp, newThisWeek, firstFinders, weekResult }
  from "../src/js/core/social.js";
import { sanitisePolicy, createPolicy } from "../src/js/core/policy.js";
import { chosenPolicy } from "../src/js/core/state.js";
import { pupilStandings, classColumns, patternCSV, byName } from "../src/js/core/classview.js";
import { ASSIGN, cleanTarget, patternsOf, dueProblem, isOpen, prune as pruneAssignments,
         openCount as openAssignments, cleanResult, recordResult, viewForPupil }
  from "../src/js/core/assignment.js";
import { TASKS } from "../src/js/tasks/registry.js";
import { DUEL, validTopic, validSize, duelSkills, duelLevel, topicLevel, dataPrint, sideOf, duelStatus,
         openCount, prune as pruneDuels, viewFor, duelTasks, gradeDuel, signature, ANSWER_LIMITS }
  from "../src/js/core/duel.js";
/* Grading a duel (v6.13): the same builders and the same judge as the browser. */
import { judge } from "../src/js/core/answer.js";
import { blankState, newSession } from "../src/js/core/state.js";
import { nextTask, buildTask, makeView, applyEffects } from "../src/js/tasks/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** The question types of a category, from the registry — for the patterns an
    assignment on a whole category tests (core/assignment.js `patternsOf`). */
const typesOfSkill = (id) => new Set(TASKS.filter((t) => t.skill === id || (t.anyOf || []).includes(id)).map((t) => t.id));
import { htmlPath, VERSION } from "../tools/version.mjs";

export const DEFAULT_GROUP = "default";
export const MAX_ADMINS = 2;

const dayOf = (d = new Date()) => d.toISOString().slice(0, 10);

export function createApp({
  env = process.env,
  dataDir = env.FALLASKOLI_DATA || path.join(HERE, "data"),
  htmlFile = htmlPath(),
  secureCookies = env.FALLASKOLI_INSECURE !== "1",
  /* For the tests: a clock and limits for the live rounds (server/live.mjs). */
  liveOptions = {},
} = {}) {
  const store = createStore(dataDir);
  const lex = buildLexicon(DATA);
  const DUEL_DATA = dataPrint(DATA);
  const throttle = createThrottle();
  const regThrottle = createThrottle({ max: 10, windowMs: 60 * 60 * 1000 });
  const google = googleConfig(env);
  const privacy = privacyConfig(env);
  const openRegistration = env.FALLASKOLI_OPEN_REGISTRATION === "1";
  const pendingOAuth = new Map();     // state -> expires after 10 min

  /* ---------- help ---------- */

  /* Whether THIS request's session cookie may carry `Secure`.
   *
   * `Secure` is right in production and wrong on `http://localhost`, and that
   * is not a detail: Safari refuses to STORE a Secure cookie that arrived over
   * plain http, localhost included. Chrome and Firefox make an exception for
   * localhost; Safari does not. The symptom is the worst kind — the login
   * succeeds, 200 and all, the page reloads, `/auth/me` finds no cookie, and
   * the child is looking at an empty login form with no error to explain it.
   * §1.5 of docs/SERVER.md sends every Mac owner straight into this.
   *
   * So the decision is per request, and it follows the one thing that actually
   * decides whether `Secure` can work: was there TLS in front of this request?
   * This process never speaks TLS itself — it is plain http on 8080 always —
   * so the only evidence is what a reverse proxy says.
   *
   *   - The proxy says https (Caddy in §2.7 sends X-Forwarded-Proto) -> `Secure`.
   *   - No proxy header at all -> the browser is talking plain http to this
   *     port, where a `Secure` cookie is thrown away rather than protected.
   *     Send it without. This is §1.5 on a laptop and §2.5 before the padlock.
   *
   * FALLASKOLI_INSECURE=1 turns it off everywhere, as before.
   * FALLASKOLI_FORCE_SECURE=1 forces it on, for a proxy that terminates TLS
   * but sends no forwarding header. Caddy and nginx both send one.
   */
  const forwardedProto = (req) => {
    const xfp = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    if (xfp) return xfp.toLowerCase();
    const fwd = /proto=(")?([a-z]+)\1?/i.exec(String(req.headers["forwarded"] || ""));
    if (fwd) return fwd[2].toLowerCase();
    if (String(req.headers["x-forwarded-ssl"] || "").toLowerCase() === "on") return "https";
    return "";
  };

  const cookieSecure = (req) => {
    if (!secureCookies) return false;
    if (env.FALLASKOLI_FORCE_SECURE === "1") return true;
    return forwardedProto(req) === "https";
  };

  /* Sent with every answer. The page is one file with its script and styles
     inline, so the policy has to allow inline — what it forbids is everything
     ELSE: no script, font, image or request to any other origin, and no other
     site may put this one in a frame. That is also the technical half of the
     privacy notice's "nothing is fetched from anybody else". */
  const CSP_APP = [
    "default-src 'self'", "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
    "font-src 'self' data:", "connect-src 'self'", "media-src 'self' data: blob:",
    "object-src 'none'", "base-uri 'none'", "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  const CSP_PAGE = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; "
    + "form-action 'none'; frame-ancestors 'none'";

  const securityHeaders = (req, csp = "default-src 'none'; frame-ancestors 'none'") => ({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Content-Security-Policy": csp,
    ...(req && forwardedProto(req) === "https"
      ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}),
  });

  const accepts = (req, enc) =>
    new RegExp("(^|[,\\s])" + enc + "(\\s*;|\\s*,|\\s*$)", "i")
      .test(String(req?.headers["accept-encoding"] || ""));

  const json = (res, code, body, headers = {}) => {
    const req = res.req;
    let buf = Buffer.from(JSON.stringify(body), "utf8");
    const extra = {};
    /* The roster and the board are lists of badge ids — they shrink to a tenth. */
    if (buf.length > 1400 && accepts(req, "gzip")) {
      buf = zlib.gzipSync(buf);
      extra["Content-Encoding"] = "gzip";
      extra["Vary"] = "Accept-Encoding";
    }
    res.writeHead(code, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": buf.length,
      "Cache-Control": "no-store",
      ...securityHeaders(req), ...extra, ...headers,
    });
    res.end(buf);
  };

  const fail = (status, message) => Object.assign(new Error(message), { status, expose: true });

  const readBody = (req, limit = 256 * 1024) => new Promise((res, rej) => {
    let n = 0; const chunks = [];
    req.on("data", (c) => {
      n += c.length;
      /* Too big: stop keeping it, but let the rest drain so the answer (413)
         can actually be delivered — a destroyed socket reads as "network
         error" in the browser, which tells the user nothing. */
      if (n > limit) { if (chunks.length) { chunks.length = 0; rej(fail(413, "Of stór beiðni.")); } return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (n > limit) return rej(fail(413, "Of stór beiðni."));
      if (!chunks.length) return res(null);
      try { res(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { rej(fail(400, "Ógilt JSON.")); }
    });
    req.on("error", rej);
  });

  /** The trail of who did what. `by` is a user id or "kerfi" (the server
      itself: retention, the plausibility guard). Ids only — see store.mjs. */
  const audit = (by, act, target = null, note = null) =>
    store.appendAudit({ by, act, ...(target ? { target } : {}), ...(note ? { note } : {}) })
      .catch((e) => console.error("atburðaskrá:", e.message));

  /* ---------- groups ---------- */

  async function groupsNow() {
    const g = await store.groups();
    return { [DEFAULT_GROUP]: { name: "Aðalhópur" }, ...g };
  }
  const groupOf = (u) => (u && u.group) || DEFAULT_GROUP;

  /* ---------- people ---------- */

  /** Does this account have the consent it needs? Adults who run things
      (administrator, guardian) answer for themselves. */
  const consentOk = (u) => u.role !== "learner" || !!(u.consent && u.consent.by);

  const shareOf = (u) => ({ board: !!(u.share && u.share.board), minutes: !!(u.share && u.share.minutes) });

  /** A user -> what the user may see about themselves. Never a password hash. */
  const publicUser = (u) => u && ({
    id: u.id, name: u.name || u.username, username: u.username,
    role: u.role, status: u.status, created: u.created,
    provider: u.google ? "google" : "password",
    group: groupOf(u), share: shareOf(u),
    review: !!u.review,
  });

  /** ...and what the administrator sees in the list. */
  const adminUser = (u) => u && ({
    ...publicUser(u),
    lastSeen: u.lastSeen || null,
    consent: u.consent
      ? { by: u.consent.by, over16: !!u.consent.over16, at: u.consent.at, how: u.consent.how }
      : null,
    needsConsent: !consentOk(u),
    review: u.review ? { at: u.review.at, why: u.review.why } : null,
    expires: expiryOf(u),
  });

  /** The day an unused account will be erased, or null. */
  function expiryOf(u) {
    if (u.role === "admin") return null;
    if (u.status === "pending" && u.created) {
      const d = new Date(u.created); d.setDate(d.getDate() + privacy.pendingDays);
      return dayOf(d);
    }
    if (!u.lastSeen) return null;
    const d = new Date(u.lastSeen + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + privacy.inactiveMonths);
    return dayOf(d);
  }

  async function currentUser(req) {
    const token = readCookie(req.headers.cookie);
    if (!token) return null;
    const sessions = await store.sessions();
    const s = sessions[hashToken(token)];
    if (!s || s.exp < Date.now()) return null;
    const users = await store.users();
    const u = users.find((x) => x.id === s.userId);
    if (!u || u.status !== "active") return null;
    /* "Last seen" is a DAY, written at most once a day. It exists for one
       purpose: so an account nobody uses can be erased (the retention sweep). */
    const today = dayOf();
    if (u.lastSeen !== today) {
      u.lastSeen = today;
      await store.updateUsers((list) => {
        const x = list.find((y) => y.id === u.id);
        if (!x || x.lastSeen === today) return null;
        x.lastSeen = today; return list;
      });
    }
    return u;
  }

  async function startSession(user) {
    const token = newToken();
    await store.updateSessions((s) => {
      const now = Date.now();
      for (const [k, v] of Object.entries(s)) if (v.exp < now) delete s[k];
      s[hashToken(token)] = { userId: user.id, exp: now + SESSION_DAYS * 86400000 };
      return s;
    });
    return token;
  }

  /** Log somebody out everywhere — after a password change, a reset, a block. */
  const endSessions = (userId, exceptToken = null) => store.updateSessions((s) => {
    const keep = exceptToken ? hashToken(exceptToken) : null;
    let hit = false;
    for (const [k, v] of Object.entries(s))
      if (v.userId === userId && k !== keep) { delete s[k]; hit = true; }
    return hit ? s : null;
  });

  const USERNAME = /^[a-záðéíóúýþæö0-9._-]{3,32}$/i;

  /** A display name: short, one line, and not somebody else's in the group. */
  function nameProblem(name, users, self = null, group = DEFAULT_GROUP) {
    if (name.length < 2 || name.length > 24) return "Gælunafn: 2–24 stafir.";
    if (/[\u0000-\u001f<>@]/.test(name)) return "Gælunafnið má ekki innihalda @, < eða >.";
    const taken = users.some((u) => u.id !== self && groupOf(u) === group &&
      String(u.name || u.username).toLowerCase() === name.toLowerCase());
    return taken ? "Þetta gælunafn er þegar í notkun í hópnum." : null;
  }
  const tidyName = (x) => String(x || "").replace(/\s+/g, " ").trim();

  /** The consent record, from what a form sent. Returns [record, problem]. */
  function consentFrom(body, how, extra = {}) {
    const over16 = body?.over16 === true;
    const guardian = tidyName(body?.guardian).slice(0, 80);
    if (!over16 && guardian.length < 3)
      return [null, `Yngri en ${CONSENT_AGE} ára: foreldri eða forsjáraðili þarf að skrifa nafnið sitt og samþykkja.`];
    return [{
      by: over16 ? "self" : guardian, over16,
      at: new Date().toISOString(), how, notice: PRIVACY_VERSION, ...extra,
    }, null];
  }

  /* ---------- routes ---------- */

  const routes = [];
  const on = (method, pattern, fn) => routes.push({ method, pattern, fn });

  /* --- authentication --- */

  /* What the login card needs to know before anybody is logged in. */
  on("GET", "/auth/config", async (req, res) => json(res, 200, {
    invite: openRegistration ? "optional" : "required",
    google: google.enabled,
    consentAge: CONSENT_AGE,
    privacy: "/personuvernd",
    privacyReady: privacy.ready,
  }));

  on("POST", "/auth/register", async (req, res) => {
    /* Every attempt counts, successful or not: the limit is on how often one
       address may knock, which also bounds guessing at invite codes. */
    const ipKey = "reg|" + clientIp(req, env);
    if (regThrottle.blocked(ipKey))
      return json(res, 429, { error: "Of margar tilraunir. Reyndu aftur eftir klukkustund." });
    regThrottle.fail(ipKey);

    const body = await readBody(req);
    const username = String(body?.username || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const code = String(body?.invite || "").trim().toLowerCase();
    if (!USERNAME.test(username))
      return json(res, 400, { error: "Notandanafn: 3–32 stafir, engin bil." });
    const problem = passwordProblem(password);
    if (problem) return json(res, 400, { error: problem });

    /* Who may ask at all. A program for children is not open to whoever finds
       the URL: by default an invitation is required, and the invitation is
       what the administrator hands to a family. */
    if (!code && !openRegistration)
      return json(res, 403, { error: "Hér þarf boðskóða. Biddu umsjónarmann um hann." });
    let invite = null;
    if (code) {
      const now = Date.now();
      invite = (await store.invites()).find((i) =>
        i.code === code && new Date(i.exp).getTime() > now && (i.uses || 0) < i.max) || null;
      if (!invite) return json(res, 400, { error: "Boðskóðinn er ekki til, er útrunninn eða fullnýttur." });
    }

    if (body?.consent !== true)
      return json(res, 400, { error: "Það þarf að samþykkja persónuverndaryfirlýsinguna." });
    const [consent, consentProblem] = consentFrom(body, invite ? "invite" : "register",
      invite ? { invite: invite.id } : {});
    if (consentProblem) return json(res, 400, { error: consentProblem });

    const group = invite ? invite.group : DEFAULT_GROUP;
    const name = tidyName(body?.name) || username;
    const { salt, hash } = await hashPassword(password);
    let clash = null, created = null;
    await store.updateUsers((users) => {
      if (users.some((u) => u.username === username)) { clash = "Notandanafnið er þegar til."; return null; }
      clash = nameProblem(name, users, null, group);
      if (clash) return null;
      created = {
        id: newId(), username, name, role: "learner",
        /* With an invitation the door is already open; without one (only when
           the owner has switched open registration on) the account waits. */
        status: invite ? "active" : "pending",
        group, salt, hash, consent,
        created: new Date().toISOString(), lastSeen: dayOf(),
      };
      users.push(created);
      return users;
    });
    if (clash) return json(res, 409, { error: clash });
    if (invite) {
      await store.updateInvites((list) => {
        const i = list.find((x) => x.id === invite.id);
        if (!i) return null;
        i.uses = (i.uses || 0) + 1;
        i.usedBy = [...(i.usedBy || []), created.id];
        return list;
      });
      await audit(created.id, "skráning með boði", created.id);
    }
    return json(res, 200, invite
      ? { status: "active", message: "Aðgangurinn er tilbúinn." }
      : { status: "pending", message: "Beiðnin er komin. Umsjónarmaður þarf að hleypa þér inn." });
  });

  /* An unknown name must cost the same time as a wrong password, or the
     difference tells an outsider which names exist. */
  let dummy = null;
  const dummyHash = () => (dummy ||= hashPassword(newToken()));

  on("POST", "/auth/login", async (req, res) => {
    const body = await readBody(req);
    const username = String(body?.username || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const ip = clientIp(req, env);
    /* Two brakes. Few guesses at ONE name from one address; more, but still
       bounded, from one address at any names. Neither is keyed on the name
       alone — that would let anybody lock a child out by guessing badly. */
    const kUser = "u|" + username + "|" + ip, kIp = "ip|" + ip;
    if (throttle.blocked(kUser) || throttle.blocked(kIp, 40))
      return json(res, 429, { error: "Of margar tilraunir. Bíddu í kortér." });

    const users = await store.users();
    const u = users.find((x) => x.username === username);
    /* The same answer whether the user does not exist or the password is
       wrong — otherwise the usernames can be enumerated. */
    const against = u && u.hash ? u : await dummyHash();
    const okPw = await verifyPassword(password, against.salt, against.hash) && !!(u && u.hash);
    if (!u || !okPw) {
      throttle.fail(kUser); throttle.fail(kIp);
      return json(res, 401, { error: "Notandanafn eða lykilorð stemmir ekki." });
    }
    if (u.status === "pending")
      return json(res, 403, { error: "Beðið eftir samþykki umsjónarmanns.", status: "pending" });
    if (u.status !== "active")
      return json(res, 403, { error: "Þessi aðgangur er lokaður." });

    throttle.ok(kUser);
    const token = await startSession(u);
    return json(res, 200, { profile: publicUser(u) },
      { "Set-Cookie": cookieHeader(token, { secure: cookieSecure(req) }) });
  });

  on("POST", "/auth/logout", async (req, res) => {
    const token = readCookie(req.headers.cookie);
    if (token) await store.updateSessions((s) => { delete s[hashToken(token)]; return s; });
    res.writeHead(204, { ...securityHeaders(req), "Set-Cookie": clearCookie(cookieSecure(req)) });
    res.end();
  });

  on("GET", "/auth/me", async (req, res) => {
    const u = await currentUser(req);
    if (!u) return json(res, 401, { error: "Ekki innskráð(ur)." });
    const groups = await groupsNow();
    return json(res, 200, {
      profile: { ...publicUser(u), groupName: (groups[groupOf(u)] || {}).name || "" },
      rights: ROLES[u.role] || ROLES.learner,
    });
  });

  /* The address Google must send the browser back to. This process only ever
     sees plain http, so the scheme has to come from the proxy — built from
     `url.origin` it said http:// and Google refused it. */
  const publicOrigin = (req) =>
    (forwardedProto(req) || "http") + "://" + (req.headers.host || "localhost");

  on("GET", "/auth/google", async (req, res) => {
    if (!google.enabled)
      return json(res, 501, { error: "Google-innskráning er ekki stillt á þessum þjóni." });
    const state = newToken();
    pendingOAuth.set(state, Date.now() + 10 * 60000);
    for (const [k, exp] of pendingOAuth) if (exp < Date.now()) pendingOAuth.delete(k);
    const redirect = publicOrigin(req) + "/auth/google/callback";
    res.writeHead(302, { Location: googleAuthUrl(google, redirect, state) });
    res.end();
  });

  on("GET", "/auth/google/callback", async (req, res, { url }) => {
    const state = url.searchParams.get("state");
    const exp = pendingOAuth.get(state);
    pendingOAuth.delete(state);
    if (!exp || exp < Date.now())
      return json(res, 400, { error: "Innskráningin rann út. Reyndu aftur." });
    const code = url.searchParams.get("code");
    if (!code) return json(res, 400, { error: "Google skilaði engum kóða." });

    let profile;
    try {
      profile = await googleExchange(google, code, publicOrigin(req) + "/auth/google/callback");
    } catch (e) {
      return json(res, 502, { error: e.message });
    }

    let user = null;
    await store.updateUsers((users) => {
      user = users.find((u) => u.google === profile.sub);
      if (user) return null;
      /* Only Google's opaque id is kept (v6.3). The account gets a made-up
         name; the child chooses a nickname after being admitted, and the
         administrator records consent before admitting. */
      const id = newId();
      user = {
        id, username: "g-" + id.slice(0, 8), name: "Nýr notandi " + id.slice(0, 4),
        role: "learner", status: "pending", group: DEFAULT_GROUP, google: profile.sub,
        created: new Date().toISOString(), lastSeen: dayOf(),
      };
      users.push(user);
      return users;
    });

    if (user.status !== "active") {
      res.writeHead(302, { Location: "/?bid=1" });
      return res.end();
    }
    const token = await startSession(user);
    res.writeHead(302, {
      Location: "/",
      "Set-Cookie": cookieHeader(token, { secure: cookieSecure(req) }),
    });
    res.end();
  });

  /* --- my own account (v6.3) ---------------------------------------------
   * The rights the privacy notice promises, as buttons the child can press
   * without asking anybody: see it all, correct the name, choose who sees
   * what, and leave. */

  const needUser = async (req, res) => {
    const u = await currentUser(req);
    if (!u) { json(res, 401, { error: "Ekki innskráð(ur)." }); return null; }
    return u;
  };

  /** Everything held about one person, in one object. Used by the child's own
      "Sækja gögnin mín" and by the administrator answering an access request. */
  async function dossier(u) {
    const policies = await store.policies();
    const hidden = await store.hidden();
    const groups = await groupsNow();
    const rec = await store.stateRec(u.id);
    return {
      about: "Allt sem Fallaskóli geymir um þennan aðgang. Sjá /personuvernd.",
      exportedAt: new Date().toISOString(),
      account: {
        id: u.id, username: u.username, name: u.name, role: u.role, status: u.status,
        group: groupOf(u), groupName: (groups[groupOf(u)] || {}).name || "",
        created: u.created || null, lastSeen: u.lastSeen || null,
        signIn: u.google ? "google" : "password",
        consent: u.consent || null,
        share: shareOf(u),
        hiddenFromBoardByAdmin: hidden.includes(u.id),
        /* v6.13 (item 17): their own switch for the anonymous counting;
           null when they never touched it. */
        countedInStatistics: typeof u.stats === "boolean" ? u.stats : null,
        heldForReview: u.review || null,
      },
      curriculumCeiling: policies[u.id] || null,
      /* Without the seeds: they are not about the person, and while a duel
         is open they are its questions and answers (core/duel.js). */
      duels: (await store.duels()).filter((d) => d.a === u.id || d.b === u.id)
        .map(({ seed, keys, ...d }) => d),
      errorReports: (await store.reports()).filter((r) => r.by === u.id)
        .map(({ reviewedBy, ...r }) => r),
      /* v6.13 (item 67): the team duels they are in — the team and their
         own result; not the seeds, not anybody else's. */
      teamDuels: (await store.teamDuels()).filter((d) => teamOf(d, u.id))
        .map((d) => ({ id: d.id, kind: d.kind, team: d.names[teamOf(d, u.id)], target: d.target, n: d.n,
          created: d.created, deadline: d.deadline || null, result: (d.res || {})[u.id] || null })),
      /* v6.13: the result of each assignment they have sent one for. */
      assignments: (await store.assignments()).filter((a) => a.res && a.res[u.id])
        .map((a) => ({ id: a.id, target: a.target, n: a.n, due: a.due, created: a.created,
          result: a.res[u.id] })),
      progressSavedAt: rec ? rec.at : null,
      progress: rec ? rec.state : null,
    };
  }

  const sendFile = (res, name, body) => json(res, 200, body,
    { "Content-Disposition": `attachment; filename="${name}"` });

  on("GET", "/account", async (req, res) => {
    const u = await needUser(req, res);
    if (!u) return;
    return json(res, 200, {
      profile: publicUser(u),
      consent: u.consent ? { by: u.consent.by, over16: !!u.consent.over16, at: u.consent.at } : null,
      retention: { inactiveMonths: privacy.inactiveMonths, backupDays: privacy.backupDays },
      canDelete: !(u.role === "admin"),
      /* v6.13 (items 37, 65): who can see this learner's error patterns and
         assignment results — the guardians of their group, by nickname. The
         page says so in the pupil's own words. */
      teachers: u.role === "learner"
        ? (await store.users()).filter((x) => x.role === "guardian" && x.status === "active" &&
            groupOf(x) === groupOf(u)).map((x) => x.name || x.username)
        : [],
    });
  });

  on("GET", "/account/export", async (req, res) => {
    const u = await needUser(req, res);
    if (!u) return;
    return sendFile(res, `fallaskoli-${u.username}.json`, await dossier(u));
  });

  on("POST", "/account/name", async (req, res) => {
    const me = await needUser(req, res);
    if (!me) return;
    const name = tidyName((await readBody(req))?.name);
    let problem = null, updated = null;
    await store.updateUsers((users) => {
      problem = nameProblem(name, users, me.id, groupOf(me));
      if (problem) return null;
      const u = users.find((x) => x.id === me.id);
      u.name = name; updated = publicUser(u);
      return users;
    });
    if (problem) return json(res, 400, { error: problem });
    return json(res, 200, { ok: true, profile: updated });
  });

  on("POST", "/account/password", async (req, res) => {
    const me = await needUser(req, res);
    if (!me) return;
    const body = await readBody(req);
    if (!me.hash) return json(res, 400, { error: "Þessi aðgangur skráir sig inn með Google." });
    const key = "pw|" + me.id;
    if (throttle.blocked(key)) return json(res, 429, { error: "Of margar tilraunir. Bíddu í kortér." });
    if (!(await verifyPassword(String(body?.current || ""), me.salt, me.hash))) {
      throttle.fail(key);
      return json(res, 403, { error: "Núverandi lykilorð stemmir ekki." });
    }
    const problem = passwordProblem(String(body?.password || ""));
    if (problem) return json(res, 400, { error: problem });
    const { salt, hash } = await hashPassword(String(body.password));
    await store.updateUsers((users) => {
      const u = users.find((x) => x.id === me.id);
      u.salt = salt; u.hash = hash;
      return users;
    });
    /* Every OTHER device is logged out: whoever knew the old password is gone. */
    await endSessions(me.id, readCookie(req.headers.cookie));
    throttle.ok(key);
    return json(res, 200, { ok: true });
  });

  /* Who sees me. Off until the user turns it on (Art. 25 GDPR: the private
     setting is the default one), and theirs to turn off again at any time. */
  on("POST", "/account/share", async (req, res) => {
    const me = await needUser(req, res);
    if (!me) return;
    const body = await readBody(req);
    const board = body?.board === true;
    const share = { board, minutes: board && body?.minutes === true };
    await store.updateUsers((users) => {
      const u = users.find((x) => x.id === me.id);
      u.share = share;
      return users;
    });
    return json(res, 200, { ok: true, share });
  });

  on("POST", "/account/delete", async (req, res) => {
    const me = await needUser(req, res);
    if (!me) return;
    const body = await readBody(req);
    if (me.role === "admin")
      return json(res, 400, { error: "Umsjónarreikningi er ekki eytt héðan — annar umsjónarmaður gerir það." });
    /* The password again (or, for a Google account, the username typed out):
       a phone left unlocked on a table must not be enough to erase a year. */
    const key = "del|" + me.id;
    if (throttle.blocked(key)) return json(res, 429, { error: "Of margar tilraunir. Bíddu í kortér." });
    const proven = me.hash
      ? await verifyPassword(String(body?.password || ""), me.salt, me.hash)
      : String(body?.username || "").trim().toLowerCase() === me.username;
    if (!proven) {
      throttle.fail(key);
      return json(res, 403, { error: me.hash ? "Lykilorðið stemmir ekki." : "Skrifaðu notandanafnið þitt til að staðfesta." });
    }
    await store.eraseUser(me.id);
    forget(me.id);
    await audit(me.id, "eyddi eigin aðgangi", me.id);
    res.writeHead(204, { ...securityHeaders(req), "Set-Cookie": clearCookie(cookieSecure(req)) });
    res.end();
  });

  /* --- state --- */

  const ownsState = (u, id) => u && (u.id === id || can(u, "canAdminUsers"));
  const revHeaders = (rev) => ({ "X-State-Rev": String(rev), ETag: `"${rev}"` });

  on("GET", /^\/state\/([^/]+)$/, async (req, res, { params }) => {
    const u = await currentUser(req);
    const id = decodeURIComponent(params[0]);
    if (!ownsState(u, id)) return json(res, 403, { error: "Ekki þitt ástand." });
    const rec = await store.stateRec(id);
    if (!rec) return json(res, 404, { error: "Ekkert ástand." });
    return json(res, 200, rec.state, revHeaders(rec.rev));
  });

  on("PUT", /^\/state\/([^/]+)$/, async (req, res, { params }) => {
    const u = await currentUser(req);
    const id = decodeURIComponent(params[0]);
    if (!ownsState(u, id)) return json(res, 403, { error: "Ekki þitt ástand." });
    const owner = u.id === id ? u : (await store.users()).find((x) => x.id === id);
    if (!owner) return json(res, 404, { error: "Notandi fannst ekki." });

    /* SHAPE first (server/guard.mjs): what is stored is a state rebuilt field
       by field, never the bytes that arrived. */
    const clean = cleanState(await readBody(req, MAX_STATE_BYTES));
    if (!clean) return json(res, 400, { error: "Ástandið vantar." });
    /* The curriculum ceiling is cached inside the state so the program obeys it
       with no network — and it therefore comes back up with the state, written
       by a browser the server does not control. It is OVERWRITTEN here from the
       server's own record rather than being read. */
    clean.allowed = await ceilingFor(id);
    clean.profile = { id, name: owner.name || owner.username };

    /* Then: is this write based on what the server holds? `If-Match` carries
       the revision the device last saw. If another device has written since,
       nothing is stored and the device gets the current state back to merge
       with (core/merge.js) — that is what stops a phone left open since
       breakfast erasing the evening's work on the laptop. */
    const m = /(\d+)/.exec(String(req.headers["if-match"] || ""));
    const before = await store.stateRec(id);
    const out = await store.putState(id, clean, { expectRev: m ? Number(m[1]) : null });
    if (!out.ok) {
      return json(res, 409, {
        error: "Framvindan breyttist í öðru tæki.", rev: out.rev, state: out.state,
      }, revHeaders(out.rev));
    }

    /* PLAUSIBILITY last, and only for the child's own writes. The state is
       already saved; what a strange number costs is the audience, not the
       progress. */
    if (u.id === id && !owner.review) {
      const why = suspicion(clean, before ? before.state : null);
      if (why) {
        await store.updateUsers((users) => {
          const x = users.find((y) => y.id === id);
          if (!x || x.review) return null;
          x.review = { at: new Date().toISOString(), why };
          return users;
        });
        await audit("kerfi", "sett í yfirferð", id, why);
      }
    }
    return json(res, 200, { ok: true, rev: out.rev }, revHeaders(out.rev));
  });

  on("DELETE", /^\/state\/([^/]+)$/, async (req, res, { params }) => {
    const u = await currentUser(req);
    const id = decodeURIComponent(params[0]);
    if (!ownsState(u, id)) return json(res, 403, { error: "Ekki þitt ástand." });
    await store.deleteState(id);
    forget(id);
    res.writeHead(204, securityHeaders(req)); res.end();
  });

  /* --- leaderboard and rarity ---
     Both are built from EVERY state, which since v6.3 means from memory
     (store.mjs), and each person's scorecard is worked out once per saved
     revision rather than once per request. No derived table on disk, so
     nothing can fall out of step with what is actually stored. */

  const cardCache = new Map();      // id -> { key, card }
  const partCache = new Map();      // id -> { rev, part }   (rarity contribution)
  const forget = (id) => { cardCache.delete(id); partCache.delete(id); };

  /**
   * The states `viewer` may see. ONE function decides this, so the board, the
   * roster, last week's result and "found it first" cannot disagree:
   *
   *   - the user is active,
   *   - is in the viewer's own group,
   *   - has chosen to be shown (`share.board`),
   *   - has not been taken off the board by the administrator,
   *   - and is not being held for a look at an implausible number.
   */
  async function visibleStates(viewer) {
    const hidden = new Set(await store.hidden());
    const users = await store.users();
    const byId = new Map(users.map((u) => [u.id, u]));
    const group = groupOf(viewer);
    return (await store.allStates())
      .filter(({ id }) => {
        const u = byId.get(id);
        return u && u.status === "active" && groupOf(u) === group &&
          shareOf(u).board && !hidden.has(id) && !u.review;
      })
      .map(({ id, state, rev }) => ({ id, state, rev, user: byId.get(id) }));
  }

  async function cards(viewer, now = new Date()) {
    const seen = await visibleStates(viewer);
    /* Worked out HERE, from the dates, and sent as bare id lists: which badges
       are new this week and which this user found before anyone else. The
       dates themselves never leave the state (docs/API.md). */
    const firsts = firstFinders(seen);
    const monday = weekKey(now);
    return seen.map(({ id, state, rev, user }) => {
      const key = rev + "|" + monday;
      let hit = cardCache.get(id);
      if (!hit || hit.key !== key) {
        hit = { key, card: { ...scorecard(state, lex, now), newIds: newThisWeek(state, monday) } };
        cardCache.set(id, hit);
      }
      return {
        ...hit.card,
        profile: id, name: user.name || user.username,
        /* Time at the screen is its own switch: being on the board does not
           mean telling the class how long you practised. */
        minutes: shareOf(user).minutes ? hit.card.minutes : null,
        firstIds: firsts[id] || [],
      };
    });
  }

  on("GET", "/leaderboard", async (req, res, { url }) => {
    const u = await needUser(req, res);
    if (!u) return;
    const metric = url.searchParams.get("metric") || "week";
    let list = await cards(u);
    if (metric === "minutes") list = list.filter((c) => c.minutes != null);
    list = rank(list, metric);
    const withBadges = url.searchParams.get("include") === "badges";
    /* The board carries the shelf (title, showcase) but not the whole cabinet:
       the badge lists belong to `/roster`. */
    return json(res, 200, withBadges ? list
      : list.map(({ badgeIds, newIds, firstIds, tiers, ...r }) => r));
  });

  /**
   * Rarity, live — and the monthly snapshot that lets the interface say when it
   * last moved.
   *
   * The share itself has never been stored on a badge and is not stored now: it
   * is added up from the states on every request, so a badge won last March is
   * shown with today's number. That is the owner's *"even those already
   * achieved by the users are updated"*, and it needed no schedule.
   *
   * What the calendar month adds is a **record**. The first request in a new
   * month files what the picture looks like now, and every request gets the
   * previous month's counts alongside — so `tierMove` can put an arrow on a
   * badge that has become rarer since. No cron, no process running at midnight
   * on the first: the month rolls over when somebody next asks, which is the
   * same principle as the day-end badges.
   */
  async function rarityNow() {
    const users = await store.users();
    const active = new Set(users.filter((x) => x.status === "active").map((x) => x.id));
    const parts = (await store.allStates())
      .filter((s) => active.has(s.id))
      .map((s) => {
        let hit = partCache.get(s.id);
        if (!hit || hit.rev !== s.rev) { hit = { rev: s.rev, part: contribution(s.state) }; partCache.set(s.id, hit); }
        return hit.part;
      });
    return aggregate(parts);
  }

  on("GET", "/badges/stats", async (req, res) => {
    const u = await needUser(req, res);
    if (!u) return;
    const stats = await rarityNow();
    const now = new Date();
    const month = monthKey(now);

    const history = await store.rarityHistory();
    const last = history.length ? history[history.length - 1] : null;
    /* The previous month is the one to compare against — not the current
       month's own snapshot, which is a picture of this same data. */
    const previous = history.filter((h) => h.month < month).slice(-1)[0] || null;

    /* File this month the first time anyone asks in it, and refresh it on
       later asks so the record ends the month up to date. Only once the
       measurement means something: a snapshot of four users is noise. */
    if (measurable(stats) && (!last || last.month !== month || last.qualified !== stats.qualified)) {
      await store.appendRarity({
        month, at: now.toISOString(),
        users: stats.users, qualified: stats.qualified,
        badges: stats.badges,
      });
    }

    return json(res, 200, {
      ...stats,
      measurable: measurable(stats),
      minUsers: MIN_USERS,
      minDays: MIN_DAYS,
      month,
      refreshedAt: now.toISOString(),
      nextRefresh: nextRefresh(now).toISOString(),
      previous: previous
        ? { month: previous.month, qualified: previous.qualified, badges: previous.badges }
        : null,
    });
  });

  /* The record itself. Counts only — no names. */
  on("GET", "/badges/history", async (req, res) => {
    const u = await needUser(req, res);
    if (!u) return;
    const history = await store.rarityHistory();
    return json(res, 200, history.map(({ month, at, users, qualified }) =>
      ({ month, at, users, qualified })));
  });

  on("GET", "/roster", async (req, res) => {
    const u = await needUser(req, res);
    if (!u) return;
    const list = (await cards(u)).map((c) => ({
      profile: c.profile, name: c.name, level: c.level,
      crest: c.crest, crown: c.crown, badgeIds: c.badgeIds,
      title: c.title, showcase: c.showcase, tiers: c.tiers,
      newIds: c.newIds, firstIds: c.firstIds,
    }));
    return json(res, 200, list);
  });

  /* How last week ended: who earned the most between Monday and Sunday. Added
     up from the day records on request — no job has to run on Sunday night.
     Profile ids and a head count; no scores. */
  on("GET", "/social", async (req, res) => {
    const u = await needUser(req, res);
    if (!u) return;
    const week = weekKey(new Date());
    const last = prevWeekKey(week);
    const scores = (await visibleStates(u))
      .map(({ id, state }) => ({ profile: id, xp: weekXp(state, last) }));
    return json(res, 200, { week, lastWeek: weekResult(last, scores) });
  });

  /* --- duels (v6.7, core/duel.js) ---------------------------------------
   * Who may be challenged is the leaderboard's own rule: `visibleStates`, so
   * only somebody in the same group who has chosen to be shown — and only by
   * somebody who has chosen the same. The tidy-up (`pruneDuels`) runs inside
   * every read and write: a void duel is gone the next time anybody looks,
   * and no job has to run at midnight. The only limit is `DUEL.maxOpen`
   * open duels per person, which is what keeps the file small.
   *
   * v6.13: THE SERVER GRADES. A browser gets its seeds when the pupil presses
   * play (`/start`), builds its questions, and posts its ANSWERS; the server
   * builds the same questions from the same seeds and judges them with the
   * same code. What the browser says the score was is not asked for. What
   * this does and does not stop is written out in docs/API.md. */

  /* The lexicon duels are built from: the filtered vocabulary, for everyone —
     exactly what `lexForDuels` in src/js/app.js gives a browser. Built on the
     first duel, not at start-up: most visits never play one. */
  let duelLex = null;
  const lexForDuels = () => (duelLex ||= (DATA.blocked || []).length
    ? buildLexicon(DATA, { hide: new Set(DATA.blocked) }) : lex);
  const DUEL_DEPS = { nextTask, buildTask, makeView, applyEffects, blankState, newSession, createPolicy };

  /* One player's questions, with their signature. Building them is a few
     hundred builder calls, so the last ones are remembered: built when the
     pupil starts, used again when the answers arrive. Nothing depends on the
     memory — after a restart they are simply built again. */
  const duelBuilt = new Map();
  const DUEL_BUILT_MAX = 200;
  function questionsFor(d, side) {
    const k = `${d.id}/${side}`;
    let q = duelBuilt.get(k);
    if (!q) {
      const tasks = duelTasks(lexForDuels(), { ...d, side, key: d.keys[side] }, DUEL_DEPS);
      q = { tasks, sig: signature(tasks) };
      duelBuilt.set(k, q);
      if (duelBuilt.size > DUEL_BUILT_MAX) duelBuilt.delete(duelBuilt.keys().next().value);
    }
    return q;
  }
  const newSeed = () => crypto.randomBytes(4).readUInt32BE(0);

  async function duelNames(viewer) {
    const users = await store.users();
    const out = {};
    users.filter((x) => groupOf(x) === groupOf(viewer)).forEach((x) => { out[x.id] = x.name || x.username; });
    return out;
  }

  async function myDuels(u, now = Date.now()) {
    let list = await store.duels();
    const kept = pruneDuels(list, now);
    if (kept.length !== list.length) {
      list = (await store.updateDuels((cur) => {
        const k = pruneDuels(cur, now);
        return k.length !== cur.length ? k : null;
      })) || kept;
    }
    const names = await duelNames(u);
    return list.filter((d) => sideOf(d, u.id)).map((d) => viewFor(d, u.id, names, now))
      .sort((x, y) => y.created - x.created);
  }

  on("GET", "/duels", async (req, res) => {
    const u = await needUser(req, res);
    if (!u) return;
    const share = shareOf(u).board;
    const others = share
      ? (await visibleStates(u)).filter((x) => x.id !== u.id)
          .map((x) => ({ id: x.id, name: x.user.name || x.user.username }))
      : [];
    return json(res, 200, {
      duels: await myDuels(u), canChallenge: others, shown: share, review: !!u.review,
      sizes: DUEL.sizes, hours: DUEL.hours, maxOpen: DUEL.maxOpen,
    });
  });

  on("POST", "/duels", async (req, res) => {
    const u = await needUser(req, res);
    if (!u) return;
    const body = await readBody(req);
    const topic = String(body?.topic || ""), n = Number(body?.n), opp = String(body?.opponent || "");
    if (!validTopic(topic)) return json(res, 400, { error: "Óþekkt efni." });
    if (!validSize(n)) return json(res, 400, { error: `Einvígi er ${DUEL.sizes.join(", ")} spurningar.` });
    if (!shareOf(u).board) return json(res, 403, { error: "Til að skora á aðra þarftu sjálf(ur) að vera á stigatöflunni." });
    if (opp === u.id) return json(res, 400, { error: "Þú getur ekki skorað á sjálfa(n) þig." });
    const target = (await visibleStates(u)).find((x) => x.id === opp);
    if (!target) return json(res, 404, { error: "Þessi notandi er ekki á stigatöflunni í hópnum þínum." });
    const mine = await store.stateRec(u.id);
    /* Only what BOTH players have on: each one's ceiling AND choice. */
    const polOf = async (id, st) => createPolicy(await ceilingFor(id), st ? chosenPolicy(st) : null);
    const skills = duelSkills(topic, await polOf(u.id, mine && mine.state), await polOf(opp, target.state));
    if (!skills.length) return json(res, 400, { error: "Þetta efni er ekki í námsefni ykkar beggja." });
    const now = Date.now();
    let problem = null, made = null;
    await store.updateDuels((cur) => {
      const list = pruneDuels(cur, now);
      if (openCount(list, u.id, now) >= DUEL.maxOpen) {
        problem = `Þú ert með ${DUEL.maxOpen} opin einvígi. Kláraðu eitthvert þeirra fyrst.`; return null;
      }
      if (openCount(list, opp, now) >= DUEL.maxOpen) {
        problem = "Þessi notandi er með of mörg opin einvígi í augnablikinu."; return null;
      }
      made = {
        id: crypto.randomBytes(9).toString("base64url"), a: u.id, b: opp, topic, n, skills,
        /* `seed` makes the plan both share; `keys` each player's own
           questions. None of the three leaves the server before its player
           presses play. */
        seed: newSeed(), keys: { a: newSeed(), b: newSeed() },
        level: duelLevel(mine ? mine.state : null, target.state, topic),
        /* Each player's own level, for the handicap (core/duel.js). */
        lv: { a: topicLevel(mine ? mine.state : null, topic), b: topicLevel(target.state, topic) },
        data: DUEL_DATA,
        created: now, deadline: now + DUEL.hours * 3600000,
        res: { a: null, b: null },
      };
      return [...list, made];
    });
    if (problem) return json(res, 409, { error: problem });
    return json(res, 200, { ok: true, duel: viewFor(made, u.id, await duelNames(u), now) });
  });

  /* A pupil presses play: the seeds of THEIR questions, and no sooner. The
     moment is written down (`started`), once; pressing play again — after a
     reload, on another device — gives the same seeds and the same questions. */
  on("POST", /^\/duels\/([A-Za-z0-9_-]{6,40})\/start$/, async (req, res, { params }) => {
    const u = await needUser(req, res);
    if (!u) return;
    const id = params[0];
    const now = Date.now();
    let problem = null, duel = null, side = null;
    await store.updateDuels((cur) => {
      const list = pruneDuels(cur, now);
      const d = list.find((x) => x.id === id);
      side = d && sideOf(d, u.id);
      if (!side) { problem = [404, "Einvígið er ekki til."]; return null; }
      if (duelStatus(d, now) !== "open") { problem = [409, "Einvígið er búið."]; return null; }
      if (d.res[side]) { problem = [409, "Þú hefur þegar skilað í þessu einvígi."]; return null; }
      duel = d;
      if (d.keys && d.started && d.started[side]) return null;      // nothing new to write
      /* A duel made before v6.13 has no keys of its own yet. */
      d.keys ||= { a: newSeed(), b: newSeed() };
      (d.started ||= {})[side] ||= now;
      return list;
    });
    if (problem) return json(res, problem[0], { error: problem[1] });
    const q = questionsFor(duel, side);
    return json(res, 200, {
      ok: true, duel: viewFor(duel, u.id, await duelNames(u), now),
      seed: duel.seed, key: duel.keys[side],
      /* What the server will grade. A browser that built something else
         (an old tab after an update) can say so before the first question. */
      sig: q.sig,
    });
  });

  /* The answers. `{ answers: [response | null, …], sig }` — one response per
     question, in order, in the shapes core/answer.js lists; `sig` is the
     signature of the questions the browser asked. The score is worked out
     here and nowhere else. The answers are graded and dropped, never stored. */
  on("POST", /^\/duels\/([A-Za-z0-9_-]{6,40})\/result$/, async (req, res, { params }) => {
    const u = await needUser(req, res);
    if (!u) return;
    const id = params[0];
    /* Twenty answers of at most ANSWER_LIMITS.bytes each, and the wrapping. */
    const body = await readBody(req, 20 * ANSWER_LIMITS.bytes + 4096);
    const answers = body?.answers;
    const sig = typeof body?.sig === "string" ? body.sig.slice(0, 40) : null;
    if (!Array.isArray(answers) || !sig) {
      /* A browser still running the program from before v6.13 sends a score. */
      return json(res, 400, { error: "Ógild niðurstaða. Endurhladdu síðuna (F5) og spilaðu einvígið aftur." });
    }
    const now = Date.now();
    const open = (list) => {
      const d = list.find((x) => x.id === id);
      const side = d && sideOf(d, u.id);
      if (!side) return { problem: [404, "Einvígið er ekki til."] };
      if (duelStatus(d, now) !== "open") return { problem: [409, "Einvígið er búið."] };
      if (d.res[side]) return { problem: [409, "Þú hefur þegar skilað í þessu einvígi."] };
      /* Nobody can have answered questions they were never given. */
      if (!d.keys || !d.started || !d.started[side]) return { problem: [409, "Einvígið er ekki hafið."] };
      if (answers.length > d.n) return { problem: [400, "Ógild niðurstaða."] };
      return { d, side };
    };
    const first = open(pruneDuels(await store.duels(), now));
    if (first.problem) return json(res, first.problem[0], { error: first.problem[1] });
    const q = questionsFor(first.d, first.side);
    if (sig !== q.sig) {
      /* The browser asked other questions than these (other data, an old
         tab). Grading its answers against ours would be noise, so nothing is
         stored and the duel can be played again. */
      return json(res, 409, { error: "Spurningarnar stemma ekki við þjóninn. Endurhladdu síðuna (F5) og spilaðu einvígið aftur." });
    }
    const { c, n } = gradeDuel(q.tasks, answers, judge);
    let problem = null, view = null;
    await store.updateDuels((cur) => {
      const list = pruneDuels(cur, now);
      /* Asked again inside the write: the other tab may have got here first. */
      const again = open(list);
      if (again.problem) { problem = again.problem; return null; }
      again.d.res[again.side] = { c, n, at: now };
      view = again.d;
      return list;
    });
    if (problem) return json(res, problem[0], { error: problem[1] });
    duelBuilt.delete(`${id}/${first.side}`);
    return json(res, 200, { ok: true, duel: viewFor(view, u.id, await duelNames(u), now) });
  });

  /* --- the teacher: the class's patterns and assignments (v6.13) ----------
   *
   * Items 37 and 65 of the critique. Two things a teacher needs and the
   * program did not have: the error patterns of the whole class on one
   * screen, and homework they can set and check.
   *
   * WHO: a guardian of the group (`canTeach`, the group's own adult — the
   * teacher of a class, the parent of a family), and the administrator, for
   * any group. `needTeacher` is the one check, and the group a guardian asks
   * about must be their own: another group's guardian gets 403, a pupil 403,
   * nobody logged in 401.
   *
   * WHAT the teacher sees of a pupil: the nickname, the figures of each error
   * pattern (`pupilStandings`, core/classview.js — the very numbers the pupil
   * sees under Framvinda, by the same function), and the result of each
   * assignment as numbers. Only learners who are active and in the group.
   * Not the examples a pattern keeps, not a date, not whether they are on the
   * board, and nothing they typed: the state does not hold it. The privacy
   * notice says so (server/privacy.mjs), and the pupil's own account page
   * names the group's teachers.
   *
   * Views are not written to the audit trail — a teacher looks every day, and
   * 2,000 lines of "looked" would bury what the trail is for. Setting and
   * removing an assignment is written there. */

  /** May this request act as teacher of `groupId` (default: their own)?
      Answers the request itself if not, and returns `{ me, group, name }`. */
  async function needTeacher(req, res, groupId = null) {
    const me = await currentUser(req);
    if (!me) { json(res, 401, { error: "Ekki innskráð(ur)." }); return null; }
    if (!can(me, "canTeach")) { json(res, 403, { error: "Þú hefur ekki þessi réttindi." }); return null; }
    const group = groupId ? String(groupId) : groupOf(me);
    /* Membership before existence, so a guardian cannot learn which groups
       exist by asking for them. */
    if (!can(me, "canAdminUsers") && group !== groupOf(me)) {
      json(res, 403, { error: "Þetta er ekki hópurinn þinn." }); return null;
    }
    const groups = await groupsNow();
    if (!groups[group]) { json(res, 404, { error: "Hópurinn er ekki til." }); return null; }
    return { me, group, name: groups[group].name };
  }

  /** The learners of a group, each with the figures of their patterns. */
  async function pupilsOf(group) {
    const users = (await store.users()).filter((u) =>
      u.role === "learner" && u.status === "active" && groupOf(u) === group);
    const out = [];
    for (const u of users) {
      const rec = await store.stateRec(u.id);
      out.push({ id: u.id, name: u.name || u.username, practised: !!rec,
        diag: rec ? pupilStandings(rec.state) : {} });
    }
    return out.sort(byName);
  }

  /* The list of assignments, tidied: a closed one is erased `keepDays` after
     its deadline, the next time anybody looks (as duels are). */
  async function assignmentsNow(now = Date.now()) {
    let list = await store.assignments();
    const kept = pruneAssignments(list, now);
    if (kept.length !== list.length) {
      list = (await store.updateAssignments((cur) => {
        const k = pruneAssignments(cur, now);
        return k.length !== cur.length ? k : null;
      })) || kept;
    }
    return list;
  }

  /** Which groups this user teaches: their own, or every group for the
      administrator. For the group picker in Skólastofan. */
  on("GET", "/teacher/groups", async (req, res) => {
    const t = await needTeacher(req, res);
    if (!t) return;
    const users = await store.users();
    const groups = await groupsNow();
    const ids = can(t.me, "canAdminUsers") ? Object.keys(groups) : [t.group];
    return json(res, 200, {
      mine: groupOf(t.me),
      groups: ids.map((id) => ({ id, name: groups[id].name,
        pupils: users.filter((u) => u.role === "learner" && u.status === "active" && groupOf(u) === id).length })),
    });
  });

  /* Item 37: the class's error patterns. `columns` is the class's worst
     first (core/classview.js `classColumns`); "Ógreint" rides in each
     pupil's `diag` under its own id and is drawn last. */
  on("GET", "/teacher/patterns", async (req, res, { url }) => {
    const t = await needTeacher(req, res, url.searchParams.get("group"));
    if (!t) return;
    const pupils = await pupilsOf(t.group);
    return json(res, 200, { group: { id: t.group, name: t.name }, pupils,
      columns: classColumns(pupils).map((c) => c.id) });
  });

  /* The same table as a file, for a spreadsheet. */
  on("GET", "/teacher/patterns.csv", async (req, res, { url }) => {
    const t = await needTeacher(req, res, url.searchParams.get("group"));
    if (!t) return;
    const buf = Buffer.from(patternCSV(await pupilsOf(t.group)), "utf8");
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8", "Content-Length": buf.length,
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="villumynstur-${dayOf()}.csv"`,
      ...securityHeaders(req),
    });
    res.end(buf);
  });

  /* Item 65: the assignments of a group, with who has done them, their
     scores, and the class's patterns on each one's material. */
  on("GET", "/teacher/assignments", async (req, res, { url }) => {
    const t = await needTeacher(req, res, url.searchParams.get("group"));
    if (!t) return;
    const now = Date.now();
    const pupils = await pupilsOf(t.group);
    const list = (await assignmentsNow(now)).filter((a) => a.group === t.group)
      .sort((x, y) => y.created - x.created)
      .map((a) => {
        const only = patternsOf(a.target, typesOfSkill);
        return {
          id: a.id, target: a.target, n: a.n, due: a.due, note: a.note || "",
          created: a.created, open: isOpen(a, now),
          results: pupils.map((p) => {
            const r = (a.res || {})[p.id];
            return { id: p.id, name: p.name,
              /* Numbers only: not when it was done, nor how many tries —
                 the notice promises the teacher does not see when or how
                 long a pupil practises. */
              res: r ? { i: r.i, j: r.j, c: r.c, done: !!r.done } : null };
          }),
          columns: classColumns(pupils, only).map((c) => c.id),
        };
      });
    return json(res, 200, { group: { id: t.group, name: t.name }, limits: ASSIGN,
      assignments: list,
      /* The figures behind `columns`, once for all the assignments. */
      pupils: pupils.map((p) => ({ id: p.id, name: p.name, diag: p.diag })) });
  });

  on("POST", "/teacher/assignments", async (req, res) => {
    const body = await readBody(req, 4096);
    const t = await needTeacher(req, res, body?.group);
    if (!t) return;
    const target = cleanTarget(body?.target);
    if (!target) return json(res, 400, { error: "Veldu efni verkefnisins." });
    const n = Number(body?.n);
    if (!ASSIGN.sizes.includes(n))
      return json(res, 400, { error: `Fjöldi spurninga: ${ASSIGN.sizes.join(", ")}.` });
    const now = Date.now();
    const bad = dueProblem(body?.due, now);
    if (bad) return json(res, 400, { error: bad });
    const note = tidyName(body?.note).slice(0, ASSIGN.noteMax);
    if (/[<>]/.test(note)) return json(res, 400, { error: "Athugasemdin má ekki innihalda < eða >." });
    let problem = null, made = null;
    await store.updateAssignments((cur) => {
      const list = pruneAssignments(cur, now);
      if (openAssignments(list, t.group, now) >= ASSIGN.maxOpen) {
        problem = `Hópurinn er með ${ASSIGN.maxOpen} opin verkefni. Eyddu einhverju þeirra fyrst.`;
        return null;
      }
      made = { id: crypto.randomBytes(9).toString("base64url"), group: t.group, by: t.me.id,
        target, n, due: body.due, note, created: now, res: {} };
      return [...list, made];
    });
    if (problem) return json(res, 409, { error: problem });
    await audit(t.me.id, "setti verkefni", null, `${t.group}: ${target.kind} ${target.id}`);
    return json(res, 200, { ok: true, assignment: viewForPupil(made, null, now) });
  });

  on("DELETE", /^\/teacher\/assignments\/([A-Za-z0-9_-]{6,40})$/, async (req, res, { params }) => {
    const a = (await store.assignments()).find((x) => x.id === params[0]);
    /* The group is the assignment's own: a teacher of another group gets the
       same 403 as for asking about that group, and learns nothing more. */
    const t = await needTeacher(req, res, a ? a.group : null);
    if (!t) return;
    if (!a) return json(res, 404, { error: "Verkefnið er ekki til." });
    await store.updateAssignments((list) => {
      const rest = list.filter((x) => x.id !== a.id);
      return rest.length !== list.length ? rest : null;
    });
    await audit(t.me.id, "eyddi verkefni", null, t.group);
    res.writeHead(204, securityHeaders(req)); res.end();
  });

  /* The pupil's side. Only a learner has assignments; an open one is listed
     until its deadline has passed. */
  on("GET", "/assignments", async (req, res) => {
    const u = await needUser(req, res);
    if (!u) return;
    if (u.role !== "learner") return json(res, 200, { assignments: [] });
    const now = Date.now();
    const list = (await assignmentsNow(now))
      .filter((a) => a.group === groupOf(u) && isOpen(a, now))
      .sort((x, y) => x.due.localeCompare(y.due) || x.created - y.created)
      .map((a) => viewForPupil(a, u.id, now));
    return json(res, 200, { assignments: list });
  });

  on("POST", /^\/assignments\/([A-Za-z0-9_-]{6,40})\/result$/, async (req, res, { params }) => {
    const u = await needUser(req, res);
    if (!u) return;
    const body = await readBody(req, 4096);
    const now = Date.now();
    let problem = null, view = null;
    await store.updateAssignments((cur) => {
      const list = pruneAssignments(cur, now);
      const a = list.find((x) => x.id === params[0]);
      if (!a || a.group !== groupOf(u) || u.role !== "learner") {
        problem = [404, "Verkefnið er ekki til."]; return null;
      }
      if (!isOpen(a, now)) { problem = [409, "Skiladagurinn er liðinn."]; return null; }
      const r = cleanResult(body, a.n);
      if (!r) { problem = [400, "Ógild niðurstaða."]; return null; }
      const prev = (a.res ||= {})[u.id] || null;
      if (prev && (prev.tries || 0) >= ASSIGN.maxTries) {
        problem = [429, "Þú hefur sent þetta verkefni mjög oft. Niðurstaðan þín er geymd."]; return null;
      }
      a.res[u.id] = recordResult(prev, r, a.n, now);
      view = viewForPupil(a, u.id, now);
      return list;
    });
    if (problem) return json(res, problem[0], { error: problem[1] });
    return json(res, 200, { ok: true, assignment: view });
  });

  /* --- a live class round (v6.13, critique item 64) -------------------------
   * Everything is in server/live.mjs — the rounds, the clock, the event
   * streams, the limits — so that this file only lends it the helpers that
   * decide who is logged in, who teaches whom, and who may be named in front
   * of the class: the leaderboard's own rule (`visibleStates`). Routes:
   * GET+POST /teacher/live, POST /teacher/live/:id/{next,close,end},
   * GET /teacher/live/:id/events; GET /live, POST /live/:id/{join,answer},
   * GET /live/:id/events. */
  const live = createLive({
    store, lexFor: lexForDuels, deps: DUEL_DEPS, judge, groupOf, audit,
    shownOf: async (u) => shareOf(u).board && !u.review && !(await store.hidden()).includes(u.id),
    ceiling: () => ceilingFor("*"), ...liveOptions,
  });
  live.routes({ on, json, readBody, needUser, needTeacher, securityHeaders });

  /* --- team duels (v6.13, critique item 67) — server/teamduel.mjs ---------
   * A class split in two, or one class against another, on the duel's own
   * questions and grading. Routes: GET+POST /teacher/teamduels,
   * POST /teacher/teamduels/:id/accept, DELETE /teacher/teamduels/:id;
   * GET /teamduels, POST /teamduels/:id/{start,result}. */
  const teamDuels = createTeamDuels({
    store, lexFor: lexForDuels, deps: DUEL_DEPS, judge, groupOf, audit, can,
    ceiling: () => ceilingFor("*"), dataPrint: DUEL_DATA, groupsNow,
  });
  teamDuels.routes({ on, json, readBody, needUser, needTeacher, securityHeaders });

  /* --- the curriculum ceiling ------------------------------------------
   *
   * The owner: *"The admin and local admin decide what is possible, within what
   * is allowed, the user can choose to enable and disable, i.e. he or she cannot
   * enable things the local admin or admin has not enabled."*
   *
   * Two levels, one file (`policies.json`): `*` is the default for everybody,
   * and a user id overrides it for that child alone.
   *
   * WHO may set it (v6.3): the administrator, anything. A guardian — the
   * "local admin" — only the ceiling of a learner in their OWN group, and never
   * the default. Before this a guardian could change what every child on the
   * server was allowed to see.
   */
  async function ceilingFor(userId) {
    const all = await store.policies();
    const mine = all[userId];
    return sanitisePolicy(mine || all["*"] || null);
  }

  /** May `me` set the ceiling of user `id`? Answers the request itself if not. */
  async function needCeilingRight(req, res, id) {
    const me = await needAdmin(req, res, "canEditCurriculum");
    if (!me) return null;
    if (can(me, "canAdminUsers")) return me;
    const target = (await store.users()).find((x) => x.id === id);
    if (!target || target.role !== "learner" || groupOf(target) !== groupOf(me)) {
      json(res, 403, { error: "Þú hefur ekki þessi réttindi." });
      return null;
    }
    return me;
  }

  on("GET", "/policy", async (req, res) => {
    const u = await needUser(req, res);
    if (!u) return;
    const all = await store.policies();
    return json(res, 200, { policy: await ceilingFor(u.id), own: !!all[u.id] });
  });

  on("GET", "/admin/policy", async (req, res) => {
    if (!(await needAdmin(req, res, "canAdminUsers"))) return;
    const all = await store.policies();
    return json(res, 200, { policy: sanitisePolicy(all["*"] || null), own: !!all["*"] });
  });

  on("PUT", "/admin/policy", async (req, res) => {
    const me = await needAdmin(req, res, "canAdminUsers");
    if (!me) return;
    const body = await readBody(req);
    const clean = sanitisePolicy(body && body.policy);
    await store.updatePolicies((p) => { p["*"] = clean; return p; });
    await audit(me.id, "breytti sjálfgefnu þaki");
    return json(res, 200, { ok: true, policy: clean });
  });

  on("GET", /^\/admin\/users\/([^/]+)\/policy$/, async (req, res, { params }) => {
    const id = decodeURIComponent(params[0]);
    if (!(await needCeilingRight(req, res, id))) return;
    const all = await store.policies();
    return json(res, 200, { policy: await ceilingFor(id), own: !!all[id] });
  });

  on("PUT", /^\/admin\/users\/([^/]+)\/policy$/, async (req, res, { params }) => {
    const id = decodeURIComponent(params[0]);
    const me = await needCeilingRight(req, res, id);
    if (!me) return;
    const body = await readBody(req);
    /* A null policy is not an empty policy. It means "this child has no ceiling
       of their own" and hands them back to the default. */
    if (body && body.policy === null) {
      await store.updatePolicies((p) => { delete p[id]; return p; });
      await audit(me.id, "fjarlægði eigið þak", id);
      return json(res, 200, { ok: true, policy: await ceilingFor(id), own: false });
    }
    const clean = sanitisePolicy(body && body.policy);
    await store.updatePolicies((p) => { p[id] = clean; return p; });
    await audit(me.id, "breytti þaki", id);
    return json(res, 200, { ok: true, policy: clean, own: true });
  });

  /* --- word definitions from the installed data set --- */

  on("GET", "/definitions", async (req, res, { url }) => {
    const map = await store.dataset();
    if (!map) return json(res, 404, { error: "Ekkert gagnasafn uppsett." });
    const binId = url.searchParams.get("bin_id");
    const lemma = (url.searchParams.get("lemma") || "").toLowerCase();
    const cls = url.searchParams.get("cls") || "";
    let hit = (binId && map[binId]) || null;
    /* The lemma fallback is where the *sá* fault could come back: one lemma, two
       word classes, one definition. It is only used when the class agrees — and
       an entry that does not record its class is not trusted for it at all. */
    if (!hit && lemma) {
      const byLemma = map["l:" + lemma];
      if (byLemma && byLemma.cls && (!cls || byLemma.cls === cls)) hit = byLemma;
    }
    if (hit && hit.cls && cls && hit.cls !== cls) hit = null;
    if (!hit) return json(res, 404, { error: "Engin skýring." });
    return json(res, 200, hit);
  });

  /* --- error reports (v6.8, src/js/ui/reports.js) -----------------------
   * A child (or anybody logged in) flags a question that looks wrong. What is
   * kept: their own words, the kind of problem, and the question as the
   * program built it — the sentence, its analysis, the expected answer and
   * what was answered — so the administrator can judge it without having to
   * reproduce it. Nothing is acted on automatically. Limits: a note of 2,000
   * characters, a snapshot of 60 kB, 40 reports per person per day and 3,000
   * kept in all (the oldest reviewed ones go first). */
  const REPORT_KINDS = new Set(["villa", "setning", "skyring", "annad"]);
  const REPORT_STATUS = new Set(["ny", "villa", "ekkivilla", "lagad"]);
  const REPORT_MAX = 3000, REPORT_PER_DAY = 40;

  on("POST", "/reports", async (req, res) => {
    const u = await needUser(req, res);
    if (!u) return;
    const body = await readBody(req, 96 * 1024);
    const kind = String(body?.kind || "");
    if (!REPORT_KINDS.has(kind)) return json(res, 400, { error: "Veldu hvers konar villa þetta er." });
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 2000) : "";
    let ctx = body?.ctx && typeof body.ctx === "object" ? body.ctx : null;
    if (ctx && JSON.stringify(ctx).length > 60 * 1024) ctx = { truncated: true, card: String(ctx.card?.text || "").slice(0, 4000) };
    const now = Date.now(), dayAgo = now - 86400000;
    let problem = null, made = null;
    await store.updateReports((list) => {
      if (list.filter((r) => r.by === u.id && r.at > dayAgo).length >= REPORT_PER_DAY) {
        problem = "Þú hefur sent margar tilkynningar í dag. Takk! Reyndu aftur á morgun."; return null;
      }
      made = {
        id: crypto.randomBytes(9).toString("base64url"), at: now, by: u.id,
        kind, note, ctx, status: "ny", adminNote: "", reviewedAt: null, reviewedBy: null,
      };
      let next = [...list, made];
      if (next.length > REPORT_MAX) {
        const drop = next.filter((r) => r.status !== "ny").sort((a, b) => a.at - b.at)
          .slice(0, next.length - REPORT_MAX).map((r) => r.id);
        const gone = new Set(drop);
        next = next.filter((r) => !gone.has(r.id));
        if (next.length > REPORT_MAX) next = next.slice(next.length - REPORT_MAX);
      }
      return next;
    });
    if (problem) return json(res, 429, { error: problem });
    return json(res, 200, { ok: true, id: made.id });
  });

  /* --- administration --- */

  const needAdmin = async (req, res, right) => {
    const u = await currentUser(req);
    if (!u) { json(res, 401, { error: "Ekki innskráð(ur)." }); return null; }
    if (!can(u, right)) { json(res, 403, { error: "Þú hefur ekki þessi réttindi." }); return null; }
    return u;
  };

  on("GET", "/admin/users", async (req, res) => {
    if (!(await needAdmin(req, res, "canAdminUsers"))) return;
    return json(res, 200, (await store.users()).map(adminUser));
  });

  /* Create an account for somebody (v6.3) — the route the admin page's "Nýr
     notandi" uses, and the same thing `admin.mjs nyr` does from a terminal. The
     password is GENERATED and shown once: a password picked in a hurry for a
     child ends up being "1234". */
  on("POST", "/admin/users", async (req, res) => {
    const me = await needAdmin(req, res, "canAdminUsers");
    if (!me) return;
    const body = await readBody(req);
    const username = String(body?.username || "").trim().toLowerCase();
    if (!USERNAME.test(username))
      return json(res, 400, { error: "Notandanafn: 3–32 stafir, engin bil." });
    const role = body?.role === "guardian" ? "guardian" : "learner";
    const groups = await groupsNow();
    const group = groups[body?.group] ? String(body.group) : DEFAULT_GROUP;
    const name = tidyName(body?.name) || username;

    let consent = null;
    if (role === "learner") {
      const [c, problem] = consentFrom(body, "admin", { recordedBy: me.id });
      if (problem) return json(res, 400, { error: problem });
      consent = c;
    }
    const password = makePassword();
    const { salt, hash } = await hashPassword(password);
    let clash = null, created = null;
    await store.updateUsers((users) => {
      if (users.some((u) => u.username === username)) { clash = "Notandanafnið er þegar til."; return null; }
      clash = nameProblem(name, users, null, group);
      if (clash) return null;
      created = {
        id: newId(), username, name, role, status: "active", group, salt, hash,
        ...(consent ? { consent } : {}),
        created: new Date().toISOString(), lastSeen: dayOf(),
      };
      users.push(created);
      return users;
    });
    if (clash) return json(res, 409, { error: clash });
    await audit(me.id, "bjó til aðgang", created.id);
    return json(res, 200, { ok: true, user: adminUser(created), password });
  });

  on("POST", /^\/admin\/users\/([^/]+)$/, async (req, res, { params }) => {
    const me = await needAdmin(req, res, "canAdminUsers");
    if (!me) return;
    const id = decodeURIComponent(params[0]);
    const body = await readBody(req);
    const groups = await groupsNow();
    let problem = null, updated = null, kick = false;
    const did = [];
    await store.updateUsers((users) => {
      const u = users.find((x) => x.id === id);
      if (!u) { problem = "Notandi fannst ekki."; return null; }

      /* Consent first, so "record it and admit" can be one press. */
      if (body?.consent && typeof body.consent === "object") {
        const [c, bad] = consentFrom(body.consent, "admin", { recordedBy: me.id });
        if (bad) { problem = bad; return null; }
        u.consent = c; did.push("skráði samþykki");
      }
      if (body?.status && ["active", "pending", "blocked"].includes(body.status)) {
        /* An administrator must not be able to lock themselves out — then
           nobody could get in to open it again. */
        if (u.id === me.id && body.status !== "active") { problem = "Þú getur ekki lokað á sjálfa(n) þig."; return null; }
        /* Nobody under the consent age is let in on the administrator's say-so
           alone: somebody has to have consented, and it has to be written down. */
        if (body.status === "active" && !consentOk(u)) {
          problem = "Skráðu fyrst hver samþykkti aðganginn (foreldri/forsjáraðili, eða notandinn sjálfur ef hann er 16 ára eða eldri).";
          return null;
        }
        if (u.status !== body.status) did.push("staða: " + body.status);
        if (body.status !== "active") kick = true;
        u.status = body.status;
      }
      if (body?.role && ROLES[body.role]) {
        if (u.id === me.id && body.role !== "admin") { problem = "Þú getur ekki tekið af þér umsjónina."; return null; }
        /* Two administrators at most: one to run it and one who can get back
           in when the first has lost the password. More is a crowd of people
           who can read every child's progress. */
        if (body.role === "admin" && u.role !== "admin" &&
            users.filter((x) => x.role === "admin").length >= MAX_ADMINS) {
          problem = `Það mega mest vera ${MAX_ADMINS} umsjónarreikningar.`; return null;
        }
        if (u.role !== body.role) did.push("hlutverk: " + body.role);
        u.role = body.role;
      }
      if (typeof body?.group === "string") {
        if (!groups[body.group]) { problem = "Hópurinn er ekki til."; return null; }
        if (groupOf(u) !== body.group) did.push("færði í annan hóp");
        u.group = body.group;
      }
      if (typeof body?.name === "string") {
        const name = tidyName(body.name);
        problem = nameProblem(name, users, u.id, groupOf(u));
        if (problem) return null;
        u.name = name;
      }
      if (body?.review === false && u.review) { delete u.review; did.push("lauk yfirferð"); }
      updated = adminUser(u);
      return users;
    });
    if (problem) return json(res, 400, { error: problem });
    if (kick) await endSessions(id);
    for (const act of did) await audit(me.id, act, id);
    return json(res, 200, { ok: true, user: updated });
  });

  /* Erasure — the same `eraseUser` whoever asks: the administrator here, the
     child under /account/delete, the retention sweep. */
  on("DELETE", /^\/admin\/users\/([^/]+)$/, async (req, res, { params }) => {
    const me = await needAdmin(req, res, "canAdminUsers");
    if (!me) return;
    const id = decodeURIComponent(params[0]);
    if (id === me.id) return json(res, 400, { error: "Þú getur ekki eytt sjálfum þér." });
    await store.eraseUser(id);
    forget(id);
    await audit(me.id, "eyddi aðgangi", id);
    res.writeHead(204, securityHeaders(req)); res.end();
  });

  /* A forgotten password. There is no email in this program, on purpose, so
     the way back in goes through a person: the administrator presses a button
     and reads four words to the family. Every device is logged out. */
  on("POST", /^\/admin\/users\/([^/]+)\/password$/, async (req, res, { params }) => {
    const me = await needAdmin(req, res, "canAdminUsers");
    if (!me) return;
    const id = decodeURIComponent(params[0]);
    const password = makePassword();
    const { salt, hash } = await hashPassword(password);
    let found = false;
    await store.updateUsers((users) => {
      const u = users.find((x) => x.id === id);
      if (!u || u.google) return null;
      u.salt = salt; u.hash = hash; found = true;
      return users;
    });
    if (!found) return json(res, 400, { error: "Notandi fannst ekki, eða hann skráir sig inn með Google." });
    await endSessions(id, id === me.id ? readCookie(req.headers.cookie) : null);
    await audit(me.id, "nýtt lykilorð", id);
    return json(res, 200, { ok: true, password });
  });

  /* Answering "what do you hold about my child?" in one file. */
  on("GET", /^\/admin\/users\/([^/]+)\/export$/, async (req, res, { params }) => {
    const me = await needAdmin(req, res, "canAdminUsers");
    if (!me) return;
    const u = (await store.users()).find((x) => x.id === decodeURIComponent(params[0]));
    if (!u) return json(res, 404, { error: "Notandi fannst ekki." });
    await audit(me.id, "sótti gögn notanda", u.id);
    return sendFile(res, `fallaskoli-${u.username}.json`, await dossier(u));
  });

  /* The leaderboard: an administrator may take a user off it. The progress
     itself is untouched — only the display. This is on top of the user's own
     choice (`/account/share`), never instead of it: the administrator can
     hide somebody, and cannot show somebody who has not chosen to be shown. */
  on("GET", "/admin/leaderboard", async (req, res) => {
    if (!(await needAdmin(req, res, "canEditLeaderboard"))) return;
    return json(res, 200, { hidden: await store.hidden(), metrics: METRICS.map((m) => m.id) });
  });

  on("POST", "/admin/leaderboard", async (req, res) => {
    const me = await needAdmin(req, res, "canEditLeaderboard");
    if (!me) return;
    const body = await readBody(req);
    const list = Array.isArray(body?.hidden) ? body.hidden.map(String).slice(0, 500) : [];
    await store.setHidden(list);
    await audit(me.id, "breytti földum á stigatöflu");
    return json(res, 200, { ok: true, hidden: list });
  });

  /* --- invitations (v6.3) -------------------------------------------------
   * How a family gets in. The administrator makes a code, says which group it
   * leads to, how many accounts it is good for and for how long, and hands it
   * to the PARENT. The code is what makes registration possible at all, and
   * the parent is the one who types their name under the consent. */
  on("GET", "/admin/invites", async (req, res) => {
    if (!(await needAdmin(req, res, "canAdminUsers"))) return;
    const now = Date.now();
    return json(res, 200, (await store.invites()).map((i) => ({
      id: i.id, code: i.code, group: i.group, note: i.note || "", max: i.max,
      uses: i.uses || 0, exp: i.exp, created: i.created,
      live: new Date(i.exp).getTime() > now && (i.uses || 0) < i.max,
    })));
  });

  on("POST", "/admin/invites", async (req, res) => {
    const me = await needAdmin(req, res, "canAdminUsers");
    if (!me) return;
    const body = await readBody(req);
    const groups = await groupsNow();
    const group = groups[body?.group] ? String(body.group) : DEFAULT_GROUP;
    const max = Math.min(Math.max(parseInt(body?.max, 10) || 1, 1), 40);
    const days = Math.min(Math.max(parseInt(body?.days, 10) || 14, 1), 60);
    const invite = {
      id: newId(), code: makeInviteCode(), group, max, uses: 0, usedBy: [],
      note: tidyName(body?.note).slice(0, 60),
      created: new Date().toISOString(),
      exp: new Date(Date.now() + days * 86400000).toISOString(),
      by: me.id,
    };
    await store.updateInvites((list) => [...list, invite]);
    await audit(me.id, "bjó til boðskóða", null, `${max} × ${days} dagar`);
    return json(res, 200, { ok: true, invite: { ...invite, live: true } });
  });

  on("DELETE", /^\/admin\/invites\/([^/]+)$/, async (req, res, { params }) => {
    const me = await needAdmin(req, res, "canAdminUsers");
    if (!me) return;
    const id = decodeURIComponent(params[0]);
    await store.updateInvites((list) => list.filter((i) => i.id !== id));
    await audit(me.id, "afturkallaði boðskóða");
    res.writeHead(204, securityHeaders(req)); res.end();
  });

  /* --- groups (v6.3) ------------------------------------------------------
   * A group is who can see whom: a family, a class, a circle of friends. The
   * board, the roster and last week's result stop at its edge. Badge RARITY
   * does not — that is an anonymous count, and it needs every user on the
   * server to mean anything. */
  on("GET", "/admin/groups", async (req, res) => {
    if (!(await needAdmin(req, res, "canAdminUsers"))) return;
    const users = await store.users();
    const groups = await groupsNow();
    return json(res, 200, Object.entries(groups).map(([id, g]) => ({
      id, name: g.name, users: users.filter((u) => groupOf(u) === id).length,
    })));
  });

  const groupName = (x) => {
    const name = tidyName(x);
    return name.length >= 2 && name.length <= 40 && !/[<>]/.test(name) ? name : null;
  };

  on("POST", "/admin/groups", async (req, res) => {
    const me = await needAdmin(req, res, "canAdminUsers");
    if (!me) return;
    const name = groupName((await readBody(req))?.name);
    if (!name) return json(res, 400, { error: "Heiti hóps: 2–40 stafir." });
    const id = "h" + newId().slice(0, 8);
    await store.updateGroups((g) => { g[id] = { name }; return g; });
    await audit(me.id, "bjó til hóp", null, name);
    return json(res, 200, { ok: true, group: { id, name, users: 0 } });
  });

  on("POST", /^\/admin\/groups\/([^/]+)$/, async (req, res, { params }) => {
    const me = await needAdmin(req, res, "canAdminUsers");
    if (!me) return;
    const id = decodeURIComponent(params[0]);
    const name = groupName((await readBody(req))?.name);
    if (!name) return json(res, 400, { error: "Heiti hóps: 2–40 stafir." });
    if (!(await groupsNow())[id]) return json(res, 404, { error: "Hópurinn er ekki til." });
    await store.updateGroups((g) => { g[id] = { ...(g[id] || {}), name }; return g; });
    return json(res, 200, { ok: true });
  });

  on("DELETE", /^\/admin\/groups\/([^/]+)$/, async (req, res, { params }) => {
    const me = await needAdmin(req, res, "canAdminUsers");
    if (!me) return;
    const id = decodeURIComponent(params[0]);
    if (id === DEFAULT_GROUP) return json(res, 400, { error: "Aðalhópnum er ekki eytt." });
    if ((await store.users()).some((u) => groupOf(u) === id))
      return json(res, 400, { error: "Færðu notendurna í annan hóp fyrst." });
    await store.updateGroups((g) => { delete g[id]; return g; });
    await store.updateInvites((list) => list.filter((i) => i.group !== id));
    await store.updateAssignments((list) => {
      const rest = list.filter((a) => a.group !== id);
      return rest.length !== list.length ? rest : null;
    });
    await audit(me.id, "eyddi hópi");
    res.writeHead(204, securityHeaders(req)); res.end();
  });

  /* --- the trail and the backup (v6.3) --- */

  on("GET", "/admin/audit", async (req, res) => {
    if (!(await needAdmin(req, res, "canAdminUsers"))) return;
    return json(res, 200, (await store.audit()).slice(-200).reverse());
  });

  /* Error reports for review (v6.8). The reporter's username comes from the
     user list at read time, so an erased account leaves nothing behind. */
  on("GET", "/admin/reports", async (req, res) => {
    if (!(await needAdmin(req, res, "canAdminUsers"))) return;
    const users = await store.users();
    const name = (id) => { const x = users.find((y) => y.id === id); return x ? (x.username || x.name || id) : "(eyddur aðgangur)"; };
    const list = (await store.reports()).slice().sort((a, b) => b.at - a.at)
      .map((r) => ({ ...r, byName: name(r.by), reviewedByName: r.reviewedBy ? name(r.reviewedBy) : null }));
    return json(res, 200, list);
  });

  on("POST", /^\/admin\/reports\/([A-Za-z0-9_-]{6,40})$/, async (req, res, { params }) => {
    const me = await needAdmin(req, res, "canAdminUsers");
    if (!me) return;
    const body = await readBody(req);
    const status = body?.status != null ? String(body.status) : null;
    if (status && !REPORT_STATUS.has(status)) return json(res, 400, { error: "Óþekkt staða." });
    const adminNote = typeof body?.adminNote === "string" ? body.adminNote.slice(0, 2000) : null;
    let hit = null;
    await store.updateReports((list) => {
      const r = list.find((x) => x.id === params[0]);
      if (!r) return null;
      if (status) r.status = status;
      if (adminNote != null) r.adminNote = adminNote;
      r.reviewedAt = Date.now(); r.reviewedBy = me.id;
      hit = r;
      return list;
    });
    if (!hit) return json(res, 404, { error: "Tilkynningin er ekki til." });
    return json(res, 200, { ok: true, report: hit });
  });

  on("DELETE", /^\/admin\/reports\/([A-Za-z0-9_-]{6,40})$/, async (req, res, { params }) => {
    const me = await needAdmin(req, res, "canAdminUsers");
    if (!me) return;
    let gone = false;
    await store.updateReports((list) => {
      const rest = list.filter((x) => x.id !== params[0]);
      gone = rest.length !== list.length;
      return gone ? rest : null;
    });
    if (!gone) return json(res, 404, { error: "Tilkynningin er ekki til." });
    await audit(me.id, "eyddi villutilkynningu");
    return json(res, 200, { ok: true });
  });

  /* One encrypted file with everything in it (server/backup.mjs). The
     passphrase is chosen here and never stored: the server cannot open its own
     backups, and neither can anybody who finds the file. */
  on("POST", "/admin/backup", async (req, res) => {
    const me = await needAdmin(req, res, "canAdminUsers");
    if (!me) return;
    const pass = String((await readBody(req))?.passphrase || "");
    const problem = passphraseProblem(pass);
    if (problem) return json(res, 400, { error: problem });
    const envelope = await seal(await store.exportAll(), pass);
    await audit(me.id, "tók öryggisafrit");
    return sendFile(res, `fallaskoli-afrit-${dayOf()}.json`, envelope);
  });

  /* --- the data set: ONE button, ONCE ---
     The owner's request, verbatim: one button to upload the data set once and
     see whether it has been done — no API requests per word. Hence one PUT with
     the whole file and one GET with a status. */

  on("GET", "/admin/dataset", async (req, res) => {
    if (!(await needAdmin(req, res, "canUploadData"))) return;
    return json(res, 200, await store.datasetStatus());
  });

  on("PUT", "/admin/dataset", async (req, res) => {
    const me = await needAdmin(req, res, "canUploadData");
    if (!me) return;
    let body;
    try { body = await readBody(req, 64 * 1024 * 1024); }
    catch (e) { return json(res, 400, { error: e.message }); }
    const entries = body?.entries;
    if (!entries || typeof entries !== "object")
      return json(res, 400, { error: "Skráin þarf að hafa reitinn 'entries'." });

    /* Keyed on bin_id, with the lemma as a fallback — the same thing
       core/definitions.js asks for, so homographs get their own definition. */
    const map = {};
    let n = 0;
    for (const [k, v] of Object.entries(entries)) {
      if (!v || typeof v !== "object" || !v.def) continue;
      map[String(k)] = {
        def: String(v.def).slice(0, 600),
        example: v.example ? String(v.example).slice(0, 300) : null,
        source: String(v.source || body.source || "ÍNO").slice(0, 80),
        /* Kept so `/definitions` can refuse to hand a pronoun a verb's
           definition. A file written before tools/ino.mjs recorded it has none,
           and the lemma fallback is then simply not used. */
        cls: typeof v.cls === "string" ? v.cls.slice(0, 8) : null,
      };
      if (v.lemma) map["l:" + String(v.lemma).toLowerCase()] = map[String(k)];
      n += 1;
    }
    if (!n) return json(res, 400, { error: "Engin nothæf færsla í skránni." });

    const status = {
      uploaded: true,
      count: n,
      at: new Date().toISOString(),
      by: me.username,
      name: String(body.name || "gagnasafn").slice(0, 80),
      source: String(body.source || "ÍNO").slice(0, 80),
      sha: crypto.createHash("sha256").update(JSON.stringify(map)).digest("hex").slice(0, 16),
    };
    await store.putDataset(map, status);
    return json(res, 200, status);
  });

  /* --- calibration from real answers, and the answer sample (v6.13) ------
   * Critique items 17 and 38. Everything is in server/calibrate.mjs — who is
   * counted, the caps, the weekly run, the routes — so that this file only
   * lends it the helpers that decide who is logged in and who teaches whom.
   * Routes: GET /calibration, POST /calibration/answers, POST /account/stats,
   * GET+POST /teacher/samples, GET /admin/calibration,
   * GET /admin/classifier/samples.json, DELETE /admin/classifier/samples. */
  const calibration = createCalibration({
    store, env, lex, cellMarks: Object.values(DATA.lex.orders || {}).flat(),
    audit, groupOf, consentOk,
  });
  calibration.routes({ on, json, readBody, needUser, needAdmin, needTeacher, sendFile });

  /* --- retention (v6.3) ---------------------------------------------------
   *
   * Nothing is kept for ever. Two rules, and the privacy notice states both
   * with the same numbers (server/privacy.mjs):
   *
   *   - a request for access nobody answered is erased after `pendingDays`;
   *   - an account nobody has logged in to for `inactiveMonths` is erased,
   *     progress and all. Administrators are exempt — erasing the only person
   *     who can get in would be a strange kind of tidiness.
   *
   * There is no email, so nobody can be warned by the program. The admin page
   * shows who is within sixty days of it, and the administrator is the one who
   * knows the family.
   *
   * No cron: the sweep runs when the server starts and twice a day while it is
   * up, and a machine that sleeps between visits sweeps when it wakes.
   */
  async function sweep(now = new Date()) {
    const today = dayOf(now);
    const erased = [];
    const users = await store.users();
    const stamp = [];
    for (const u of users) {
      const exp = expiryOf(u);
      if (u.role !== "admin" && u.status !== "pending" && !u.lastSeen) { stamp.push(u.id); continue; }
      if (exp && exp <= today)
        erased.push({ id: u.id, why: u.status === "pending" ? "beiðni ósvarað" : "ónotaður aðgangur" });
    }
    /* An account from before v6.3 has no "last seen". It gets today's date
       rather than being judged on a date nobody recorded. */
    if (stamp.length) {
      await store.updateUsers((list) => {
        for (const u of list) if (stamp.includes(u.id) && !u.lastSeen) u.lastSeen = today;
        return list;
      });
    }
    for (const e of erased) {
      await store.eraseUser(e.id);
      forget(e.id);
      await audit("kerfi", "eyddi sjálfkrafa", e.id, e.why);
    }
    /* Used-up and expired invitations, a month after they stopped working. */
    const cut = now.getTime() - 30 * 86400000;
    await store.updateInvites((list) => {
      const keep = list.filter((i) => new Date(i.exp).getTime() > cut);
      return keep.length === list.length ? null : keep;
    });
    await store.updateSessions((s) => {
      let hit = false;
      for (const [k, v] of Object.entries(s)) if (v.exp < now.getTime()) { delete s[k]; hit = true; }
      return hit ? s : null;
    });
    return { erased };
  }

  /* --- health, the privacy notice and the program itself --- */

  /* Health check. `/heilsa` is the original name and stays for anything already
     pointed at it. Counts, not people. */
  on("GET", "/health", async (req, res) => {
    const users = await store.users();
    return json(res, 200, {
      ok: true,
      version: VERSION,
      users: users.length,
      active: users.filter((u) => u.status === "active").length,
      pending: users.filter((u) => u.status === "pending").length,
      dataset: (await store.datasetStatus()).uploaded === true,
      google: google.enabled,
      /* false until FALLASKOLI_CONTROLLER and FALLASKOLI_CONTACT are set: a
         privacy notice with nobody's name on it is not one. */
      privacy: privacy.ready,
    });
  });

  on("GET", "/heilsa", (req, res, ctx) =>
    routes.find((r) => r.pattern === "/health").fn(req, res, ctx));

  const page = (req, res, html, csp) => {
    let buf = Buffer.from(html, "utf8");
    const extra = {};
    if (accepts(req, "gzip")) { buf = zlib.gzipSync(buf); extra["Content-Encoding"] = "gzip"; extra["Vary"] = "Accept-Encoding"; }
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8", "Content-Length": buf.length,
      "Cache-Control": "no-cache", ...securityHeaders(req, csp), ...extra,
    });
    res.end(buf);
  };

  on("GET", "/personuvernd", async (req, res) => page(req, res, privacyPage(privacy), CSP_PAGE));
  on("GET", "/privacy", async (req, res) => {
    res.writeHead(302, { Location: "/personuvernd" }); res.end();
  });

  /* The program is one file of 4.7 MB, almost all of it the vocabulary — text
     that compresses to a fifth. It used to go out whole, uncompressed, on every
     visit. It is now compressed ONCE, when first asked for, and a browser that
     already has this build gets a 304 and nothing else (`ETag`). `no-cache`
     stays: the browser must still ASK, so nobody is left on an old version
     after an upgrade. */
  let appFile = null;
  async function loadApp() {
    const st = await fs.stat(htmlFile);
    const stamp = st.mtimeMs + ":" + st.size;
    if (appFile && appFile.stamp === stamp) return appFile;
    const raw = await fs.readFile(htmlFile);
    appFile = {
      stamp, raw,
      etag: '"' + crypto.createHash("sha256").update(raw).digest("hex").slice(0, 20) + '"',
      gzip: zlib.gzipSync(raw, { level: 9 }),
      br: zlib.brotliCompressSync(raw, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9,
                  [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } }),
    };
    return appFile;
  }

  async function serveApp(req, res) {
    let f;
    try { f = await loadApp(); }
    catch {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Forritsskráin fannst ekki. Keyrðu ./build.sh fyrst.\n" + htmlFile);
    }
    const common = {
      ETag: f.etag, "Cache-Control": "no-cache", Vary: "Accept-Encoding",
      ...securityHeaders(req, CSP_APP),
    };
    if (String(req.headers["if-none-match"] || "").includes(f.etag)) {
      res.writeHead(304, common); return res.end();
    }
    const [body, enc] = accepts(req, "br") ? [f.br, "br"]
      : accepts(req, "gzip") ? [f.gzip, "gzip"] : [f.raw, null];
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8", "Content-Length": body.length,
      ...(enc ? { "Content-Encoding": enc } : {}), ...common,
    });
    res.end(body);
  }

  /* ---------- the request handler ---------- */

  /* A page on another site must not be able to make a logged-in browser change
     anything here. `SameSite=Lax` on the cookie already stops that; this is the
     second lock: a browser says where a writing request came from (`Origin`),
     and one that came from elsewhere is refused before any route sees it. */
  const foreign = (req) => {
    if (env.FALLASKOLI_ORIGIN_CHECK === "0") return false;
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return false;
    const origin = req.headers.origin;
    if (!origin || origin === "null") return false;
    try { return new URL(origin).host !== req.headers.host; } catch { return true; }
  };

  const handler = async (req, res) => {
    const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
    if (foreign(req)) return json(res, 403, { error: "Beiðnin kom annars staðar frá." });
    for (const r of routes) {
      if (r.method !== req.method) continue;
      if (typeof r.pattern === "string") {
        if (r.pattern === url.pathname) return r.fn(req, res, { url, params: [] });
      } else {
        const m = url.pathname.match(r.pattern);
        if (m) return r.fn(req, res, { url, params: m.slice(1) });
      }
    }
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html"))
      return serveApp(req, res);
    if (req.method === "GET" && url.pathname === "/favicon.ico") {
      res.writeHead(204, { "Cache-Control": "max-age=86400" }); return res.end();
    }
    return json(res, 404, { error: "Engin slík slóð." });
  };

  const server = http.createServer((req, res) => {
    handler(req, res).catch((e) => {
      /* What the user can act on goes to the user; everything else goes to the
         log, because it can contain paths and internal detail. */
      if (e && e.expose && !res.headersSent)
        /* No "Connection: close" on a 413: readBody keeps draining the upload so
           the answer can be delivered, and closing the socket under a client that
           is still writing turns the 413 into ECONNRESET (macOS: errno -54). */
        return json(res, e.status || 400, { error: e.message });
      console.error("villa:", req.method, req.url, e && e.message);
      if (!res.headersSent) json(res, 500, { error: "Eitthvað fór úrskeiðis á þjóninum." });
      else res.end();
    });
  });
  /* Slow requests are cut off rather than held open for ever. */
  server.requestTimeout = 60000;
  server.headersTimeout = 20000;

  /* A live round's event streams never end by themselves, and `close` waits
     for every connection: they are ended first (server/live.mjs). */
  const closeServer = server.close.bind(server);
  server.close = (cb) => { live.stop(); return closeServer(cb); };

  return { server, store, handler, lex, google, privacy, sweep, calibration, live };
}

/* ---------- start-up when this file is run directly ---------- */

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const port = Number(process.env.PORT || 8080);
  const dataDir = process.env.FALLASKOLI_DATA || path.join(HERE, "data");
  const ranAs = await dropPrivileges(dataDir);
  const app = createApp({ dataDir });
  await app.store.init();
  const users = await app.store.users();
  /* FALLASKOLI_HOST picks the network address to listen on. Unset = every
     address (as before). `127.0.0.1` = this computer only, which is what
     test-together.sh uses behind a tunnel so nobody can go around it. */
  const host = process.env.FALLASKOLI_HOST || undefined;
  app.server.listen(port, host, () => {
    console.log(`Fallaskóli ${VERSION} þjónar á http://localhost:${port}`);
    console.log(`  notendur: ${users.length}   Google: ${app.google.enabled ? "já" : "nei"}   gögn: ${dataDir}`);
    if (ranAs) console.log(`  keyrir sem notandi ${ranAs}, ekki root`);
    else if (typeof process.getuid === "function" && process.getuid() === 0)
      console.log("  ATH: keyrir sem root. Settu FALLASKOLI_UID (sjá docs/HOSTING.md).");
    if (!app.privacy.ready) {
      console.log("");
      console.log("  ATH: persónuverndaryfirlýsingin er ómerkt. Settu FALLASKOLI_CONTROLLER");
      console.log("       og FALLASKOLI_CONTACT áður en nokkrum er hleypt inn.");
    }
    if (!users.length) {
      console.log("");
      console.log("  Enginn notandi er til. Búðu til umsjónarreikning:");
      console.log("    node server/admin.mjs nyr <notandanafn> --umsjon");
    }
  });

  const tidy = () => app.sweep().then((r) => {
    if (r.erased.length) console.log(`  varðveisla: ${r.erased.length} aðgangi/aðgöngum eytt`);
  }).catch((e) => console.error("varðveisla:", e.message));
  /* The calibration table is worked out again when a week has passed
     (server/calibrate.mjs `run` — it does nothing when it is not due). It
     also runs when a browser asks for the table; this is for a server
     nobody visits for a while. */
  const calibrate = () => app.calibration.run().then((r) => {
    if (r && r.changes.length) console.log(`  kvörðun: ${r.changes.length} gildi breyttust`);
  }).catch((e) => console.error("kvörðun:", e.message));
  tidy(); calibrate();
  setInterval(() => { tidy(); calibrate(); }, 12 * 3600000).unref();

  /* Asked to stop (a deploy, a machine going to sleep): finish what is being
     answered, then go. Every write is already atomic, so this is courtesy. */
  const stop = () => { app.server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
