/* The server, as the program sees it.
 *
 * One module knows the server exists. Everything else asks this module or
 * knows nothing at all.
 *
 * Whether a server exists is not configured, it is discovered: opened from a
 * file (`file:`) there is none; served over http(s) the program asks the
 * origin that sent it. A Fallaskóli server answers `/auth/me` with JSON (200
 * when logged in, 401 when not). A plain web host — a hosted page, a static
 * site — answers with a 404 page or nothing, and the program then runs as it
 * does from a file: one child, this browser, local storage.
 */

import { mergeStates } from "./merge.js";

export const serverMode = () =>
  typeof location !== "undefined" && /^https?:$/.test(location.protocol);

export function createServer(base = "", { fetchImpl = globalThis.fetch } = {}) {
  const url = (p) => `${String(base).replace(/\/$/, "")}${p}`;

  /** One request. Returns `{ data, rev }`; `rev` is the state's revision when
      the server sent one (`X-State-Rev`), otherwise null. */
  async function send(method, p, body, headers = null) {
    const h = { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(headers || {}) };
    const r = await fetchImpl(url(p), {
      method,
      /* The access token lives in an HttpOnly cookie that javascript cannot
         reach. `credentials: "include"` is all that is needed — and all that is
         allowed. */
      credentials: "include",
      headers: Object.keys(h).length ? h : undefined,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (r.status === 204) return { data: null, rev: null };
    const data = await r.json().catch(() => null);
    const raw = r.headers && r.headers.get ? r.headers.get("x-state-rev") : null;
    const rev = raw == null || raw === "" ? null : Number(raw);
    if (!r.ok) {
      throw Object.assign(new Error((data && data.error) || "Villa " + r.status),
        { status: r.status, data, rev });
    }
    return { data, rev };
  }
  const call = async (method, p, body) => (await send(method, p, body)).data;
  const enc = encodeURIComponent;

  return {
    name: "server",

    /* --- authentication --- */
    me: () => call("GET", "/auth/me").catch(() => null),

    /** Is there a Fallaskóli server at this origin, and who am I to it?
        `{ server: false }` means "run without one". */
    async probe() {
      let r;
      try {
        r = await fetchImpl(url("/auth/me"), { credentials: "include" });
      } catch { return { server: false }; }
      const type = r.headers && r.headers.get ? (r.headers.get("content-type") || "") : "";
      if (!type.includes("application/json")) return { server: false };
      const data = await r.json().catch(() => null);
      if (r.ok && data && data.profile) return { server: true, me: data };
      if (r.status === 401) return { server: true, me: null };
      return { server: false };
    },
    login: (username, password) => call("POST", "/auth/login", { username, password }),
    /** `form`: { username, password, name, invite, over16, guardian, consent }. */
    register: (form) => call("POST", "/auth/register", form),
    logout: () => call("POST", "/auth/logout", {}),
    googleUrl: () => url("/auth/google"),
    /** What the login card needs before anybody is logged in. */
    config: () => call("GET", "/auth/config").catch(() => null),
    privacyUrl: () => url("/personuvernd"),

    /* --- state ---
       A state travels with its REVISION (v6.3). Writing sends the revision the
       device last saw; if the server has moved on it answers 409 with what it
       holds, and `serverDriver` below merges and tries again. */
    async getStateRec(id) {
      try {
        const { data, rev } = await send("GET", `/state/${enc(id)}`);
        return { state: data, rev: rev ?? 0 };
      } catch (e) { if (e.status === 404) return null; throw e; }
    },
    async getState(id) { const rec = await this.getStateRec(id); return rec ? rec.state : null; },
    async putState(id, state, rev = null) {
      const { data, rev: now } = await send("PUT", `/state/${enc(id)}`, state,
        rev == null ? null : { "If-Match": `"${rev}"` });
      return { ok: true, rev: now ?? (data && data.rev) ?? null };
    },

    /* --- my own account (v6.3) --- */
    account: () => call("GET", "/account"),
    setName: (name) => call("POST", "/account/name", { name }),
    setPassword: (current, password) => call("POST", "/account/password", { current, password }),
    setShare: (share) => call("POST", "/account/share", share),
    deleteAccount: (proof) => call("POST", "/account/delete", proof),
    exportUrl: () => url("/account/export"),

    /* --- what only a server can answer --- */
    leaderboard: (metric = "framfarir") => call("GET", `/leaderboard?metric=${encodeURIComponent(metric)}`),
    badgeStats: () => call("GET", "/badges/stats"),
    roster: () => call("GET", "/roster"),
    social: () => call("GET", "/social"),
    /* --- duels (v6.7) --- */
    duels: () => call("GET", "/duels"),
    challenge: (opponent, topic, n) => call("POST", "/duels", { opponent, topic, n }),
    /* v6.13: the seeds come when the pupil presses play, and what goes back
       is the answers — the server grades them (core/duel.js). */
    duelStart: (id) => call("POST", `/duels/${enc(id)}/start`),
    duelResult: (id, answers, sig) => call("POST", `/duels/${enc(id)}/result`, { answers, sig }),
    /* --- assignments and the class's patterns (v6.13, items 37 and 65) ---
       The pupil's side first; the rest is the teacher's (guardian or
       administrator), and the server holds it to their own group. */
    assignments: () => call("GET", "/assignments"),
    assignmentResult: (id, r) => call("POST", `/assignments/${enc(id)}/result`, r),
    teacherGroups: () => call("GET", "/teacher/groups"),
    classPatterns: (group) => call("GET", `/teacher/patterns?group=${enc(group)}`),
    classPatternsCsvUrl: (group) => url(`/teacher/patterns.csv?group=${enc(group)}`),
    teacherAssignments: (group) => call("GET", `/teacher/assignments?group=${enc(group)}`),
    setAssignment: (form) => call("POST", "/teacher/assignments", form),
    removeAssignment: (id) => call("DELETE", `/teacher/assignments/${enc(id)}`),
    /* --- calibration and the answer sample (v6.13, items 17 and 38) ---
       `calibration()` is asked once per load: the table to apply, and
       whether this account's answers are counted at all. */
    calibration: () => call("GET", "/calibration"),
    sendAnswers: (batch) => call("POST", "/calibration/answers", batch),
    setStats: (on) => call("POST", "/account/stats", { on }),
    teacherSamples: (group) => call("GET", `/teacher/samples?group=${enc(group)}`),
    setTeacherSamples: (group, on) => call("POST", "/teacher/samples", { group, on }),
    calibrationReport: () => call("GET", "/admin/calibration"),
    samplesUrl: () => url("/admin/classifier/samples.json"),
    clearSamples: () => call("DELETE", "/admin/classifier/samples"),
    /* error reports (v6.8) */
    sendReport: (report) => call("POST", "/reports", report),
    reports: () => call("GET", "/admin/reports"),
    setReport: (id, patch) => call("POST", `/admin/reports/${enc(id)}`, patch),
    removeReport: (id) => call("DELETE", `/admin/reports/${enc(id)}`),

    /* --- administration --- */
    users: () => call("GET", "/admin/users"),
    setUser: (id, patch) => call("POST", `/admin/users/${enc(id)}`, patch),
    removeUser: (id) => call("DELETE", `/admin/users/${enc(id)}`),
    createUser: (form) => call("POST", "/admin/users", form),
    resetPassword: (id) => call("POST", `/admin/users/${enc(id)}/password`, {}),
    userExportUrl: (id) => url(`/admin/users/${enc(id)}/export`),
    invites: () => call("GET", "/admin/invites"),
    createInvite: (form) => call("POST", "/admin/invites", form),
    removeInvite: (id) => call("DELETE", `/admin/invites/${enc(id)}`),
    groups: () => call("GET", "/admin/groups"),
    createGroup: (name) => call("POST", "/admin/groups", { name }),
    renameGroup: (id, name) => call("POST", `/admin/groups/${enc(id)}`, { name }),
    removeGroup: (id) => call("DELETE", `/admin/groups/${enc(id)}`),
    audit: () => call("GET", "/admin/audit"),
    backup: (passphrase) => call("POST", "/admin/backup", { passphrase }),
    datasetStatus: () => call("GET", "/admin/dataset"),
    putDataset: (payload) => call("PUT", "/admin/dataset", payload),
    hiddenBoard: () => call("GET", "/admin/leaderboard"),
    setHiddenBoard: (hidden) => call("POST", "/admin/leaderboard", { hidden }),

    /* --- the curriculum ceiling (core/policy.js) ---
       `policy(null)` on a user removes their own ceiling and hands them back to
       the default; that is why the value is sent rather than the route
       changing. */
    defaultPolicy: () => call("GET", "/admin/policy"),
    setDefaultPolicy: (policy) => call("PUT", "/admin/policy", { policy }),
    userPolicy: (id) => call("GET", `/admin/users/${encodeURIComponent(id)}/policy`),
    setUserPolicy: (id, policy) =>
      call("PUT", `/admin/users/${encodeURIComponent(id)}/policy`, { policy }),

    /** The ceiling that applies to ME. Every logged-in user may ask. */
    myPolicy: () => call("GET", "/policy"),
  };
}

/**
 * A storage back end that writes to the server.
 *
 * It lives here rather than in the storage layer because it needs the key from
 * `/auth/me`: the user's id, not a name the program picks for itself.
 *
 * v6.3 — it no longer overwrites. It remembers the revision and the content
 * the server last agreed to (`base`). When a write is refused because another
 * device got there first, it merges three ways (core/merge.js), writes the
 * result, and tells the program through `onMerged(merged, sent)` so the
 * screen can catch up with what the other device did.
 */
export function serverDriver(server, { merge = mergeStates, onMerged = null } = {}) {
  let rev = null, base = null;
  const snap = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));
  return {
    name: "server",
    /** Tell the driver what the server holds, when it was fetched elsewhere. */
    prime(state, r) { base = snap(state); rev = r ?? null; },
    async get(key) {
      const rec = await server.getStateRec(key);
      if (!rec) { base = null; rev = null; return null; }
      base = snap(rec.state); rev = rec.rev;
      return rec.state;
    },
    async set(key, value) {
      const sent = snap(value);
      let next = sent, merged = false;
      /* A handful of tries: each one loses only to a write that landed in the
         same moment, and two devices do not keep that up. */
      for (let i = 0; i < 4; i++) {
        try {
          const r = await server.putState(key, next, rev);
          rev = r.rev; base = next;
          if (merged && onMerged) onMerged(next, sent);
          return true;
        } catch (e) {
          const theirs = e && e.status === 409 && e.data ? e.data.state : null;
          if (!theirs) return false;
          next = merge(base, next, theirs);
          base = snap(theirs); rev = e.data.rev;
          merged = true;
        }
      }
      return false;
    },
    async remove() { /* progress is never deleted from the server by the app */ },
  };
}

/**
 * Lifting local progress onto the server, the first time the child logs in.
 *
 *   - No state on the server and something stored locally -> it goes up.
 *   - Something on the server -> that wins, and the local copy is NOT deleted.
 *     It stays in the browser as a backup.
 *
 * The two are not merged: progress made in a file before there was an account
 * has no common past with the account, and adding two unrelated histories
 * together would double-count. (Two devices on the SAME account do have a
 * common past, and those are merged — `serverDriver` above.)
 */
export async function liftLocalState(server, profileId, localState) {
  const remote = await server.getStateRec(profileId);
  if (remote) return { state: remote.state, rev: remote.rev, lifted: false };
  if (!localState || !(localState.xp > 0 || Object.keys(localState.badges || {}).length))
    return { state: null, rev: null, lifted: false };
  const r = await server.putState(profileId, localState);
  return { state: localState, rev: r.rev, lifted: true };
}
