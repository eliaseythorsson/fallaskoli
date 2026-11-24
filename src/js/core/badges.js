/* Badges.

   Generated from rules rather than written out one by one, so a new skill
   brings its own badges with it. Every badge carries, for its base rarity
   (core/rarity.js), either `fam` + `n` (a threshold inside a family; the guess
   is computed and falls with n) or `est` (a standalone guess at the share of
   users who end up with it). `tests/rarity.test.js` fails on a badge with
   neither.

   `set` ties badges into a collection with one badge that closes it, `social`
   marks a badge only a server can award (left out of "Öll merkin"), and a
   `secret` badge keeps its condition to itself on other people's shelves as
   well as in the catalogue: until you win it you see its name and "???".

   Three fields say WHEN a badge may fire:
     cap: n          at most n times in one session (one page load)
     period: "day" | "night"
                     at most once per calendar day / per night (00:00–07:00),
                     across sessions — the ledger is saved with the progress
     when: "dayEnd"  judged only after the day is over (settleDays in
                     core/state.js); `test` then takes a day summary
     when: "login"   judged when the program is opened, not on an answer
     when: "social"  judged when the server's roster and weekly board arrive
     period: "week"  at most once per finished week (social badges only) */

import { SKILLS } from "./skills.js";
import { THEMES, KINDS, SAYINGS } from "./wordsets.js";
import { prevKey } from "./calendar.js";
import { wordRecord } from "./wordknowledge.js";
import { obj, keys, later, counters, mergeBadge, thisDevice, n, dayStr, isObj, pairs, smallJSON } from "./slicerules.js";

const RUN_ICONS = { 5: "✨", 10: "🔥", 15: "💥", 20: "⚡", 30: "🌟", 50: "💫", 75: "🚀", 100: "👑" };
const SKILL_RUN_ICONS = { 10: "🎪", 20: "🏹" };

/* In the order they arrive, Stekkjarstaur on the 12th and Kertasníkir on the
   24th. */
export const YULE_LADS = [
  ["Stekkjarstaur", "🐑"], ["Giljagaur", "🥛"], ["Stúfur", "🍳"],
  ["Þvörusleikir", "🥄"], ["Pottaskefill", "🍲"], ["Askasleikir", "🥣"],
  ["Hurðaskellir", "🚪"], ["Skyrgámur", "🍦"], ["Bjúgnakrækir", "🌭"],
  ["Gluggagægir", "🪟"], ["Gáttaþefur", "👃"], ["Ketkrókur", "🪝"],
  ["Kertasníkir", "🕯️"],
];
export const JOL_IDS = YULE_LADS.map((_, i) => `jol_${i + 1}`);

/** Every badge: {id, ico, nm, ds, skill?, once?, cap?, test(ctx)} */
/* Rungs of the week ladders: 2, 4, 8, 12, 20 and 30 weeks in a row. */
export const WEEK_RUNGS = [2, 4, 8, 12, 20, 30];

export function buildBadges() {
  const B = [];

  /* ---- 1. Correct in a row, overall ----
     Owner feedback 6.14: every badge that reads a run is tested only on the
     answer that lengthened it (`c.correct === true`). A question that is
     neither right nor wrong (the meaning question, an unjudged word) leaves
     the run where it was, and a test of `run === n` came true again on it:
     "5 í röð" twice in one session, from one run of five. */
  [5, 10, 15, 20, 30, 50, 75, 100].forEach((n) => {
    B.push({
      id: `run${n}`, ico: RUN_ICONS[n], nm: `${n} í röð`,
      ds: `${n} rétt svör í röð`, group: "röð", fam: "run", n,
      cap: n <= 10 ? 2 : undefined,
      test: (c) => c.correct === true && c.run === n,
    });
  });

  /* ---- 2. Correct in a row within one skill ---- (a step at 5 would only
     inflate the badge count; `first_<skill>` fires earlier anyway) */
  SKILLS.forEach((s) => {
    [10, 20].forEach((n) => {
      B.push({
        id: `run_${s.id}_${n}`, ico: SKILL_RUN_ICONS[n], nm: `${s.nm}: ${n} í röð`,
        ds: `${n} rétt svör í röð í flokknum ${s.nm.toLowerCase()}`,
        skill: s.id, group: "röð", fam: "runskill", n, cap: 2,
        test: (c) => c.correct === true && (c.skillRun[s.id] || 0) === n,
      });
    });
  });

  /* ---- 3. Three ladders through the same week ----
   * Turning up every day (`login`), answering every day (`ansday`) and meeting
   * the goal every day (`day`). The first two are deliberately easier: a child
   * who opened the program every day for a week has built the habit. The
   * login ladder is judged at start-up (`when: "login"`), because "opened it
   * every day this week" is true the moment the program opens. */
  [2, 3, 5, 7, 10, 14, 21, 30, 50, 75, 100].forEach((n) => {
    B.push({
      id: `day${n}`, ico: n >= 30 ? "🏔️" : n >= 7 ? "🌳" : "🌱",
      nm: n === 7 ? "Heil vika á markmiði" : n === 30 ? "Mánuður á markmiði" : `${n} dagar`,
      ds: `${n} daga röð þar sem dagsmarkmiði var náð`, group: "dagar",
      fam: "daystreak", n, cap: 1,
      test: (c) => c.dayStreak === n && c.newGoalDay,
    });
  });

  [3, 7, 14, 30, 60, 100].forEach((n) => {
    B.push({
      id: `login${n}`, ico: n >= 60 ? "🗝️" : n >= 30 ? "📅" : "🚪",
      nm: n === 7 ? "Vika í röð" : n === 30 ? "Mánuður í röð" : `${n} daga heimsókn`,
      ds: n === 7
        ? "Opnaðir Fallaskóla alla daga heillar viku"
        : n === 30
          ? "Opnaðir Fallaskóla alla daga í heilan mánuð"
          : `Opnaðir Fallaskóla ${n} daga í röð`,
      /* `once` and `>=`, not `cap` and `===`. A streak badge tested for
         equality can only be won on the exact day the counter hits the number,
         and this counter is read at start-up: a child who comes back from a
         long run of days with progress recorded before `lg` existed would sail
         past 3, 7 and 14 in one load and be given none of them. */
      group: "dagar", fam: "loginstreak", n, once: true, when: "login",
      test: (c) => c.loginStreak >= n,
    });
  });

  [3, 7, 14, 30, 60, 100].forEach((n) => {
    B.push({
      id: `ansday${n}`, ico: n >= 60 ? "🏅" : n >= 30 ? "🗓️" : "✍️",
      nm: n === 7 ? "Vika með svari" : n === 30 ? "Mánuður með svari" : `${n} daga svarröð`,
      ds: n === 7
        ? "Svaraðir að minnsta kosti einni spurningu alla daga heillar viku"
        : n === 30
          ? "Svaraðir að minnsta kosti einni spurningu alla daga í heilan mánuð"
          : `Svaraðir að minnsta kosti einni spurningu ${n} daga í röð`,
      group: "dagar", fam: "answerstreak", n, once: true,
      test: (c) => c.answerStreak >= n,
    });
  });

  /* ---- 3b. The same three ladders, counted in weeks (critique item 57) ----
   * Days in a row punish a school child for weekends, holidays and a cold, so
   * the three ladders above are retired (below): nobody can win them again,
   * everybody who did keeps them, and `LEGACY_STREAKS` credits the weeks they
   * stand for. The streak is now WEEKS in which the weekly goal was met
   * (core/state.js `weekStreak`; default four days of seven, 2-7 in the
   * settings). The same three promises as before, in the same order of
   * difficulty: opened it, answered, met the daily goal.
   * `once` and `>=`, for the reason given at the login ladder. */
  WEEK_RUNGS.forEach((n) => {
    B.push({
      id: `wk${n}`, ico: n >= 20 ? "🏔️" : n >= 8 ? "🌳" : "🌱",
      nm: `${n} vikur í röð`,
      ds: `Vikumarkmiði náð ${n} vikur í röð — nógu margir dagar í hverri viku þar sem dagsmarkmiði var náð`,
      group: "dagar", fam: "weekstreak", n, once: true,
      test: (c) => c.weekStreak >= n,
    });
    B.push({
      id: `wkans${n}`, ico: n >= 20 ? "🏅" : n >= 8 ? "🗓️" : "✍️",
      nm: `Svör ${n} vikur`,
      ds: `Svaraðir spurningum nógu marga daga í hverri viku til að ná vikumarkmiðinu, ${n} vikur í röð`,
      group: "dagar", fam: "weekanswer", n, once: true,
      test: (c) => c.weekAnswerStreak >= n,
    });
    B.push({
      id: `wklogin${n}`, ico: n >= 20 ? "🗝️" : n >= 8 ? "📅" : "🚪",
      nm: `Heimsóknir ${n} vikur`,
      ds: `Opnaðir Fallaskóla nógu marga daga í hverri viku til að ná vikumarkmiðinu, ${n} vikur í röð`,
      group: "dagar", fam: "weeklogin", n, once: true, when: "login",
      test: (c) => c.weekLoginStreak >= n,
    });
  });

  /* ---- 4. Answers in one day ---- */
  [10, 25, 50, 100, 200].forEach((n) => {
    B.push({
      id: `d${n}`, ico: n >= 100 ? "🏅" : "✅", nm: `${n} á dag`,
      ds: `${n} svör á einum degi`, group: "dagar", fam: "dayans", n, cap: 1,
      test: (c) => c.dayAnswers === n,
    });
  });

  /* ---- 5. Correct answers overall ---- */
  [50, 250, 1000, 2500, 5000].forEach((n) => {
    B.push({
      id: `tot${n}`, ico: n >= 2500 ? "🐋" : n >= 1000 ? "🦉" : "📖",
      nm: `${n.toLocaleString("is-IS")} rétt`, ds: `${n} rétt svör alls`,
      group: "safn", fam: "total", n, once: true, test: (c) => c.totalCorrect >= n,
    });
  });

  /* ---- 6. Correct answers within one skill ---- */
  SKILLS.forEach((s) => {
    [25, 100, 500].forEach((n) => {
      B.push({
        id: `cnt_${s.id}_${n}`, ico: s.ico, nm: `${s.nm} ×${n}`,
        ds: `${n} rétt svör í flokknum ${s.nm.toLowerCase()}`,
        skill: s.id, group: "safn", fam: "skilltotal", n, once: true,
        test: (c) => (c.skillCorrect[s.id] || 0) >= n,
      });
    });
  });

  /* ---- 7. The first correct answer in each skill ----
     The n=1 step of the family that counts correct answers in a skill, so the
     formula orders it (1 < 25 < 100 < 500) rather than a hand-written guess. */
  SKILLS.forEach((s) => {
    B.push({
      id: `first_${s.id}`, ico: "🌟", nm: `Fyrsta ${s.nm.toLowerCase()}`,
      ds: `Fyrsta rétta svarið í flokknum ${s.nm.toLowerCase()}`,
      skill: s.id, group: "fyrst", fam: "skilltotal", n: 1, once: true,
      test: (c) => (c.skillCorrect[s.id] || 0) >= 1,
    });
  });

  /* ---- 8. Levels ---- */
  [2, 3, 4, 5, 7, 10, 12, 15, 20].forEach((n) => {
    B.push({
      id: `lvl${n}`, ico: n >= 15 ? "🌌" : n >= 10 ? "👑" : n >= 5 ? "🛡️" : "🎖️",
      nm: `Stig ${n}`, ds: `Náðu heildarstigi ${n}`, group: "stig",
      fam: "level", n, once: true,
      test: (c) => c.level >= n,
    });
  });
  SKILLS.forEach((s) => {
    [3, 5, 7].forEach((n) => {
      B.push({
        id: `slvl_${s.id}_${n}`, ico: s.ico, nm: `${s.nm}: stig ${n}`,
        ds: `Náðu stigi ${n} í flokknum ${s.nm.toLowerCase()}`,
        skill: s.id, group: "stig", fam: "skilllevel", n, once: true,
        test: (c) => (c.skillLevel[s.id] || 1) >= n,
      });
    });
  });

  /* ---- 9. Events that can fire often — hence the caps ---- */
  B.push(
    { id: "tbl_clean", ico: "📋", nm: "Hrein tafla", ds: "Öll svör rétt í beygingartöflu",
      group: "atvik", est: 0.85, cap: 2, test: (c) => c.perfectTable },
    { id: "parse_clean", ico: "🔍", nm: "Hrein greining", ds: "Allar línur réttar í greiningu",
      group: "atvik", est: 0.72, cap: 2, test: (c) => c.perfectParse },
    { id: "hard5", ico: "🧗", nm: "Þyngd fimm", ds: "Rétt svar við setningu í þyngd 5",
      group: "atvik", est: 0.50, cap: 2, test: (c) => c.hardWin },
    /* `c.comeback` counts consecutive wrongly answered QUESTIONS (app.finish),
       not record() calls — a table writes one record per cell. */
    { id: "comeback", ico: "🔄", nm: "Aftur á hestbak", ds: "Rétt svar strax eftir þrjú röng í röð",
      group: "atvik", est: 0.45, cap: 2, test: (c) => c.comeback },
    { id: "helper", ico: "🪜", nm: "Eigin hjálparorð", ds: "Beygði rétt í heilli setningu með eigin hjálparorðum",
      group: "atvik", est: 0.30, once: true, test: (c) => c.usedHelpers },
    { id: "nohint20", ico: "🧠", nm: "Engar vísbendingar", ds: "20 rétt í röð án vísbendingar",
      group: "atvik", est: 0.26, cap: 1, test: (c) => c.correct === true && c.run >= 20 && c.hintFreeRun >= 20 },
  );

  /* ---- 10. The session itself ---- */
  [25, 50, 100].forEach((n) => {
    B.push({
      id: `sess${n}`, ico: "⏱️", nm: `${n} í heimsókn`, ds: `${n} rétt svör í einni heimsókn (frá því forritið er opnað)`,
      group: "lota", fam: "session", n, cap: 1, test: (c) => c.sessionCorrect === n,
    });
  });

  /* ---- 11. The collector ---- */
  [10, 25, 50, 100, 200, 400, 800, 1500, 2500, 4000].forEach((n) => {
    B.push({
      id: `coll${n}`, ico: n >= 2500 ? "🏯" : n >= 800 ? "🏛️" : n >= 200 ? "🗃️" : "🪙",
      nm: `${n} orð í safni`, ds: `Hittu á ${n} ólík orð`,
      group: "safnari", fam: "collection", n, once: true,
      test: (c) => c.collection.total >= n,
    });
  });
  [["kk", "karlkynsorð"], ["kvk", "kvenkynsorð"], ["hk", "hvorugkynsorð"],
   ["lo", "lýsingarorð"], ["so", "sagnorð"], ["ao", "atviksorð"]].forEach(([cls, nm]) => {
    [25, 100, 250].forEach((n) => {
      B.push({
        id: `coll_${cls}_${n}`, ico: "📚", nm: `${n} ${nm}`,
        ds: `Safnaðu ${n} ólíkum ${nm}`, group: "safnari",
        fam: "collclass", n, once: true,
        test: (c) => (c.collection.byClass[cls] || 0) >= n,
      });
    });
  });
  /* Proportion badges: the condition is a share of a word class, not a count,
     so the guess applies to the proportion itself. */
  [[0.05, "Tuttugasti hlutinn", 0.45], [0.1, "Tíundi hlutinn", 0.22],
   [0.25, "Fjórðungur", 0.05], [0.5, "Helmingur", 0.006]].forEach(([frac, nm, est], i) => {
    B.push({
      id: `cov${i}`, ico: "🗺️", nm: `${nm} orðaforðans`,
      ds: `Hittu á ${Math.round(frac * 100)}% allra orða í einhverjum orðflokki`,
      group: "safnari", est, once: true,
      test: (c) => Object.values(c.collection.coverage).some((p) => p >= frac),
    });
  });
  B.push(
    /* "Rare": at least Mjög sjaldgæft on the corpus frequency scale — the
       least-used 7% of the vocabulary (core/rarity.js). */
    { id: "coll_rare", ico: "💎", nm: "Sjaldgæfur fundur", ds: "Hittu á orð sem er mjög sjaldgæft í íslensku",
      group: "safnari", est: 0.34, once: true, test: (c) => c.collection.rare >= 1 },
    { id: "coll_rare25", ico: "💠", nm: "Safn af sjaldgæfum", ds: "Hittu á 25 mjög sjaldgæf orð",
      group: "safnari", est: 0.06, once: true, test: (c) => c.collection.rare >= 25 },
    { id: "coll_all_fl", ico: "🧩", nm: "Allir orðflokkar", ds: "Hittu á orð úr öllum ellefu orðflokkunum",
      group: "safnari", est: 0.30, once: true, test: (c) => c.collection.fl >= 11 },
    { id: "coll_master50", ico: "🎓", nm: "Fimmtíu á valdi þínu", ds: "50 orð með 80% réttra svara eða meira",
      group: "safnari", est: 0.35, once: true, test: (c) => c.collection.mastered >= 50 },
  );

  /* ---- 12. Secret badges ----
     Not visible in advance. `est` is written on the spot; the numbers matter
     mostly relative to each other. */
  const secret = (id, ico, nm, ds, est, test, opts = {}) =>
    B.push({ id, ico, nm, ds, group: "leyni", est, cap: opts.cap ?? 1,
             secret: true, test, ...opts });

  /* ---- 12a. Badges about the clock and the calendar ----
   * True for as long as the time lasts, so `cap` alone (one session) handed
   * them out again on every reload. `period: "day"` keys the ledger on the
   * date, so a Christmas badge still comes round next Christmas. */
  const DAY = { period: "day" };

  secret("s_night", "🦉", "Náttugla", "Æfing milli miðnættis og sjö að morgni",
    0.16, (c) => c.time.hour >= 0 && c.time.hour < 7, { period: "night" });
  secret("s_dawn", "🌅", "Árrisull", "Æfing fyrir klukkan átta að morgni",
    0.30, (c) => c.time.hour >= 7 && c.time.hour < 8, DAY);
  secret("s_late", "🌙", "Kvöldvakt", "Æfing eftir klukkan tíu að kvöldi",
    0.42, (c) => c.time.hour >= 22, DAY);
  secret("s_weekend", "🛋️", "Helgarlærdómur", "Æfing um helgi", 0.70,
    (c) => c.time.weekend, DAY);
  secret("s_break", "🏖️", "Í fríi en samt", "Æfing í skólafríi", 0.45,
    (c) => c.time.schoolBreak, DAY);
  secret("s_holiday", "🎉", "Hátíðarnám", "Æfing á merkisdegi", 0.34,
    (c) => !!c.time.holiday, DAY);
  /* One particular red-letter day is rarer than "some red-letter day", and days
     that are also school holidays are likelier than days that are not. */
  [["jóladagur", "🎄", "Jólalærdómur", 0.07],
   ["þjóðhátíðardagurinn", "🇮🇸", "Sautjándi júní", 0.06],
   ["nýársdagur", "🎆", "Nýársheit", 0.07],
   ["páskadagur", "🐣", "Páskaegg", 0.07],
   ["sumardagurinn fyrsti", "🌱", "Sumargjöf", 0.08],
   ["gamlársdagur", "🧨", "Síðasta svar ársins", 0.05],
   ["bolludagur", "🍩", "Bolla, bolla", 0.09],
   ["öskudagur", "🎭", "Öskudagur", 0.09],
   ["Þorláksmessa", "🐟", "Þorláksmessa", 0.05]].forEach(([day, ico, nm, est]) => {
    secret("s_" + day.replace(/[^a-záðéíóúýþæö]/gi, ""), ico, nm,
      `Æfing á ${day}`, est, (c) => c.time.holiday === day, DAY);
  });
  secret("s_13", "🐈‍⬛", "Óheillatalan", "Þrettán rétt í röð", 0.62, (c) => c.correct === true && c.run === 13);
  secret("s_comeback5", "🛟", "Upp úr öldudalnum", "Fimm rétt í röð eftir fimm röng í röð",
    0.34, (c) => c.correct === true && c.run === 5 && c.wasStruggling);
  secret("s_marathon", "🏃", "Maraþon", "Hundrað svör á einum degi", 0.24,
    (c) => c.dayAnswers >= 100, DAY);
  /* ---- 12b. The three that need the day to be OVER ----
   * "Flekklaus dagur" cannot be judged on the twentieth answer (the twenty-
   * first may be wrong) and "Upp á hár" cannot be judged on the answer that
   * reaches the goal (the child may carry on). `when: "dayEnd"`: `test` takes a
   * day summary and runs once, after midnight, dated to the day itself. */
  secret("s_perfectday", "🌞", "Flekklaus dagur",
    "Heill dagur með tuttugu svörum eða fleiri og engu röngu",
    0.28, (d) => d.a >= 20 && d.a === d.c, { when: "dayEnd" });
  secret("s_firstword", "🔎", "Nýtt orð", "Fyrsta orðið sem þú hittir á", 0.97,
    (c) => c.collection.total === 1);
  secret("s_newword50", "🧭", "Landkönnuður", "Fimm ný orð í sömu heimsókn",
    0.88, (c) => c.sessionNewWords === 5);

  /* ---- 13. Moving between skills ----
     Changing mode is harder than answering more of the same, so these are rarer
     than the counting badges even though the answers are fewer. */
  [3, 5, 7, 10].forEach((n) => {
    B.push({
      id: `multi_sess_${n}`, ico: n >= 10 ? "🎡" : "🧮",
      nm: `${n} flokkar í heimsókn`,
      ds: `Rétt svar í ${n} ólíkum flokkum í sömu heimsókn`,
      group: "fjölvirkni", fam: "multisess", n, cap: 1,
      test: (c) => c.sessionSkills === n,
    });
  });
  /* The per-day count starts at 7, not 3: the first steps fired on the same
     answer as the per-session count and handed out two badges for one feat. */
  [7, 10].forEach((n) => {
    B.push({
      id: `multi_day_${n}`, ico: "🗓️", nm: `${n} flokkar á degi`,
      ds: `Rétt svar í ${n} ólíkum flokkum á einum degi`,
      group: "fjölvirkni", fam: "multiday", n, cap: 1,
      test: (c) => c.daySkills === n,
    });
  });
  B.push(
    { id: "multi_all_day", ico: "🎠", nm: "Allt á einum degi",
      ds: "Rétt svar í öllum flokkum sem kveikt er á, á einum degi",
      group: "fjölvirkni", est: 0.30, cap: 1, test: (c) => c.allSkillsDay },
    { id: "multi_all_sess", ico: "🎢", nm: "Allt í einni heimsókn",
      ds: "Rétt svar í öllum flokkum sem kveikt er á, í einni heimsókn",
      group: "fjölvirkni", est: 0.20, cap: 1, test: (c) => c.allSkillsSession },
  );
  /* Streaks: consecutive days on which every skill was touched. This is the
     hardest streak in the program, deliberately. */
  [2, 3, 5, 7, 14, 30].forEach((n) => {
    B.push({
      id: `multi_streak_${n}`, ico: n >= 14 ? "🏵️" : "🌀",
      nm: n === 1 ? "Allt einn dag" : `Allt ${n} daga í röð`,
      ds: `${n} daga röð þar sem öllum kveiktum flokkum var svarað rétt`,
      group: "fjölvirkni", fam: "multistreak", n, once: true,
      test: (c) => c.allSkillsStreak >= n,
    });
  });
  /* The combination: changing skill on every single answer. */
  [6, 8, 10].forEach((n) => {
    B.push({
      id: `rotate${n}`, ico: "🔁", nm: `${n} í röð, aldrei sami flokkur`,
      ds: `${n} rétt svör í röð þar sem aldrei komu tveir úr sama flokki`,
      group: "fjölvirkni", fam: "rotate", n, cap: 1,
      test: (c) => c.rotation === n,
    });
  });
  B.push(
    { id: "multi_lvl5_all", ico: "🕸️", nm: "Jafnvægi",
      ds: "Stig 3 eða hærra í öllum flokkum sem kveikt er á",
      group: "fjölvirkni", est: 0.10, once: true,
      test: (c) => c.enabledSkills.length > 1 &&
        c.enabledSkills.every((id) => (c.skillLevel[id] || 1) >= 3) },
    { id: "multi_sessions3", ico: "🧵", nm: "Þrjár heimsóknir, þrír flokkar",
      ds: "Þrjár heimsóknir í röð þar sem að minnsta kosti þrír flokkar komu við",
      group: "fjölvirkni", est: 0.40, once: true,
      test: (c) => c.multiSessionRun >= 3 },
  );

  /* ---- 14. Oddity badges ----
     Hidden and pointless, which is the point. `c.answer` is the SHAPE of the
     answer (length, letters), never its text. */
  secret("s_palindrome", "🪞", "Spegilorð", "Rétt svar sem er eins fram og aftur",
    0.30, (c) => !!c.answer?.palindrome);
  secret("s_long18", "🐍", "Langlokan", "Rétt svar sem er 18 stafir eða lengra",
    0.20, (c) => (c.answer?.len || 0) >= 18);
  secret("s_short2", "🌰", "Tveir stafir", "Rétt svar sem er aðeins tveir stafir",
    0.55, (c) => c.answer?.len === 2);
  secret("s_allvowels", "🎵", "Sérhljóðasúpa", "Rétt svar með fimm ólíkum sérhljóðum",
    0.12, (c) => (c.answer?.vowels || 0) >= 5);
  secret("s_thorn3", "🦅", "Þrír þornar", "Rétt svar með þremur þ eða ð",
    0.14, (c) => (c.answer?.thorns || 0) >= 3);
  secret("s_noaccent", "🫥", "Enginn broddur", "Tíu rétt í röð án eins einasta brodds",
    0.36, (c) => c.accentFreeRun === 10);
  secret("s_1111", "🕚", "Ellefu ellefu", "Svar klukkan 11:11", 0.03,
    (c) => c.time.hour === 11 && c.time.minute === 11, DAY);
  secret("s_1337", "🖥️", "Þrettán þrjátíu og sjö", "Svar klukkan 13:37",
    0.03, (c) => c.time.hour === 13 && c.time.minute === 37, DAY);
  secret("s_midnight", "🕛", "Á slaginu", "Svar á fyrstu mínútu dagsins",
    0.006, (c) => c.time.hour === 0 && c.time.minute === 0, DAY);
  secret("s_leapday", "🐸", "Hlaupár", "Svar 29. febrúar",
    0.004, (c) => c.time.month === 1 && c.time.date === 29, DAY);
  secret("s_friday13", "🪜", "Föstudagurinn þrettándi", "Svar á föstudegi þann þrettánda",
    0.09, (c) => c.time.weekday === 5 && c.time.date === 13, DAY);
  secret("s_firstofmonth", "📆", "Fyrsti dagur mánaðar", "Svar þann fyrsta",
    0.60, (c) => c.time.date === 1, DAY);
  secret("s_oddweek", "🧿", "Oddatöluvika", "Sjö rétt í röð í oddatöluviku",
    0.66, (c) => c.correct === true && c.run === 7 && c.time.week % 2 === 1);
  secret("s_sevenseven", "🎰", "Sjö sjö", "Sjö rétt í röð klukkan sjö",
    0.05, (c) => c.correct === true && c.run === 7 && c.time.hour === 7);
  /* Both are about where the day STOPPED, so neither can be judged while it is
     running. One badge, one claim: "Upp á hár" is the goal exactly, "Flekklaus
     dagur" is the flawless day. */
  secret("s_exactgoal", "🎯", "Upp á hár",
    "Dagurinn endaði nákvæmlega á dagsmarkmiðinu — hvorki meira né minna",
    0.15, (d) => d.goal > 0 && d.a === d.goal, { when: "dayEnd" });
  secret("s_42", "🛸", "Fjörutíu og tvö", "Dagurinn endaði í fjörutíu og tveimur svörum",
    0.26, (d) => d.a === 42, { when: "dayEnd" });
  secret("s_100th_word", "💯", "Hundraðasta orðið", "Hundraðasta orðið í safnið",
    0.72, (c) => c.collection.total === 100);
  secret("s_samelemma3", "🪃", "Sama orðið þrisvar", "Sama orðið rétt þrisvar í röð",
    0.10, (c) => c.sameWordRun === 3);
  secret("s_allthree_gender", "⚖️", "Öll þrjú kynin", "Öll þrjú kyn nafnorða rétt í röð",
    0.55, (c) => c.genderRun >= 3);
  secret("s_hint_never", "🧗‍♀️", "Fimmtíu án hjálpar", "Fimmtíu rétt í röð án vísbendingar",
    0.05, (c) => c.correct === true && c.hintFreeRun === 50);
  secret("s_slow", "🐌", "Þolinmæðin", "Rétt svar eftir að hafa hugsað í meira en tvær mínútur",
    0.38, (c) => (c.answerMs || 0) > 120000);
  secret("s_fast", "🐇", "Á augabragði", "Fimm rétt svör í röð, hvert undir fimm sekúndum",
    0.24, (c) => c.fastRun === 5);
  secret("s_backfromthedead", "🧟", "Aftur úr fríi", "Fyrsta rétta svarið eftir mánaðarhlé",
    0.22, (c) => c.idleDays >= 30);
  secret("s_sunday_morning", "☕", "Sunnudagsmorgunn", "Svar á sunnudegi fyrir klukkan tíu",
    0.30, (c) => c.time.weekday === 0 && c.time.hour < 10, DAY);
  secret("s_allsame_case", "🧱", "Fjögur föll", "Öll fjögur föll rétt í röð",
    0.44, (c) => c.caseRun >= 4);
  secret("s_taflaefter", "🧮", "Tvær heilar töflur", "Tvær heilar beygingartöflur í röð",
    0.40, (c) => c.tableRun === 2);
  /* Winnable only against a server with enough users to measure — see
     `foundRareWord()` in app.js. */
  secret("s_wordoftheday", "🎁", "Orð dagsins", "Orð sem enginn annar hefur hitt á",
    0.12, (c) => c.foundRareWord === true);

  /* ---- 14b. Sets: things to complete (v6.1) ----
     A set is several small badges and one that closes it. The small ones are
     hidden until won, so the cabinet shows "9 falin merki" and a friend's
     shelf shows which ones exist — that gap is the invitation. */

  /* The thirteen Yule Lads come to town one a night from 12 December; each
     badge can only be won on its own day, and the set takes a whole Advent
     (or two Decembers). */
  YULE_LADS.forEach(([nm, ico], i) => {
    B.push({
      id: `jol_${i + 1}`, ico, nm,
      ds: `Æfing ${12 + i}. desember, daginn sem ${nm} kemur til byggða`,
      group: "jól", est: 0.10, cap: 1, period: "day", set: "jol", secret: true,
      test: (c) => c.time.month === 11 && c.time.date === 12 + i,
    });
  });
  B.push({
    id: "jol_all", ico: "🎅", nm: "Allir þrettán", hidden: false,
    ds: "Allir þrettán jólasveinarnir komnir í safnið — einn fyrir hvern dag frá 12. til 24. desember",
    group: "jól", est: 0.004, once: true, set: "jol",
    test: (c) => !!c.has && JOL_IDS.every((id) => c.has(id)),
  });

  /* The alphabet, counted over the letters that actually begin a word in the
     vocabulary (no Icelandic word starts with ð). */
  B.push(
    { id: "coll_az_half", ico: "🔡", nm: "Hálft stafrófið",
      ds: "Orð í safninu sem byrja á helmingi stafanna í stafrófinu",
      group: "safnari", est: 0.75, once: true,
      test: (c) => (c.collection.lettersTotal || 0) > 0 &&
        (c.collection.letters || 0) >= Math.ceil(c.collection.lettersTotal / 2) },
    { id: "coll_az", ico: "🔠", nm: "Frá a til ö",
      ds: "Orð í safninu sem byrja á hverjum einasta staf sem orð geta byrjað á",
      group: "safnari", est: 0.09, once: true,
      test: (c) => (c.collection.lettersTotal || 0) > 0 &&
        (c.collection.letters || 0) >= c.collection.lettersTotal },
  );

  /* ---- 14c. More of the calendar ---- */
  secret("s_tunga", "🪶", "Dagur íslenskrar tungu",
    "Æfing 16. nóvember, á fæðingardegi Jónasar Hallgrímssonar",
    0.22, (c) => c.time.month === 10 && c.time.date === 16, DAY);
  /* Bóndadagur is the Friday that begins Þorri (19–25 January); konudagur the
     Sunday that begins Góa (18–24 February). */
  secret("s_bondadagur", "🍖", "Bóndadagur", "Æfing á bóndadaginn, fyrsta degi þorra",
    0.09, (c) => c.time.month === 0 && c.time.weekday === 5 &&
      c.time.date >= 19 && c.time.date <= 25, DAY);
  secret("s_konudagur", "💐", "Konudagur", "Æfing á konudaginn, fyrsta degi góu",
    0.09, (c) => c.time.month === 1 && c.time.weekday === 0 &&
      c.time.date >= 18 && c.time.date <= 24, DAY);
  secret("s_skammdegi", "🕯️", "Skammdegi", "Æfing 21. desember, þegar dagurinn er stystur",
    0.10, (c) => c.time.month === 11 && c.time.date === 21, DAY);
  secret("s_solstodur", "☀️", "Bjartar nætur", "Æfing 21. júní, þegar dagurinn er lengstur",
    0.07, (c) => c.time.month === 5 && c.time.date === 21, DAY);
  secret("s_pi", "🥧", "Pí-dagur", "Æfing 14. mars — 3,14",
    0.12, (c) => c.time.month === 2 && c.time.date === 14, DAY);

  /* ---- 14d. Accidents and near-misses ----
     Luck, hesitation and forgetting. None of these can be practised for, which
     is the point: they turn up, and then they are something to show. */
  [[874, "⛵", "Landnám", "874, árið sem Ingólfur settist að"],
   [930, "⚖️", "Alþingi", "930, árið sem Alþingi var stofnað"],
   [1918, "📜", "Fullveldi", "1918, fullveldisárið"],
   [1944, "🇮🇸", "Lýðveldi", "1944, árið sem lýðveldið var stofnað"],
  ].forEach(([n, ico, nm, what]) => {
    secret(`s_xp${n}`, ico, nm, `XP-talan stóð í nákvæmlega ${n.toLocaleString("is-IS")} — ${what}`,
      0.09, (c) => c.xp === n, { once: true });
  });
  secret("s_slip3", "🤏", "Sloppið fyrir horn",
    "Þrjú svör í röð sem voru tekin gild þrátt fyrir smávillu",
    0.12, (c) => c.slipRun === 3);
  secret("s_waver", "🫨", "Á báðum áttum",
    "Skiptir þrisvar um skoðun í fjölvalsspurningu — og hafðir samt rétt fyrir þér",
    0.20, (c) => c.correct === true && (c.pickChanges || 0) >= 3);
  secret("s_goldfish", "🐠", "Gullfiskaminni",
    "Rangt svar við orði sem þú hafðir haft rétt fimm sinnum eða oftar",
    0.55, (c) => c.goldfish === true);
  secret("s_fourcases", "🧬", "Eitt orð, fjögur föll",
    "Sama orðið rétt í öllum fjórum föllum í sömu heimsókn, án þess að nota töflu",
    0.18, (c) => (c.wordCases || 0) >= 4, { once: true });

  /* ---- 14e. With other people (v6.1) ----
     Only a server knows any of this, so these are judged when the roster and
     the weekly board have arrived (`when: "social"`, app.js `loadSocial`), and
     `c.social` is what core/social.js `socialContext` makes of them. They are
     left out of "Öll merkin": a child practising alone from a file must still
     be able to win everything. */
  const social = (id, ico, nm, ds, est, test, opts = {}) => B.push({
    id, ico, nm, ds, group: "saman", est, when: "social", social: true,
    cap: 1, secret: opts.hidden !== false,
    test: (c) => !!c.social && !!test(c.social), ...opts,
  });
  social("soc_champ", "🥇", "Vikumeistari",
    "Flest XP allra í heila viku, frá mánudegi til sunnudags",
    0.25, (s) => s.champion, { hidden: false, period: "week" });
  social("soc_overtake", "🏎️", "Framúrakstur",
    "Fórst fram úr einhverjum á vikutöflunni",
    0.55, (s) => s.overtook, { hidden: false, period: "day" });
  social("soc_podium", "🏅", "Á palli",
    "Í einu af þremur efstu sætunum þegar vikan endaði, með fimm eða fleiri á töflunni",
    0.40, (s) => s.podium, { hidden: false, period: "week" });
  social("soc_pioneer", "🚩", "Frumherji",
    "Fyrst(ur) allra á þjóninum til að finna leynimerki",
    0.20, (s) => s.pioneer, { once: true });
  social("soc_unique", "🦄", "Einstakt eintak",
    "Þú átt merki sem enginn annar á þjóninum á",
    0.22, (s) => s.unique, { once: true });
  social("soc_tie", "🤝", "Hnífjafnt",
    "Nákvæmlega jafnmörg XP og einhver annar á töflunni",
    0.03, (s) => s.tie, { once: true });
  social("soc_twins", "👯", "Samferða",
    "Þú og einhver annar funduð sama leynimerkið í sömu vikunni",
    0.12, (s) => s.twins, { once: true });
  /* v6.13, item 59: the one badge on this shelf nobody wins against anybody.
     The group's teacher sets a weekly goal (core/classgoal.js); when the
     group's bar is full, every learner in it gets this, whatever each put
     in. Once a week (`goalweek`: the week the goal was met, from the
     server's answer), so a class that keeps meeting its goal keeps winning. */
  social("soc_classgoal", "🎯", "Saman í mark",
    "Hópurinn þinn náði markmiði vikunnar sem kennarinn setti",
    0.30, (s) => !!s.goalWeek, { hidden: false, period: "goalweek" });

  /* ---- 14f. Which words, not how many (v6.6) ----
     The collection read for patterns: whole themes, many words of one kind,
     pairs of opposites, every word of a famous saying, and a few oddities that
     only turn up by accident. `c.collection.sets` is core/wordsets.js
     `readSets`; every word a set names is checked against the vocabulary by
     tests/wordbank.test.js, so each of these can be won. */
  const sets = (c) => (c.collection && c.collection.sets) || NO_SETS;

  THEMES.forEach((t) => B.push({
    id: `th_${t.id}`, ico: t.ico, nm: t.nm, ds: t.ds, group: "þemu",
    est: t.est, once: true, test: (c) => sets(c).themes.includes(t.id),
  }));
  KINDS.forEach((k) => B.push({
    id: `kind_${k.id}`, ico: k.ico, nm: k.nm, ds: k.ds, group: "þemu",
    est: k.est, once: true,
    test: (c) => k.classes.reduce((a, x) => a + (sets(c).kinds[x] || 0), 0) >= k.n,
  }));
  B.push(
    { id: "opp5", ico: "☯️", nm: "Andstæður", group: "þemu", est: 0.35, once: true,
      ds: "Fimm pör af andstæðum lýsingarorðum í safninu — heitur og kaldur, stór og lítill …",
      test: (c) => sets(c).opposites >= 5 },
    { id: "opp12", ico: "🌗", nm: "Svart og hvítt", group: "þemu", est: 0.07, once: true,
      ds: "Tólf pör af andstæðum lýsingarorðum í safninu",
      test: (c) => sets(c).opposites >= 12 },
  );

  /* Sayings: secret until won, and a set with one badge that closes it. The
     name IS the saying, so a friend's shelf shows which sayings exist. */
  SAYINGS.forEach((t) => B.push({
    id: `say_${t.id}`, ico: t.ico, nm: t.nm, group: "spakmæli", set: "spakmaeli",
    ds: "Öll orðin í „" + t.nm + "“ eru komin í safnið",
    est: t.est, once: true, secret: true, test: (c) => sets(c).sayings.includes(t.id),
  }));
  B.push({
    id: "say_all", ico: "📜", nm: "Spakmælabókin", hidden: false, group: "spakmæli",
    set: "spakmaeli", est: 0.003, once: true,
    ds: `Öll ${SAYINGS.length} spakmælin komin í safnið, orð fyrir orð`,
    test: (c) => !!c.has && SAYINGS.every((t) => c.has(`say_${t.id}`)),
  });

  /* Oddities of the collection — luck more than effort. */
  const odd = (id, ico, nm, ds, est, test) =>
    secret(id, ico, nm, ds, est, test, { once: true });
  odd("s_anagram2", "🔀", "Stafarugl",
    "Tvö pör af orðum í safninu sem eru sömu stafirnir í annarri röð — eins og fugl og flug",
    0.25, (c) => sets(c).anagrams >= 2);
  odd("s_anagram6", "🧩", "Stafaruglari",
    "Sex pör af orðum í safninu sem eru sömu stafirnir í annarri röð", 0.05,
    (c) => sets(c).anagrams >= 6);
  odd("s_palin3", "♊", "Spegilsalurinn",
    "Þrjú orð í safninu sem eru eins aftur á bak — amma, inni, rör …", 0.22,
    (c) => sets(c).palindromes >= 3);
  odd("s_twins10", "👯‍♂️", "Tvífarar",
    "Tíu orð í safninu sem þú hefur hitt í tveimur orðflokkum eða fleiri", 0.28,
    (c) => sets(c).twins >= 10);
  odd("s_longword", "🦕", "Risaeðlan",
    "Orð í safninu sem er átján stafir eða lengra", 0.30,
    (c) => sets(c).longest >= 18);
  odd("s_tiny15", "🐜", "Smáorðasafnið",
    "Fimmtán orð í safninu sem eru aðeins einn eða tveir stafir", 0.33,
    (c) => sets(c).tiny >= 15);
  odd("s_genders", "🟰", "Kynjajafnrétti",
    "Nákvæmlega jafnmörg karlkyns-, kvenkyns- og hvorugkynsorð í safninu — tuttugu eða fleiri af hverju",
    0.03, (c) => !!sets(c).genderBalance);

  /* ---- 14g. Word health and the rescue drill (v6.6) ----
     A word answered six times or more and right in fewer than one in five of
     the recent answers is flagged; the child is offered a drill on that one
     word (core/wordhealth.js). These are visible from the start: they are a
     signpost to something worth doing, not a surprise. `c.drill` is the
     result of a drill that has just ended, and is there for one answer only. */
  [1, 5, 10, 25].forEach((n) => {
    const name = { 1: "Fyrsta björgunin", 5: "Bjargvættur", 10: "Björgunarsveitin",
                   25: "Landhelgisgæslan" }[n];
    B.push({
      id: `rescue${n}`, ico: { 1: "🛟", 5: "🦸", 10: "🚁", 25: "🚢" }[n], nm: name,
      ds: n === 1 ? "Bjargaðir orði í hættu með björgunaræfingu"
        : `Bjargaðir ${n} ólíkum orðum í hættu með björgunaræfingu`,
      group: "björgun", fam: "rescue", n, once: true, title: n >= 5,
      test: (c) => (c.collection.rescued || 0) >= n,
    });
  });
  B.push(
    { id: "drill_endure", ico: "🪨", nm: "Seigla", group: "björgun", est: 0.30, once: true,
      ds: "Kláraðir allar tuttugu spurningar björgunaræfingar án þess að gefast upp",
      test: (c) => !!(c.drill && c.drill.endured) },
    { id: "drill_perfect", ico: "🌠", nm: "Tíu af tíu", group: "björgun", est: 0.12, once: true,
      ds: "Björgunaræfing þar sem hvert einasta svar var rétt",
      test: (c) => !!(c.drill && c.drill.perfect) },
    { id: "drill_turn", ico: "🔃", nm: "Viðsnúningur", group: "björgun", est: 0.10, once: true,
      ds: "Þrjú fyrstu svörin í björgunaræfingu röng — og orðinu samt bjargað",
      test: (c) => !!(c.drill && c.drill.turnaround) },
    { id: "drill_ghost", title: true, ico: "👻", nm: "Gamall draugur kveðinn niður", group: "björgun",
      est: 0.10, once: true,
      ds: "Bjargaðir orði sem þú hafðir svarað fimmtán sinnum eða oftar áður",
      test: (c) => !!(c.drill && c.drill.oldGhost) },
    { id: "drill_three", ico: "🧹", nm: "Hreinsunarátak", group: "björgun", est: 0.05, once: true,
      ds: "Þrjár heppnaðar björgunaræfingar á sama deginum",
      test: (c) => !!(c.drill && c.drill.passed && c.drill.rescuesToday >= 3) },
    { id: "drill_kept", ico: "⚓", nm: "Haldið á floti", group: "björgun", est: 0.15, once: true,
      ds: "Orð sem þú bjargaðir hefur síðan verið rétt í að minnsta kosti 60% af fimm svörum eða fleiri",
      test: (c) => (c.collection.kept || 0) >= 1 },
    { id: "drill_kept5", ico: "🏗️", nm: "Traustur grunnur", group: "björgun", est: 0.04, once: true,
      ds: "Fimm orð sem þú bjargaðir hafa haldist á floti síðan",
      test: (c) => (c.collection.kept || 0) >= 5 },
  );

  /* ---- 14h. Lesefni (v6.7) ----
     Judged when a page is opened for the first time (`when: "read"`, app.js
     `onRead`). `c.read` is how many different pages have been read and
     `c.readTotal` how many there are. */
  [[1, "📖", "Fyrsta blaðsíðan", 0.60], [5, "📚", "Lestrarhestur", 0.30]].forEach(([n, ico, nm, est]) =>
    B.push({ id: `read${n}`, ico, nm, group: "lesefni", est, once: true, when: "read",
      ds: n === 1 ? "Last síðu í Lesefni" : `Last ${n} ólíkar síður í Lesefni`,
      test: (c) => (c.read || 0) >= n }));
  B.push({ id: "read_all", ico: "🎓", nm: "Allt lesið", group: "lesefni", est: 0.08, once: true,
    when: "read", title: true, ds: "Last hverja einustu síðu í Lesefni",
    test: (c) => (c.readTotal || 0) > 0 && (c.read || 0) >= c.readTotal });

  /* ---- 14i. Duels (v6.7) ----
     Only a server can hold a duel, so these are `social` like the badges of
     14e and judged when a duel's result arrives (`when: "duel"`, control/duel.js `loadDuels`).
     `c.duel` is { played, wins, perfect, tie } — `played` and `wins` are
     totals over every settled duel, the other two about the one just settled. */
  const duelB = (id, ico, nm, ds, est, test, opts = {}) => B.push({
    id, ico, nm, ds, group: "einvígi", est, when: "duel", social: true, once: true,
    test: (c) => !!c.duel && !!test(c.duel), ...opts,
  });
  duelB("duel_first", "🤺", "Fyrsta einvígið", "Kláraðir einvígi við annan notanda", 0.50,
    (d) => d.played >= 1);
  [[1, "⚔️", "Sigur í einvígi", 0.40], [5, "🛡️", "Skylmingakappi", 0.15],
   [10, "🏆", "Einvígismeistari", 0.06], [25, "👑", "Ósigrandi", 0.02]].forEach(([n, ico, nm, est]) =>
    duelB(`duel_win${n}`, ico, nm, n === 1 ? "Vannst einvígi" : `Vannst ${n} einvígi`, est,
      (d) => d.wins >= n, { title: n >= 5 }));
  duelB("duel_perfect", "🎯", "Hvert einasta rétt", "Einvígi þar sem öll svörin þín voru rétt", 0.10,
    (d) => d.perfect);
  duelB("duel_tie", "🤝", "Jafnir kappar", "Einvígi sem endaði með jafntefli", 0.10,
    (d) => d.tie);

  /* Keeping the whole collection well: the other half of the leaderboard's
     "Orðaforði". */
  [25, 100, 250, 500].forEach((n) => {
    B.push({
      id: `strong${n}`, ico: n >= 250 ? "🏰" : "💪", nm: `${n} orð á valdi þínu`,
      ds: `${n} orð sem þú hefur svarað þrisvar eða oftar og haft rétt í 80% nýlegra svara`,
      group: "heilsa", fam: "strong", n, once: true,
      test: (c) => (c.collection.strong || 0) >= n,
    });
  });
  [250, 1000, 2500].forEach((n) => {
    B.push({
      id: `vocab${n}`, ico: n >= 2500 ? "🌳" : n >= 1000 ? "🌿" : "🌱",
      nm: `Orðaforði ${n.toLocaleString("is-IS")}`,
      ds: `${n.toLocaleString("is-IS")} stig í orðaforða — orð í safninu, og meira fyrir orð sem þú kannt vel`,
      group: "heilsa", fam: "vocab", n, once: true,
      test: (c) => (c.collection.score || 0) >= n,
    });
  });
  B.push(
    { id: "health_clean", ico: "💚", nm: "Heilbrigt safn", group: "heilsa", est: 0.22, once: true,
      ds: "Hundrað metin orð í safninu eða fleiri og ekkert þeirra í hættu",
      test: (c) => (c.collection.judged || 0) >= 100 && (c.collection.weak || 0) === 0 },
    { id: "health_steel", title: true, ico: "🧲", nm: "Stálminni", group: "heilsa", est: 0.04, once: true,
      ds: "Þrjú hundruð metin orð eða fleiri, ekkert í hættu og 90% þeirra í góðu lagi",
      test: (c) => (c.collection.judged || 0) >= 300 && (c.collection.weak || 0) === 0 &&
        (c.collection.health || 0) >= 90 },
  );

  /* ---- 14j. Getting better (v6.13, critique item 56) ----
     Everything above pays for turning up and for collecting; these pay for
     the thing that went wrong going right. Three kinds, all visible from the
     start, because each is a signpost to something worth doing:

       mending   an error pattern that was "algengt núna" (active) and has
                 since been right ten times in a row, on a later day than it
                 went wrong (core/mending.js says why). Counted in DIFFERENT
                 patterns, so mending the same one twice is not two rungs.
       reviews   reviews passed on time (core/review.js: within two days of
                 the day they were due — a review due on Saturday and done
                 on Monday is on time, as everywhere else in the program)
       mastery   each skill's mastery mark (core/mastery.js) reaching
                 "Gott vald" (3) and "Fullt vald" (4). Tied to the skill, so
                 it is judged on an answer in that skill.

     Kept in one block on purpose: other work changes the streak ladders
     above, and this block touches none of them. */
  const better = (b) => B.push({ group: "framfarir", hidden: false, once: true, ...b });
  [[1, "🩹", "Fyrsta viðgerðin",
    "Villa sem þú gerðir oft er horfin: tíu rétt svör í röð við því sem áður fór úrskeiðis"],
   [3, "🔧", "Verkstæðið",
    "Þrjú ólík villumynstur löguð — hvert þeirra var algengt hjá þér og þú hefur síðan haft það rétt tíu sinnum í röð"],
   [10, "🧰", "Á bak og burt",
    "Tíu ólík villumynstur löguð — hvert þeirra var algengt hjá þér og þú hefur síðan haft það rétt tíu sinnum í röð"],
  ].forEach(([n, ico, nm, ds]) => better({
    id: `mend${n}`, ico, nm, ds, fam: "mend", n, title: n >= 10,
    test: (c) => (c.mended || 0) >= n,
  }));
  [[10, "⏰", "Stundvís"], [50, "🗓️", "Minnið heldur"], [200, "🧠", "Langtímaminni"]]
    .forEach(([n, ico, nm]) => better({
      id: `review${n}`, ico, nm, fam: "reviewontime", n, title: n >= 200,
      ds: `${n} upprifjanir sem tókust á réttum tíma — í síðasta lagi tveimur dögum eftir daginn sem þær áttu að koma`,
      test: (c) => (c.reviewsOnTime || 0) >= n,
    }));
  SKILLS.forEach((s) => {
    [[3, "Gott vald", "að minnsta kosti 75% nýlegra svara rétt á þinni þyngd"],
     [4, "Fullt vald", "að minnsta kosti 90% af síðustu tuttugu svörum rétt á þinni þyngd, og upprifjanirnar á réttum tíma"],
    ].forEach(([n, label, what]) => better({
      id: `mastery_${s.id}_${n}`, ico: n === 4 ? "🌟" : s.ico, nm: `${s.nm}: ${label.toLowerCase()}`,
      ds: `${label} í flokknum ${s.nm.toLowerCase()}: ${what}`,
      skill: s.id, fam: "mastery", n,
      test: (c) => typeof c.mastery === "function" && c.mastery(s.id) >= n,
    }));
  });

  /* ---- 15. The two meta badges ----
     Visible from day one. `all_badges` is a self-reference, so `checkBadges`
     computes `c.allOtherBadges` from the catalogue minus these two. */
  B.push(
    { id: "all_badges", ico: "🏆", nm: "Öll merkin", hidden: false,
      ds: "Öll önnur merki unnin. Nafnið þitt fær gullna litinn — líka í stigatöflunni.",
      group: "yfir", est: 0.002, once: true, test: (c) => c.allOtherBadges },
    { id: "all_badges_words", ico: "👑", nm: "Allt sem til er", hidden: false,
      ds: "Öll merki unnin og hvert einasta orð í safninu fundið. Kóróna við nafnið.",
      group: "yfir", est: 0.0005, once: true,
      test: (c) => c.allOtherBadges && c.collection.everyWord },
  );

  /* By default a badge is hidden until it is won. The exception is what is
     meant to work as a signpost: levels, day streaks and multi-skill. */
  B.forEach((b) => {
    if (b.hidden === undefined)
      b.hidden = !(b.group === "stig" || b.group === "dagar" ||
                   b.group === "fjölvirkni" || b.group === "yfir" ||
                   b.group === "björgun" || b.group === "heilsa");
  });

  /* v6.9: retired badges. 373 badges made each one worth little, so the
     ladders were thinned to their landmark rungs and the trivia secrets went.
     A retired badge is never awarded again and is not counted in "af N
     merkjum" or in "Öll merkin", but a child who already won one keeps it:
     it stays on their shelf and the server still accepts it. */
  B.forEach((b) => { if (isRetired(b.id)) b.retired = true; });

  return B;
}

/* The ladders thinned to one rung (or a few) by rule, the rest by name. */
const RETIRED_RULES = [
  /^cnt_.*_(25|500)$/,                 // per skill: keep ×100
  /^first_/,                           // per skill: "first correct" — eleven pop-ups in the first session
  /^slvl_.*_(3|7)$/,                   // per skill: keep level 5
  /^run_.*_20$/,                       // per skill: keep 10 in a row
  /^coll_(kk|kvk|hk|lo|so|ao)_(25|250)$/,
  /* v6.13, item 57: the three ladders of calendar days in a row. Kept on the
     shelf of whoever won them, never awarded again; `wk*` replaces them. */
  /^day\d+$/, /^login\d+$/, /^ansday\d+$/,
];

/* What the retired day ladders are worth in weeks: a pupil who won `day30`
   (thirty days in a row) has done at least four weeks of seven days, so they
   are credited `wk4` and every lower rung. The rule is `weeks * 7 <= n`. */
export const LEGACY_STREAKS = [
  { re: /^day(\d+)$/, to: "wk" },
  { re: /^ansday(\d+)$/, to: "wkans" },
  { re: /^login(\d+)$/, to: "wklogin" },
];

/** The week badges a set of already-won badges stands for: id -> the old record. */
export function legacyStreakCredit(owned) {
  const out = {};
  for (const [id, rec] of Object.entries(owned || {})) {
    for (const { re, to } of LEGACY_STREAKS) {
      const m = re.exec(id);
      if (!m) continue;
      for (const w of WEEK_RUNGS) {
        if (w * 7 > Number(m[1])) continue;
        const key = `${to}${w}`;
        if (!owned[key] && !(out[key])) out[key] = rec;
      }
    }
  }
  return out;
}
export const RETIRED_IDS = new Set([
  "s_dawn", "s_weekend", "s_holiday", "s_firstword", "s_newword50", "s_13",
  "s_palindrome", "s_long18", "s_short2", "s_allvowels", "s_thorn3", "s_noaccent",
  "s_1111", "s_1337", "s_midnight", "s_leapday", "s_friday13", "s_firstofmonth",
  "s_oddweek", "s_sevenseven", "s_42", "s_100th_word", "s_samelemma3", "s_allthree_gender",
  "s_slow", "s_sunday_morning", "s_allsame_case", "s_taflaefter", "s_pi", "s_xp874",
  "s_xp930", "s_xp1918", "s_xp1944", "s_goldfish", "s_anagram2", "s_tiny15",
  "s_twins10", "s_genders", "s_palin3", "cov0", "coll_az_half", "sess25",
  "multi_day_7", "multi_sessions3", "vocab250", "duel_win10", "duel_tie", "coll10",
  "coll50", "coll200", "coll800", "coll2500", "day2", "day5",
  "day10", "day21", "day50", "day75", "login3", "login14",
  "login60", "ansday3", "ansday14", "ansday60", "ansday100", "d10",
  "d50", "d200", "lvl2", "lvl4", "lvl7", "lvl12",
  "multi_streak_2", "multi_streak_5", "multi_streak_14", "multi_sess_3", "multi_sess_7", "rotate6",
  "rotate10", "strong25", "strong250", "s_nýársdagur", "s_páskadagur", "s_gamlársdagur",
  "s_bolludagur", "s_öskudagur", "s_Þorláksmessa", "s_bondadagur", "s_konudagur", "s_skammdegi",
  "s_solstodur", "s_late", "th_eltingaleikur", "th_morgunmatur", "th_attir",
  "rescue10", "drill_three", "tot2500",
]);
/* v6.13, item 56: room for the badges of §14j. The thinnest rungs of the
   collection: the six per-class word counts, single rungs left of ladders
   already cut in v6.9 and saying again what the overall count says; the
   first overall rung (25 words, met in the first sessions), and 1,500, which
   sat between 400 and 4,000 and was the step nobody aimed at. Kept as their
   own list so the change reads, and merges, on its own. Whoever won one keeps
   it on the shelf, as with every retired badge. */
export const RETIRED_56 = new Set([
  "coll25", "coll1500",
  "coll_kk_100", "coll_kvk_100", "coll_hk_100", "coll_lo_100", "coll_so_100", "coll_ao_100",
]);
export const isRetired = (id) => RETIRED_IDS.has(id) || RETIRED_56.has(id) ||
  RETIRED_RULES.some((r) => r.test(id));

/** What `c.collection.sets` looks like before anything is collected. */
const NO_SETS = { themes: [], sayings: [], opposites: 0, kinds: {}, anagrams: 0,
  palindromes: 0, twins: 0, longest: 0, tiny: 0, genderBalance: false };

/** Every badge ever made, retired ones included: what a saved state may hold. */
export const BADGES = buildBadges();
export const badgeById = (id) => BADGES.find((b) => b.id === id) || null;
/** The badges that can still be won — what the catalogue counts and offers. */
export const ACTIVE_BADGES = BADGES.filter((b) => !b.retired);

/* A badge tied to a skill is only considered when the answer that just
   happened belonged to that skill. Without this, `skillRun.nafnord` sitting
   at exactly 10 kept re-satisfying the noun badge on every later answer —
   which is how "Nafnorð: 10 í röð" was handed out for conjugating *ganga*. */
export const META_IDS = ["all_badges", "all_badges_words"];

/* The once-per-day / once-per-night ledger (`S.periods`, saved with the
 * progress). Keyed on the period rather than a flat "already won", so a
 * calendar badge comes round again next year. A night lies inside one date. */
const pad2 = (n) => String(n).padStart(2, "0");

/** The ledger key this badge occupies at this moment, or null if unbounded. */
export function periodKey(badge, time, ctx = null) {
  if (!badge || !badge.period) return null;
  /* A weekly badge is about the week that has ENDED, and only the server's
     answer says which week that is (core/social.js `socialContext`). */
  if (badge.period === "week") {
    const wk = ctx && ctx.social && ctx.social.lastWeek;
    return wk ? `week:${wk}` : null;
  }
  /* The class goal (item 59): the week in which the group met it. */
  if (badge.period === "goalweek") {
    const wk = ctx && ctx.social && ctx.social.goalWeek;
    return wk ? `goal:${wk}` : null;
  }
  if (!time) return null;
  const date = `${time.year}-${pad2((time.month ?? 0) + 1)}-${pad2(time.date)}`;
  return `${badge.period}:${date}`;
}

/**
 * Decide which badges an answer earns.
 *
 * @param ctx                  the badge context (core/state.js)
 * @param owned                S.badges — what has been won before
 * @param awardedThisSession   mutable {id: count}, owned by the session
 * @param catalogue            which badges to consider
 * @param periods              mutable {id: periodKey} ledger, owned by the
 *                             saved state; `{}` means no memory beyond this call
 */
export function checkBadges(ctx, owned, awardedThisSession, catalogue = ACTIVE_BADGES,
                            periods = {}) {
  const won = [];
  /* The meta badges must not be part of their own condition. What is counted
     is everything *else* that has been won — and it is counted here, on every
     call, because a badge won during this same call has to count. That is why
     the loop comes after: `all_badges` is last in the catalogue. */
  /* Nor are the badges only a server can award (`social`): "everything" has to
     stay winnable by a child practising alone from a file. */
  const others = catalogue.filter((b) => !META_IDS.includes(b.id) && !b.social && !b.retired);
  /* Set badges ask what is already on the shelf, this call included. */
  ctx.has = (id) => !!owned[id] || won.some((w) => w.id === id);
  ctx.allOtherBadges = others.length > 0 &&
    others.every((b) => owned[b.id] || won.some((w) => w.id === b.id));
  for (const b of catalogue) {
    if (b.retired) continue;
    /* A badge is only tested at its own moment: undefined = an answer,
       "login" = the program opened, "dayEnd" = a day ended (whose `test` takes
       a day summary, not this context). */
    if ((b.when || null) !== (ctx.when || null)) continue;
    if (b.skill && ctx.skill && b.skill !== ctx.skill) continue;
    if (b.skill && !ctx.skill) continue;
    const pk = periodKey(b, ctx.time, ctx);
    if (pk && periods[b.id] === pk) continue;      // already had it this period
    let fired = false;
    try { fired = !!b.test(ctx); } catch { fired = false; }
    if (!fired) continue;
    if (b.once && owned[b.id]) continue;
    const cap = b.cap ?? Infinity;
    if ((awardedThisSession[b.id] || 0) >= cap) continue;
    awardedThisSession[b.id] = (awardedThisSession[b.id] || 0) + 1;
    if (pk) periods[b.id] = pk;
    won.push(b);
    if (!META_IDS.includes(b.id)) {
      ctx.allOtherBadges = others.every(
        (x) => owned[x.id] || won.some((w) => w.id === x.id));
    }
  }
  return won;
}

/* Badges judged after the day is over. `settleDays()` in core/state.js walks
 * the days that ended while the child was away and calls `checkDayEnd` on each
 * once; they arrive at the next login, dated to the day they were earned.
 * `day` is a summary from `daySummary()`: { key, a, c, xp, ms, nw, goal, sk } */
export const DAY_END_BADGES = ACTIVE_BADGES.filter((b) => b.when === "dayEnd");

/* Badges the program being opened is enough to earn (`when: "login"`). */
export const LOGIN_BADGES = ACTIVE_BADGES.filter((b) => b.when === "login");

/**
 * Which badges opening the program earns. Same engine as an answer, a different
 * moment: the context is the ordinary badge context with `when: "login"` on it.
 */
export function checkLogin(ctx, owned, awardedThisSession, catalogue = ACTIVE_BADGES,
                           periods = {}) {
  return checkBadges({ ...ctx, when: "login" }, owned, awardedThisSession,
    catalogue, periods);
}

/**
 * Which day-end badges this finished day earns.
 * `owned` is only consulted for `once` badges; the caller decides what to do
 * with the result and owns the dating.
 */
export function checkDayEnd(day, owned = {}, catalogue = ACTIVE_BADGES) {
  const won = [];
  if (!day || !(day.a > 0)) return won;     // a day with no answers earns nothing
  for (const b of catalogue) {
    if (b.when !== "dayEnd") continue;
    if (b.once && owned[b.id]) continue;
    let fired = false;
    try { fired = !!b.test(day); } catch { fired = false; }
    if (fired) won.push(b);
  }
  return won;
}

/**
 * v6.9: celebration follows success.
 *
 * A badge is awarded the moment it is earned — the cabinet and its date do not
 * wait — but its window and its confetti do. On a wrong answer the badges just
 * earned (a first word met, the time of day, a collection threshold crossed by
 * the very word that was missed) are held; they are shown with the next answer
 * that is right, or with a question that has no wrong answer. Two pop-ups on a
 * child's first two answers, both of them wrong, read as a reward for missing.
 *
 * @param held     badges waiting from earlier wrong answers this session
 * @param won      badges earned by this answer
 * @param correct  true, false, or null for a question with no right answer
 * @returns { show, held }  what to celebrate now, and what still waits
 */
export function celebrate(held, won, correct) {
  const has = (list, b) => list.some((x) => x.id === b.id);
  if (correct === false) {
    const next = (held || []).slice();
    (won || []).forEach((b) => { if (!has(next, b)) next.push(b); });
    return { show: [], held: next };
  }
  const due = (held || []).slice();
  (won || []).forEach((b) => { if (!has(due, b)) due.push(b); });
  return { show: due, held: [] };
}

/**
 * The accident badges (§14d above), counted when a question has ended —
 * app.js `finish`, the one place that knows it (moved here from app.js,
 * critique item 76). Writes into the session; returns what goes into the
 * badge context of this answer.
 *
 *   slipRun    answers in a row accepted with a slip (`extra.slip`)
 *   wordCases  how many of the four cases one word has been answered in this
 *              session — a table hands over all four at once, so it is left out
 *   goldfish   the first miss on a word that had gone right five times
 */
export function noteAccidents(S, sess, cur, extra) {
  if (extra.correct === true) sess.slipRun = extra.slip ? (sess.slipRun || 0) + 1 : 0;
  else if (extra.correct === false) sess.slipRun = 0;

  const word = cur && cur.word;
  const cs = /^(NF|ÞGF|ÞF|EF)/.exec(String((cur && cur.cell) || ""));
  if (extra.correct === true && word && cs && !("perfectTable" in extra)) {
    const map = (sess.wordCases ||= {});
    const set = (map[word] ||= []);
    if (!set.includes(cs[1])) set.push(cs[1]);
    sess.wordCasesBest = Math.max(sess.wordCasesBest || 0, set.length);
  }

  const rec = word ? wordRecord(S, word) : null;
  const goldfish = extra.correct === false && !!rec && (rec.c || 0) >= 5 &&
    (rec.w || 0) === 1;
  return { goldfish, pickChanges: (cur && cur.changes) || 0 };
}

/* ---------- the slices (issue #50) -----------------------------------------
 * What the badges keep in the saved state, as slices (core/slices.js): the
 * badges won, the counts some of them are judged on, the once-a-day ledger
 * and the last day judged. Moved here unchanged from core/state.js
 * `migrate`, core/merge.js `mergeStates` and server/guard.mjs `cleanState`. */

/** @typedef {import("../types").Slice} Slice */

const BADGE_IDS = new Set(BADGES.map((b) => b.id));

/** `S.badges`: per badge id {n, dates, first, last}. @type {Slice} */
export const badgesSlice = {
  key: "badges",
  blank: () => ({}),
  /* Item 57: whoever won a day-streak badge keeps it, and is credited the
     week badges it stands for (`legacyStreakCredit`). */
  migrate(raw) {
    const own = raw && typeof raw === "object" ? raw : {};
    return { ...legacyStreakCredit(own), ...own };
  },
  merge(B, L, R) {
    const out = {};
    for (const k of keys(L, R)) out[k] = mergeBadge(obj(B)[k], obj(L)[k], obj(R)[k]);
    return out;
  },
  /* Only badges the program has. An invented id would otherwise be counted by
     the leaderboard and by the rarity statistics. */
  clean(value) {
    const badges = {};
    for (const [id, b] of pairs(value, 2000)) {
      if (!BADGE_IDS.has(id) || !isObj(b)) continue;
      const dates = (Array.isArray(b.dates) ? b.dates : []).map(dayStr).filter(Boolean).slice(-80);
      const first = dayStr(b.first) || dates[0] || null;
      badges[id] = { n: Math.max(1, n(b.n, 100000)), dates, first, last: dayStr(b.last) || first };
    }
    return badges;
  },
  ownText: false,
};

/** `S.multiSessionRun`: consecutive sessions touching three or more skills
    (multi-skill badges). @type {Slice} */
export const multiSessionRunSlice = {
  key: "multiSessionRun",
  blank: () => 0,
  migrate: (raw) => raw || 0,
  /* No rule of its own: this device's (see the PR for #50). */
  merge: thisDevice,
  clean: (value) => n(value),
  ownText: false,
};

/** `S.lastSessionSkills`: how many skills the last session touched, or null.
    @type {Slice} */
export const lastSessionSkillsSlice = {
  key: "lastSessionSkills",
  blank: () => null,
  migrate: (raw) => raw ?? null,
  merge: thisDevice,
  clean: (value) => (value == null ? null : n(value, 99)),
  ownText: false,
};

/** `S.counters`: counts some badges are judged on. `retries`, `retryFixed`:
    second tries made, and right (item 42, core/answer.js `judgeRetry`).
    @type {Slice} */
export const countersSlice = {
  key: "counters",
  blank: () => ({ perfectTables: 0, perfectParses: 0, meanings: 0, retries: 0, retryFixed: 0 }),
  /* The first three were once at the top of the state. */
  migrate: (raw, whole) => ({
    perfectTables: raw?.perfectTables ?? whole.perfectTables ?? 0,
    perfectParses: raw?.perfectParses ?? whole.perfectParses ?? 0,
    meanings: raw?.meanings ?? whole.meanings ?? 0,
    retries: raw?.retries ?? 0,
    retryFixed: raw?.retryFixed ?? 0,
  }),
  merge: (B, L, R) => counters(B, L, R, keys(L, R)),
  clean: (value) => Object.fromEntries(pairs(value, 20, 40).map(([k, v]) => [k, n(v)])),
  ownText: false,
};

/** `S.periods`: the once-per-day / once-per-night ledger (`periodKey`).
    @type {Slice} */
export const periodsSlice = {
  key: "periods",
  blank: () => ({}),
  migrate: (raw) => ((raw && typeof raw === "object") ? { ...raw } : {}),
  merge: (B, L, R) => ({ ...obj(R), ...obj(L) }),
  /* Small free-form data the program keeps for itself. */
  clean: (value) => smallJSON(value, 60000) || {},
  ownText: false,
};

/** `S.settled`: the last day whose day-end badges have been judged
    (core/state.js `settleDays`). @type {Slice} */
export const settledSlice = {
  key: "settled",
  blank: () => null,
  /* A state saved before `settled` existed has an unjudged history. Everything
     before the last active day is declared settled, so a returning child is
     not greeted with a stack of windows for days they have forgotten. */
  migrate: (raw, whole) => raw || (whole.lastActive ? prevKey(whole.lastActive) : null),
  merge: (B, L, R) => later(L, R),
  clean: (value) => dayStr(value),
  ownText: false,
};
