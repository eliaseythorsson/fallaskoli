/* Time the child is actually answering. Measured between answers and
   clipped: nothing counts while the tab is hidden, a gap longer than IDLE_MS
   is absence, and one answer never counts more than MAX_PER_ANSWER. It
   under-counts on purpose. */

export const IDLE_MS = 90_000;         // a gap longer than this is absence
export const MAX_PER_ANSWER = 120_000; // one answer counts two minutes at most

export function createClock(now = () => Date.now(),
                            visible = () => typeof document === "undefined" ||
                              document.visibilityState === "visible") {
  let last = now();
  let awayFrom = null;

  return {
    /** Called when a new task appears on screen. */
    mark() { last = now(); },

    /** The tab went out of sight — time from this moment does not count. */
    pause() { if (awayFrom == null) awayFrom = now(); },

    /** The tab came back. The absence is not counted. */
    resume() { if (awayFrom != null) { last = now(); awayFrom = null; } },

    /**
     * Milliseconds this answer should count for. Returns 0 if the child was
     * away, so the figure is always time in front of the screen.
     */
    elapsed() {
      if (awayFrom != null || !visible()) { last = now(); return 0; }
      const dt = now() - last;
      last = now();
      if (dt < 0 || dt > IDLE_MS) return 0;
      return Math.min(dt, MAX_PER_ANSWER);
    },
  };
}

export const fmtDuration = (ms) => {
  const s = Math.round((ms || 0) / 1000);
  if (s < 60) return s + " sek";
  const m = Math.round(s / 60);
  if (m < 60) return m + " mín";
  const h = Math.floor(m / 60);
  return h + " klst " + (m % 60) + " mín";
};
