/* The second-language mode, set by the teacher (v6.13, critique item 45).
 *
 * What the mode does is src/js/core/profile.js. A pupil can switch it on
 * themselves under Stillingar; these routes let the group's teacher switch
 * it on for a pupil, which matters most for the pupils who would not think
 * to look. Kept apart from server.mjs, which lends the helpers (as
 * classgoal.mjs and calibrate.mjs).
 *
 *   GET  /teacher/secondlanguage?group=g   the group's active learners and
 *                                          whether the mode is on for each
 *   POST /teacher/secondlanguage           { group, user, on } — set it
 *
 * WHO: `needTeacher`, the one check every teacher route uses — the guardian
 * of the group, or the administrator. The pupil must be an active learner
 * IN that group: a teacher cannot reach another group's pupil by id.
 *
 * WHERE: one boolean on the account, `l2`, sent back to the pupil in
 * /auth/me as `profile.secondLanguage` (server.mjs `publicUser`); the app
 * copies it into the state at start-up. It is part of what the account
 * holds, so it is in the pupil's own export and goes with the account.
 * Setting it is written to the audit trail, by id. */

const byName = (a, b) => a.name.localeCompare(b.name, "is");

export function createSecondLanguage({ store, groupOf, audit }) {
  const learnersOf = async (group) => (await store.users()).filter((u) =>
    u.role === "learner" && u.status === "active" && groupOf(u) === group);

  function routes({ on, json, readBody, needTeacher }) {
    on("GET", "/teacher/secondlanguage", async (req, res, { url }) => {
      const t = await needTeacher(req, res, url.searchParams.get("group"));
      if (!t) return;
      const pupils = (await learnersOf(t.group))
        .map((u) => ({ id: u.id, name: u.name || u.username, on: u.l2 === true }))
        .sort(byName);
      return json(res, 200, { group: { id: t.group, name: t.name }, pupils });
    });

    on("POST", "/teacher/secondlanguage", async (req, res) => {
      const body = await readBody(req, 1024);
      const t = await needTeacher(req, res, body && body.group);
      if (!t) return;
      const id = String((body && body.user) || "");
      if (typeof (body && body.on) !== "boolean")
        return json(res, 400, { error: "Segðu hvort á að kveikja eða slökkva." });
      let found = false;
      await store.updateUsers((users) => {
        const u = users.find((x) => x.id === id && x.role === "learner" &&
          x.status === "active" && groupOf(x) === t.group);
        if (!u) return null;
        found = true;
        if (body.on) u.l2 = true; else delete u.l2;
        return users;
      });
      /* The same answer for "no such pupil" and "not your pupil": a teacher
         learns nothing about ids outside their own group. */
      if (!found) return json(res, 404, { error: "Nemandinn er ekki í hópnum." });
      await audit(t.me.id, body.on ? "kveikti á íslensku sem öðru máli" : "slökkti á íslensku sem öðru máli", id);
      return json(res, 200, { ok: true, user: id, on: body.on });
    });
  }

  return { routes };
}
