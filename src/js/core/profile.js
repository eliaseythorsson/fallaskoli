/* Users, rights and the two meta badges.
 *
 * Passwords are never stored in the browser: the access token arrives in an
 * HttpOnly cookie. What lives here is the rights table, the permission check
 * the server shares, the crest, and the password rule. */

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
