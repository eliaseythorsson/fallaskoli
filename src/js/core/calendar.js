/* The Icelandic calendar.

   Used by the secret badges: practising on Christmas Day or on 17 June should
   be worth something. A pure function of a date with no outside data, so it can
   be tested for any year at all.                                           */

const pad = (n) => String(n).padStart(2, "0");

/** The day key of a moment in UTC — "2026-11-16" — from milliseconds or a
    Date (default: now). Iceland keeps UTC all year, so this is the Icelandic
    day on any machine; the server's records (last seen, the daily quotas, an
    assignment's deadline) are kept by it. Not `keyOf` below, nor
    core/review.js `dayOf`, which read the device's local day. One function
    for the server and the app (review of v6.13, S11: it was written four
    times). @param {number|Date} [when] @returns {string} */
export const utcDay = (when = Date.now()) => new Date(when).toISOString().slice(0, 10);

export const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Easter Sunday (Meeus/Jones/Butcher). Returns a local-time Date. */
export function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const shift = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Fyrsti tiltekinn vikudagur eftir dagsetningu (0 = sunnudagur). */
function firstWeekdayAfter(year, month, day, weekday) {
  const d = new Date(year, month, day);
  do { d.setDate(d.getDate() + 1); } while (d.getDay() !== weekday);
  return d;
}

/** Every red-letter day of the year: key -> name. */
export function holidaysOf(year) {
  const E = easter(year);
  const out = new Map();
  const add = (d, nm) => out.set(keyOf(d), nm);

  add(new Date(year, 0, 1), "nýársdagur");
  add(new Date(year, 0, 6), "þrettándinn");
  add(shift(E, -48), "bolludagur");
  add(shift(E, -47), "sprengidagur");
  add(shift(E, -46), "öskudagur");
  add(shift(E, -3), "skírdagur");
  add(shift(E, -2), "föstudagurinn langi");
  add(E, "páskadagur");
  add(shift(E, 1), "annar í páskum");
  add(firstWeekdayAfter(year, 3, 18, 4), "sumardagurinn fyrsti");
  add(new Date(year, 4, 1), "verkalýðsdagurinn");
  add(shift(E, 39), "uppstigningardagur");
  add(shift(E, 49), "hvítasunnudagur");
  add(shift(E, 50), "annar í hvítasunnu");
  add(new Date(year, 5, 17), "þjóðhátíðardagurinn");
  add(firstWeekdayAfter(year, 6, 31, 1), "frídagur verslunarmanna");
  add(new Date(year, 11, 1), "fullveldisdagurinn");
  add(new Date(year, 11, 23), "Þorláksmessa");
  add(new Date(year, 11, 24), "aðfangadagur");
  add(new Date(year, 11, 25), "jóladagur");
  add(new Date(year, 11, 26), "annar í jólum");
  add(new Date(year, 11, 31), "gamlársdagur");
  return out;
}

export function holidayName(d = new Date()) {
  return holidaysOf(d.getFullYear()).get(keyOf(d)) || null;
}

export const isWeekend = (d = new Date()) => d.getDay() === 0 || d.getDay() === 6;

/** Icelandic school holidays, roughly: the summer break and Christmas. */
export function isSchoolBreak(d = new Date()) {
  const m = d.getMonth(), day = d.getDate();
  if (m === 5 && day >= 10) return true;
  if (m === 6 || m === 7) return true;
  if (m === 11 && day >= 21) return true;
  if (m === 0 && day <= 3) return true;
  return false;
}

/* ---- weeks (critique item 57) ----------------------------------------
   The streak is counted in WEEKS met, not in calendar days in a row: a school
   week has weekends, holidays and sick days in it. A week runs Monday to
   Sunday, as the Icelandic calendar does. */

/** The Monday (local midnight) of the week `d` falls in. */
export function mondayOf(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** The seven date keys of the week starting on `monday`, Monday first. */
export function weekKeys(monday) {
  return Array.from({ length: 7 }, (_, i) => keyOf(shift(monday, i)));
}

/** Does the week starting on `monday` lie wholly in a holiday? Every weekday
    of it is a school break or a red-letter day. Such a week is neither met nor
    missed: a streak is not broken by the summer, nor by Christmas. */
export function isBreakWeek(monday) {
  for (let i = 0; i < 5; i++) {
    const d = shift(monday, i);
    if (!isSchoolBreak(d) && !holidayName(d)) return false;
  }
  return true;
}

/** "vika" or "vikur" for a count: 1 vika, 2 vikur, 21 vika, 22 vikur, 11 vikur. */
export const weeksWord = (n) => (n % 10 === 1 && n % 100 !== 11 ? "vika" : "vikur");

/** "1 vika í röð", "3 vikur í röð". */
export const weeksInARow = (n) => `${n} ${weeksWord(n)} í röð`;

/** The slice of "now" the badges read. */
export function timeContext(d = new Date()) {
  return {
    hour: d.getHours(),
    minute: d.getMinutes(),
    second: d.getSeconds(),
    weekday: d.getDay(),
    year: d.getFullYear(),
    /* ISO week number — used by badges that fire on absurd grounds
       ("odd-numbered week"). */
    week: (() => {
      const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const day = t.getUTCDay() || 7;
      t.setUTCDate(t.getUTCDate() + 4 - day);
      const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
      return Math.ceil(((t - y0) / 86400000 + 1) / 7);
    })(),
    month: d.getMonth(),
    date: d.getDate(),
    weekend: isWeekend(d),
    holiday: holidayName(d),
    schoolBreak: isSchoolBreak(d),
  };
}
