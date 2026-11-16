/* The random source of the question builders (tasks/view.js). They never call
   Math.random themselves: it is handed to them, here for practice and seeded
   for a duel (core/duel.js). Looked up at each call, not captured, so that the
   browser test's fixed seed — which replaces Math.random — still takes.
   One function for every controller (control/*.js). */
export const rng = () => Math.random();
