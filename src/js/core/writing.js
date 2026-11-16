/* "Skrifaðu þrjár setningar um …" — the pupil's own sentences (v6.13, item 46).
 *
 * Every other task is a sentence the program wrote. Once a week this one asks
 * the pupil for three of their own, on an everyday topic. Where the group's
 * teacher has switched it on and the server has GreynirCorrect, the text is
 * read over there and its remarks come back for the pupil to fix one by one;
 * anywhere else (a file, a plain host, a group that has not opted in, a
 * server without the checker) the task is offered all the same, with a short
 * list to read one's own text against and no checking.
 *
 * This module is the part both sides share, and it is pure:
 *   - the limits (`WRITING`) the server holds and the form shows;
 *   - the topics and which one a week gets (`topicFor`);
 *   - tidying and counting a text (`cleanText`, `countSentences`);
 *   - what an annotation from the checker may look like (`cleanAnnotations`);
 *   - following the annotations while the pupil edits (`followEdit`), which
 *     is what lets them be fixed one at a time in the app;
 *   - the one thing remembered in the progress: the Monday of the last week
 *     the task was finished (`settings.writingDone`). Never the text.
 *
 * The server side (routes, the worker, what is kept) is server/writing.mjs;
 * the screen is ui/writing.js; the privacy decision docs/PRIVACY.md §1f. */

export const WRITING = {
  /** Sentences asked for. */
  sentences: 3,
  /** The longest text the form takes and the server checks — three good
      sentences are 150–300 characters; this leaves room and no more. */
  maxChars: 600,
  /** The request body the server reads at all (JSON, escapes included). */
  maxBody: 4096,
  /** How long the server waits for the checker on one text (ms). */
  timeoutMs: 8000,
  /** Checks one account may ask for in an hour. */
  perHour: 30,
  /** Kept texts (only where the teacher switched keeping on): days, and how
      many per pupil at most. */
  keepDays: 60,
  keepPerPupil: 12,
  /** The most remarks returned for one text. */
  maxNotes: 40,
};

/* ---------- the topics ---------------------------------------------------------
 * Each follows "Skrifaðu þrjár setningar um" and is therefore in the
 * accusative. Everyday things a pupil of 13–16 can write about without
 * special words and without telling anything private. Every word form checked
 * in BÍN, and every prompt run through GreynirCorrect with nothing flagged
 * (a native reader should still read them once: see the report of item 46).
 * "ferðalag sem þig langar að fara í" was left out on purpose: correct, but
 * GreynirCorrect flags *þig langar*, and a pupil who echoes the prompt would
 * be told it is wrong. Order is fixed: a week's topic depends on it. */
export const TOPICS = [
  "skólann þinn",
  "fjölskylduna þína",
  "veðrið í dag",
  "það sem þú gerðir um síðustu helgi",
  "matinn sem þér finnst bestur",
  "gæludýr sem þú átt eða vildir eiga",
  "það sem þú gerir á morgnana",
  "staðinn þar sem þú átt heima",
  "íþrótt eða áhugamál sem þú stundar",
  "bók eða kvikmynd sem þér fannst skemmtileg",
  "ferðalag sem þú vilt fara í",
  "árstíðina sem þér finnst best",
  "hvernig þú kemst í skólann",
  "manneskju sem þú lítur upp til",
];

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The topic of the week that starts on Monday `week` ("YYYY-MM-DD", as
    core/social.js `weekKey` gives it). Every pupil of a class gets the same
    one that week, so it can be talked about in class. */
export function topicFor(week) {
  const w = DAY.test(String(week)) ? String(week) : "2026-01-05";
  const n = Math.floor(Date.UTC(+w.slice(0, 4), +w.slice(5, 7) - 1, +w.slice(8, 10)) / (7 * 86400000));
  return TOPICS[((n % TOPICS.length) + TOPICS.length) % TOPICS.length];
}

/** The whole instruction, as the pupil reads it. */
export const promptFor = (week) => `Skrifaðu ${WRITING.sentences === 3 ? "þrjár" : WRITING.sentences} setningar um ${topicFor(week)}.`;

/* ---------- the text -------------------------------------------------------------- */

/** A text as it may be checked: control characters out, runs of spaces and
    line breaks one space, ends trimmed. Not cut: a text over the limit is
    refused, not shortened — the pupil decides what goes. */
export function cleanText(text) {
  if (typeof text !== "string") return "";
  return text.normalize("NFC")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F\u200B-\u200F\u2028\u2029\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** How many sentences a text has, roughly: a stretch of words ended by . ! ?
    or by the end of the text. Enough to say "two more to go" — the checker
    does the real splitting. */
export function countSentences(text) {
  const t = cleanText(text);
  if (!t) return 0;
  /* No lookbehind: Safari before 16.4 throws on one (tools/browser-test.mjs). */
  return t.split(/[.!?…]+\s+/u).filter((s) => /\p{L}/u.test(s)).length;
}

/* ---------- the annotations ------------------------------------------------------------ */

/* GreynirCorrect's "could not parse" remark says *þátta*, a word a teenager
   does not know; this says the same plainly. */
const PLAIN = {
  E001: "Yfirlesturinn skildi ekki þessa setningu. Lestu hana aftur: vantar kannski orð?",
};

const str = (x, max) => (typeof x === "string" ? x.slice(0, max) : "");

/**
 * What the checker said, as the app may trust it: offsets inside the text
 * (or none, when a remark could not be placed), short strings, at most
 * `WRITING.maxNotes`, in the order they appear. Anything else is dropped.
 *
 *   { start, end, code, msg, detail, suggest }   start/end: [start, end) in
 *                                                 the text, or null
 */
export function cleanAnnotations(list, text) {
  const len = typeof text === "string" ? text.length : 0;
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const a of list) {
    if (!a || typeof a !== "object") continue;
    let start = Number.isInteger(a.start) ? a.start : null;
    let end = Number.isInteger(a.end) ? a.end : null;
    if (start === null || end === null || start < 0 || end > len || end <= start) { start = null; end = null; }
    const code = str(a.code, 40);
    const msg = PLAIN[code] || str(a.msg, 300);
    if (!msg) continue;
    out.push({ start, end, code, msg, detail: str(a.detail, 400) || null, suggest: str(a.suggest, 120) || null });
    if (out.length >= WRITING.maxNotes) break;
  }
  return out.sort((x, y) => (x.start ?? 1e9) - (y.start ?? 1e9));
}

/**
 * The pupil edited the text: carry the remarks along. The edit is found as
 * the stretch between the common beginning and the common end of the two
 * texts; a remark wholly before it stays, one wholly after it moves by the
 * change in length, and one the edit touches is marked `touched` — that is
 * the pupil fixing it (or changing their mind), and the app moves on.
 *
 * @param {object[]} notes   from `cleanAnnotations`, possibly already followed
 * @returns {object[]} new objects; the input is not changed
 */
export function followEdit(notes, before, after) {
  const a = String(before ?? ""), b = String(after ?? "");
  if (a === b) return notes.map((n) => ({ ...n }));
  let p = 0;
  const min = Math.min(a.length, b.length);
  while (p < min && a[p] === b[p]) p += 1;
  let s = 0;
  while (s < min - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s += 1;
  const editEnd = a.length - s;            // the edited stretch of `before`: [p, editEnd)
  const delta = b.length - a.length;
  return notes.map((n) => {
    if (n.start === null || n.end === null) return { ...n };
    /* An insertion exactly at a remark's edge belongs to it when it is
       inside the word (typing a missing letter at the end of *skólan*). */
    if (n.end < p || (n.end === p && editEnd > p)) return { ...n };
    if (n.start >= editEnd && !(n.start === editEnd && p === editEnd && p > 0 && /\S/.test(a[p - 1] || " ")))
      return { ...n, start: n.start + delta, end: n.end + delta };
    return { ...n, touched: true, start: null, end: null };
  });
}

/** The index of the first remark still to look at (not touched, not
    skipped), from `from` on; -1 when there is none. */
export function nextOpen(notes, from = 0) {
  for (let i = Math.max(0, from); i < notes.length; i++)
    if (!notes[i].touched && !notes[i].skipped) return i;
  return -1;
}

/* ---------- what the progress remembers ------------------------------------------------- */

/** Has the task been finished in the week starting on Monday `week`? */
export const writingDone = (S, week) =>
  !!(S && S.settings && S.settings.writingDone === week && DAY.test(week));

/** Mark it finished: the Monday, and nothing else — not the text, not the
    topic, not how many remarks there were. A setting, so it is a short
    string the server's guard keeps (server/guard.mjs) and a merge takes. */
export function markWritingDone(S, week) {
  if (!S || !DAY.test(String(week))) return;
  (S.settings ||= {}).writingDone = week;
}
