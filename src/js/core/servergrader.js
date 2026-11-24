// @ts-check
/* Is the server's grader up, for this visit? (issue #48, docs/adr/0004)
 *
 * A server-graded question type exists for a pupil only when the
 * administrator has switched server grading on for them (`allowed`, saved in
 * their progress) AND the program runs against a server whose grader is up.
 * The second half is not progress: it is what the server said when the
 * program opened (GET /grader, app.js), and it lasts as long as the page.
 * core/state.js `effectivePolicy` reads it here, so every place that asks the
 * policy which types are on — sessions, Lota dagsins, drills — leaves the
 * server-graded types out without knowing why.
 *
 * When the grader does not answer a question (twice, control/serverask.js),
 * the question ends as "not judged" and server-graded types are left out for
 * the rest of the visit (owner's decision 4): `serverGraderLost`. Nothing
 * turns them back on until the page is opened again.
 *
 * Default: down. A program opened from a file, or a server that never said
 * otherwise, has no server-graded questions at all. */

let up = false;
let lost = false;

/** Is a server grader available to this visit? */
export const serverGraderUp = () => up && !lost;

/** What the server said: is its grader up for this pupil? `true` only. */
export function setServerGrader(/** @type {unknown} */ said) {
  up = said === true;
}

/** The grader failed a question: no more server-graded questions this visit. */
export function serverGraderLost() {
  lost = true;
}

/** For tests: back to a page just opened. */
export function resetServerGrader() {
  up = false;
  lost = false;
}
