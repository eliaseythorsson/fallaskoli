/* The server's storage — ordinary JSON files on disk.
 *
 * Why not a database: the owner does not write code and should not have to
 * install Postgres, maintain it and back it up so that a few families can
 * practise Icelandic. Files in one folder can be backed up by copying the
 * folder, and that is a backup plan he can actually carry out.
 *
 * When that stops being enough (well past a hundred users), THIS file is the
 * one to replace and no other — everything the server does with data passes
 * through here. The natural next step is `node:sqlite`, which ships with Node.
 *
 * Writes are **atomic**: written to a temporary file and then renamed over the
 * real one. If the power fails mid-write, the old file is left intact rather
 * than a half-written one.
 *
 * v6.3 adds three things:
 *
 *   - **A cache.** Every leaderboard, roster and rarity request used to read
 *     every child's file from disk. The states now live in memory after the
 *     first read and are written through; this process is the only writer of
 *     them. `users.json` and `sessions.json` are cached too, but checked
 *     against the file's timestamp on every read, because `admin.mjs` edits
 *     them from another process.
 *   - **Revisions.** A state is stored as `{ rev, at, state }` and a write may
 *     say which revision it was based on. That is what stops a stale device
 *     overwriting a fresh one — see `putState` and core/merge.js.
 *   - **One erasure.** `eraseUser` removes a person from every file at once, so
 *     "delete" means the same thing whoever asks for it.
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

export function createStore(root) {
  const dir = {
    root,
    states: path.join(root, "states"),
    tmp: path.join(root, "tmp"),
  };
  const file = {
    users: path.join(root, "users.json"),
    sessions: path.join(root, "sessions.json"),
    dataset: path.join(root, "dataset.json"),
    datasetStatus: path.join(root, "dataset-status.json"),
    hidden: path.join(root, "hidden.json"),
    policies: path.join(root, "policies.json"),
    rarity: path.join(root, "rarity-history.json"),
    invites: path.join(root, "invites.json"),
    groups: path.join(root, "groups.json"),
    audit: path.join(root, "audit.json"),
    duels: path.join(root, "duels.json"),
    reports: path.join(root, "reports.json"),
    assignments: path.join(root, "assignments.json"),
    calibration: path.join(root, "calibration.json"),
    calibrationQuota: path.join(root, "calibration-quota.json"),
    samples: path.join(root, "samples.json"),
  };

  /* One queue for every write. Node is single-threaded, but `await` gives other
     requests a chance to slip in between — two simultaneous users could
     otherwise read the same file, edit their own copy and both write, and the
     second write would erase the first. */
  let queue = Promise.resolve();
  const serial = (fn) => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
  };

  async function readJSON(p, fallback) {
    try { return JSON.parse(await fs.readFile(p, "utf8")); }
    catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
  }

  async function writeJSON(p, value) {
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.mkdir(dir.tmp, { recursive: true });
    const tmp = path.join(dir.tmp, crypto.randomBytes(8).toString("hex") + ".json");
    await fs.writeFile(tmp, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
    await fs.rename(tmp, p);
  }

  /* A small file kept in memory and re-read only when its timestamp moves. */
  function cached(p, fallback) {
    let stamp = null, value = null;
    const stat = async () => {
      try { const s = await fs.stat(p); return s.mtimeMs + ":" + s.size; }
      catch { return "none"; }
    };
    return {
      async read() {
        const now = await stat();
        if (now !== stamp) { value = await readJSON(p, clone(fallback)); stamp = now; }
        return clone(value);
      },
      async write(next) {
        await writeJSON(p, next);
        value = clone(next);
        stamp = await stat();
      },
      update(fn) {
        return serial(async () => {
          const cur = await this.read();
          const next = await fn(cur);
          if (next) await this.write(next);
          return next;
        });
      },
    };
  }

  const usersFile = cached(file.users, []);
  const sessionsFile = cached(file.sessions, {});
  const smallFile = (p, fallback) => ({
    read: () => readJSON(p, clone(fallback)),
    update: (fn) => serial(async () => {
      const cur = await readJSON(p, clone(fallback));
      const next = await fn(cur);
      if (next) await writeJSON(p, next);
      return next;
    }),
  });
  const policiesFile = smallFile(file.policies, {});
  const invitesFile = smallFile(file.invites, []);
  const groupsFile = smallFile(file.groups, {});
  const auditFile = smallFile(file.audit, []);
  const duelsFile = smallFile(file.duels, []);
  const reportsFile = smallFile(file.reports, []);
  const assignmentsFile = smallFile(file.assignments, []);
  const calibrationFile = smallFile(file.calibration, {});
  const quotaFile = smallFile(file.calibrationQuota, {});
  const samplesFile = smallFile(file.samples, { list: [], seen: 0 });

  const safeId = (id) => /^[a-zA-Z0-9_-]{1,64}$/.test(String(id));
  const statePath = (id) => path.join(dir.states, id + ".json");

  /* ---------- the states, in memory ---------- */

  /** A file written before v6.3 is the bare state; it counts as revision 0. */
  const unwrap = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    if (typeof raw.rev === "number" && raw.state && typeof raw.state === "object")
      return { rev: raw.rev, at: raw.at || null, state: raw.state };
    return { rev: 0, at: null, state: raw };
  };

  let states = null;            // Map id -> { rev, at, state } once loaded
  let loading = null;
  async function loadStates() {
    if (states) return states;
    loading ||= (async () => {
      const m = new Map();
      let names = [];
      try { names = await fs.readdir(dir.states); } catch { /* no folder yet */ }
      for (const n of names.filter((x) => x.endsWith(".json"))) {
        const rec = unwrap(await readJSON(path.join(dir.states, n), null));
        if (rec) m.set(n.replace(/\.json$/, ""), deepFreeze(rec));
      }
      states = m;
      return m;
    })();
    return loading;
  }

  const store = {
    dir, file,

    async init() {
      await fs.mkdir(dir.states, { recursive: true });
      await fs.mkdir(dir.tmp, { recursive: true });
    },

    /** Forget everything held in memory — after a restore, and in tests. */
    forget() { states = null; loading = null; },

    /* ---------- users ---------- */
    users: () => usersFile.read(),
    saveUsers: (list) => serial(() => usersFile.write(list)),
    /** Read-modify-write in one go, so two requests cannot tread on each other. */
    updateUsers: (fn) => usersFile.update(fn),

    /* ---------- sessions (keyed on the HASH of the token) ---------- */
    sessions: () => sessionsFile.read(),
    updateSessions: (fn) => sessionsFile.update(fn),

    /* ---------- the children's state ---------- */
    async stateRec(id) {
      if (!safeId(id)) return null;
      return (await loadStates()).get(String(id)) || null;
    },
    async state(id) {
      const rec = await this.stateRec(id);
      return rec ? rec.state : null;
    },
    /**
     * Write a state. With `expectRev`, the write only happens if the stored
     * revision is still that one; otherwise nothing is written and the caller
     * gets what IS stored, to merge with (core/merge.js).
     * @returns {{ok:true, rev:number} | {ok:false, rev:number, state:object}}
     */
    async putState(id, value, { expectRev = null } = {}) {
      if (!safeId(id)) throw new Error("ógilt auðkenni");
      return serial(async () => {
        const m = await loadStates();
        const cur = m.get(String(id)) || null;
        const curRev = cur ? cur.rev : 0;
        if (expectRev != null && cur && Number(expectRev) !== curRev)
          return { ok: false, rev: curRev, state: cur.state };
        const rec = { rev: curRev + 1, at: new Date().toISOString(), state: value };
        await writeJSON(statePath(id), rec);
        m.set(String(id), deepFreeze(clone(rec)));
        return { ok: true, rev: rec.rev };
      });
    },
    async deleteState(id) {
      if (!safeId(id)) return;
      await serial(async () => {
        await fs.rm(statePath(id), { force: true });
        (await loadStates()).delete(String(id));
      });
    },
    /** Every state, from memory. The objects are frozen: read, never edit. */
    async allStates() {
      return [...(await loadStates())].map(([id, rec]) => ({ id, state: rec.state, rev: rec.rev }));
    },

    /* ---------- the data set (ÍNO and the like) ---------- */
    dataset: () => readJSON(file.dataset, null),
    datasetStatus: () => readJSON(file.datasetStatus, { uploaded: false }),
    putDataset(map, status) {
      return serial(async () => {
        await writeJSON(file.dataset, map);
        await writeJSON(file.datasetStatus, status);
      });
    },

    /* ---------- the curriculum ceiling (core/policy.js) ----------
     * One small file rather than a field on each user: the DEFAULT lives here
     * too, under the key `*`. `{ "*": {...}, "<userId>": {...} }`. */
    policies: () => policiesFile.read(),
    updatePolicies: (fn) => policiesFile.update(fn),

    /* ---------- leaderboard: names the administrator took off it ---------- */
    hidden: () => readJSON(file.hidden, []),
    setHidden: (list) => serial(() => writeJSON(file.hidden, list)),

    /* ---------- invitations and groups (v6.3) ---------- */
    invites: () => invitesFile.read(),
    updateInvites: (fn) => invitesFile.update(fn),
    groups: () => groupsFile.read(),
    updateGroups: (fn) => groupsFile.update(fn),

    /* ---------- the audit trail ----------
     * Who did what to whom, as ids. Never a child's name: after an erasure
     * this file must not be the place the name survives. */
    audit: () => auditFile.read(),
    appendAudit(entry, keep = 2000) {
      return auditFile.update((list) =>
        [...list, { at: new Date().toISOString(), ...entry }].slice(-keep));
    },

    /* ---------- duels (v6.7, core/duel.js) ---------- */
    duels: () => duelsFile.read(),
    updateDuels: (fn) => duelsFile.update(fn),

    /* ---------- error reports (v6.8, ui/reports.js) ---------- */
    reports: () => reportsFile.read(),
    updateReports: (fn) => reportsFile.update(fn),

    /* ---------- assignments (v6.13, core/assignment.js) ----------
     * Homework a teacher set for a group, with each pupil's result in it as
     * numbers. Pruned on every read and write (`prune`), so an assignment
     * is gone 30 days after its deadline without a job to run. */
    assignments: () => assignmentsFile.read(),
    updateAssignments: (fn) => assignmentsFile.update(fn),

    /* ---------- calibration and the answer sample (v6.13, server/calibrate.mjs) ----------
     * Three files, and the difference between them is the point:
     *
     *   calibration.json        ANONYMOUS. Counts of right and wrong answers
     *                           per question type, level, cell and
     *                           irregularity score; the published table; the
     *                           log of what each run changed. No user id, no
     *                           group, no time of an answer. Part of a backup.
     *   samples.json            ANONYMOUS. A bounded sample of wrong word
     *                           forms, kept only for groups whose teacher
     *                           switched it on. No id, no group; the month.
     *                           Part of a backup.
     *   calibration-quota.json  PERSONAL, for one day: how much each account
     *                           has contributed TODAY, so that the caps can
     *                           be held. It is replaced when the day changes,
     *                           an erased account is taken out of it at once
     *                           (`eraseUser`), and it is NOT part of a backup.
     */
    calibration: () => calibrationFile.read(),
    updateCalibration: (fn) => calibrationFile.update(fn),
    calibrationQuota: () => quotaFile.read(),
    updateCalibrationQuota: (fn) => quotaFile.update(fn),
    samples: () => samplesFile.read(),
    updateSamples: (fn) => samplesFile.update(fn),

    /* ---------- the monthly rarity snapshot ---------- */
    rarityHistory: () => readJSON(file.rarity, []),
    appendRarity(entry, keep = 24) {
      return serial(async () => {
        const list = await readJSON(file.rarity, []);
        const rest = list.filter((x) => x.month !== entry.month);
        const next = [...rest, entry].sort((a, b) => (a.month < b.month ? -1 : 1))
          .slice(-keep);
        await writeJSON(file.rarity, next);
        return next;
      });
    },

    /* ---------- erasure ----------
     * Everything that names one person, in every file. What is left afterwards
     * is the anonymous monthly rarity count, the audit line saying an erasure
     * happened, the anonymous calibration counts and answer sample, and
     * whatever backups have not yet expired (docs/PRIVACY.md). */
    async eraseUser(id) {
      const uid = String(id);
      let existed = false;
      await this.updateUsers((users) => {
        existed = users.some((u) => u.id === uid);
        return existed ? users.filter((u) => u.id !== uid) : null;
      });
      await this.deleteState(uid);
      await this.updatePolicies((p) => { if (!(uid in p)) return null; delete p[uid]; return p; });
      await this.updateSessions((s) => {
        let hit = false;
        for (const [k, v] of Object.entries(s)) if (v.userId === uid) { delete s[k]; hit = true; }
        return hit ? s : null;
      });
      await this.updateDuels((list) => {
        const rest = list.filter((d) => d.a !== uid && d.b !== uid);
        return rest.length !== list.length ? rest : null;
      });
      await this.updateReports((list) => {
        const rest = list.filter((r) => r.by !== uid);
        return rest.length !== list.length ? rest : null;
      });
      /* Their results go; an assignment they set stays with the group (the
         class is still doing it), without the name of who set it. */
      await this.updateAssignments((list) => {
        let hit = false;
        for (const a of list) {
          if (a.res && uid in a.res) { delete a.res[uid]; hit = true; }
          if (a.by === uid) { a.by = null; hit = true; }
        }
        return hit ? list : null;
      });
      /* Today's contribution count (calibration). The counts themselves and
         the answer sample carry no id and cannot be traced back: they stay. */
      await this.updateCalibrationQuota((q) => {
        if (!q.by || !(uid in q.by)) return null;
        delete q.by[uid]; return q;
      });
      const hidden = await this.hidden();
      if (hidden.includes(uid)) await this.setHidden(hidden.filter((x) => x !== uid));
      await this.updateInvites((list) => {
        let hit = false;
        for (const inv of list) {
          if ((inv.usedBy || []).includes(uid)) {
            inv.usedBy = inv.usedBy.filter((x) => x !== uid); hit = true;
          }
        }
        return hit ? list : null;
      });
      return existed;
    },

    /* ---------- backup: everything, as one object ---------- */
    async exportAll() {
      const st = {};
      for (const [id, rec] of await loadStates()) st[id] = rec;
      return {
        v: 1, at: new Date().toISOString(),
        users: await this.users(), policies: await this.policies(),
        hidden: await this.hidden(), invites: await this.invites(),
        groups: await this.groups(), audit: await this.audit(),
        rarity: await this.rarityHistory(), duels: await this.duels(),
        reports: await this.reports(), assignments: await this.assignments(),
        calibration: await this.calibration(), samples: await this.samples(),
        dataset: await this.dataset(), datasetStatus: await this.datasetStatus(),
        states: st,
      };
    },
    /** Replace the data folder's contents with a backup. Sessions are dropped:
        everybody logs in again, which is the right outcome of a restore. */
    async importAll(all) {
      if (!all || all.v !== 1 || !Array.isArray(all.users)) throw new Error("ógilt afrit");
      await this.init();
      await serial(async () => {
        await usersFile.write(all.users);
        await sessionsFile.write({});
        await writeJSON(file.policies, all.policies || {});
        await writeJSON(file.hidden, all.hidden || []);
        await writeJSON(file.invites, all.invites || []);
        await writeJSON(file.groups, all.groups || {});
        await writeJSON(file.audit, all.audit || []);
        await writeJSON(file.rarity, all.rarity || []);
        await writeJSON(file.duels, all.duels || []);
        await writeJSON(file.reports, all.reports || []);
        await writeJSON(file.assignments, all.assignments || []);
        await writeJSON(file.calibration, all.calibration || {});
        await writeJSON(file.samples, all.samples || { list: [], seen: 0 });
        await fs.rm(file.calibrationQuota, { force: true });
        if (all.dataset) await writeJSON(file.dataset, all.dataset);
        if (all.datasetStatus) await writeJSON(file.datasetStatus, all.datasetStatus);
        for (const n of await fs.readdir(dir.states).catch(() => []))
          await fs.rm(path.join(dir.states, n), { force: true });
        for (const [id, rec] of Object.entries(all.states || {}))
          if (safeId(id)) await writeJSON(statePath(id), rec);
      });
      this.forget();
      return { users: all.users.length, states: Object.keys(all.states || {}).length };
    },
  };
  return store;
}
