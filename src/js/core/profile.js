/* Users, rights and the two meta badges.
 *
 * Passwords are never stored in the browser: the access token arrives in an
 * HttpOnly cookie. What lives here is the rights table, the permission check
 * the server shares, the crest, and the password rule. */

import { thisDevice } from "./slicerules.js";

/* Rights are enumerated, not derived from the role's name — so administrator
   rights cannot be obtained by choosing a clever name. */
export const ROLES = {
  learner: {
    canSeeOthers: true,           // sees others' badges
    canSeeOtherAnswers: false,    // never, whatever the role
    canEditCurriculum: false, canAdminUsers: false,
    canUploadData: false, canEditLeaderboard: false,
    canTeach: false,
  },
  /* The group's own adult: a parent for a family, a teacher for a class.
     `canTeach` (v6.13, items 37 and 65): sees the error patterns of the
     learners in their OWN group and sets them assignments. The server holds
     it to the group (server/server.mjs `needTeacher`). */
  guardian: {
    canSeeOthers: true, canSeeOtherAnswers: false, canEditCurriculum: true,
    canAdminUsers: false, canUploadData: false, canEditLeaderboard: false,
    canTeach: true,
  },
  /* One account. The server enforces that only one exists. */
  admin: {
    canSeeOthers: true, canSeeOtherAnswers: false, canEditCurriculum: true,
    canAdminUsers: true, canUploadData: true, canEditLeaderboard: true,
    canTeach: true,             // any group: the administrator runs them all
  },
};

/** The single permission check; server/server.mjs imports it too. */
export const can = (profile, right) =>
  !!(ROLES[profile?.role || "learner"] || {})[right];

/**
 * The two meta badges, read out of the badges themselves.
 *
 * `all_badges` (every other badge) turns the name gold, and that follows the
 * user into the leaderboard. `all_badges_words` (every badge *and* every word)
 * gives a crown. Computed here rather than stored, so it cannot fall out of step
 * with the badges when progress moves between devices.
 */
export function crestOf(S) {
  const b = (S && S.badges) || {};
  const legendary = !!b.all_badges;
  const crown = !!b.all_badges_words;
  return {
    legendary: legendary || crown,
    crown,
    crest: crown ? "crown" : legendary ? "legendary" : null,
  };
}

/** The password rule, applied before anything is sent. The server has to check
    this too; here it is a courtesy to the user, not a defence. */
export function passwordProblem(pw) {
  const s = String(pw || "");
  if (s.length < 10) return "Lykilorðið þarf að vera að minnsta kosti tíu stafir.";
  if (/^\d+$/.test(s)) return "Lykilorð sem er bara tölur er auðvelt að giska á.";
  if (/^(.)\1+$/.test(s)) return "Lykilorðið má ekki vera sami stafurinn aftur og aftur.";
  return null;
}

/* ---------- Icelandic as a second language (v6.13, critique item 45) -------
 *
 * Many pupils in years 8–10 learn Icelandic as a second language, and both
 * what they get wrong and what helps them differ from a native teenager.
 * One switch, two ways to throw it:
 *
 *   settings.secondLanguage   the pupil's own, under Stillingar. Saved with
 *                             the progress, so it follows them between devices.
 *   settings.l2Teacher        the group's teacher turned it on for this pupil
 *                             (server: POST /teacher/secondlanguage, kept on
 *                             the account as `l2`). The app copies it in from
 *                             /auth/me at every start, so it is always the
 *                             server's current answer; on a file or a plain
 *                             host there is no teacher and it is never set.
 *
 * Either one turns the mode on; the pupil cannot switch off what the teacher
 * switched on (the box is shown ticked and greyed, with the reason).
 *
 * What the mode changes, and where:
 *   - Villuveiðar keeps the GENERATED error hunts at every þyngd rather than
 *     the bank of native teenagers' slips (tasks/malbeiting.js `huntSource`,
 *     the hook item 26 left);
 *   - every content word of a question's sentence can be tapped for its
 *     dictionary entry (ui/secondlang.js `glossToken`);
 *   - the level rises in quarter steps instead of half (core/difficulty.js
 *     `riseStep`);
 *   - a "Lesa upphátt" button reads the sentence aloud, with an Icelandic
 *     voice the device itself has (ui/secondlang.js `icelandicVoice`).
 *
 * Pure: reads the state and nothing else. */
export function secondLanguageSource(S) {
  const s = (S && S.settings) || {};
  if (s.l2Teacher === true) return "teacher";
  if (s.secondLanguage === true) return "pupil";
  return null;
}

/** Is the second-language mode on for this pupil? */
export const secondLanguage = (S) => secondLanguageSource(S) !== null;

/* ---------- the slice (issue #50) -------------------------------------------
 * `S.profile`, the name in the saved progress, as a slice of the saved state
 * (core/slices.js). The name on the board comes from the user record, never
 * from here: the server stores a blank one. Moved here unchanged from
 * core/state.js, core/merge.js and server/guard.mjs. */

/** @type {import("../types").Slice} */
export const profileSlice = {
  key: "profile",
  blank: () => ({ id: "local", name: "" }),
  migrate(raw) {
    const p = profileSlice.blank();
    if (raw) Object.assign(p, raw);
    return p;
  },
  /* No rule of its own: this device's (`{ ...remote, ...local }`). */
  merge: thisDevice,
  clean: () => ({ id: "local", name: "" }),
  ownText: false,
};
