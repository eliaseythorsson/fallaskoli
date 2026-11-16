/* Setningafræði: frumlag, umsögn, andlag, sagnfylling.

     syntax       click the word that has the role asked for
     setn_hlut    which part of the sentence is the marked word
     setn_flokka  sort the heads of the parts of one sentence

   The roles (`r` on each token) come from the parse and passed the guard; the
   builders read them and infer nothing. */

import { bandOf } from "../core/difficulty.js";
import { built } from "./effects.js";
import { pick, bandFor, forcedCell } from "./shared.js";

/* ================= Setningarhlutar ======================================= */

export function taskSyntax(lex, view, rng) {
  const { sess } = view;
  const P = view.policy;
  const b = Math.min(Math.max(3, bandOf(sess, "setningafraedi")), P.maxLevel);
  const usable = lex.sentences.filter((x) => P.level(x.lvl));
  const pool = usable.filter((s) => s.tok.some((t) => t.r) && s.lvl <= b);
  if (!pool.length && !usable.length) return null;
  /* A review (tasks/review.js) asks for the role that was missed. */
  const fc = forcedCell(view);
  const has = (x) => x.tok.some((t) => "setn:" + t.r === fc);
  const from = !fc ? (pool.length ? pool : usable) : pool.some(has) ? pool.filter(has) : usable.filter(has);
  if (!from.length) return null;
  const s = pick(from, rng);
  const roles = [...new Set(s.tok.filter((t) => t.r).map((t) => t.r))];
  if (!roles.length) return null;
  const askRole = fc ? fc.slice(5) : pick(roles, rng);
  return built({
    type: "syntax", skill: "setningafraedi", s, askRole, picked: null,
    base: 12, cell: "setn:" + askRole, lvl: s.lvl,
  });
}

/* ================= Choose and sort (v6.11) =============================== */

const ROLES = ["frumlag", "umsögn", "andlag", "sagnfylling"];
/* The head of the part, not a word inside it: *miklu* in *miklu máli* carries
   the role of the phrase, and naming it "andlag" on its own teaches the
   wrong thing. A predicative adjective is the head of its part. */
const roleHead = (t, s, i) => !t.rn && !(t.ra || []).length && ROLES.concat("óbeint andlag").includes(t.r)
  && (["nafnorð", "sagnorð"].includes(t.c) || (t.c === "lýsingarorð" && t.r === "sagnfylling")
    /* a pronoun on its own (*Ég*, *þeim*), not one beside a noun (*verkefnið sitt*) */
    || (t.c === "fornafn" && !["nafnorð"].includes((s.tok[i - 1] || {}).c) && (s.tok[i + 1] || {}).c !== "nafnorð"));

export function synRole(lex, view, rng) {
  const P = view.policy;
  const b = Math.max(3, bandFor(view, "setningafraedi"));
  /* A review (tasks/review.js) asks for the role that was missed — the
     indirect object too, though it is otherwise kept for þyngd 4. */
  const fc = forcedCell(view);
  const roles = b >= 4 || fc === "setn:óbeint andlag" ? [...ROLES, "óbeint andlag"] : ROLES;
  const hits = [];
  lex.sentences.forEach((s) => {
    if (!P.level(s.lvl) || s.lvl > b) return;
    s.tok.forEach((t, i) => {
      if (roles.includes(t.r) && roleHead(t, s, i) && (!fc || "setn:" + t.r === fc)) hits.push({ s, i, t });
    });
  });
  if (!hits.length) return null;
  const h = pick(hits, rng);
  return built({
    type: "choice", skill: "setningafraedi", s: h.s, i: h.i, mark: true,
    title: "Hvaða setningarhluti?", question: `Hvert er hlutverk orðsins *${h.t.w}* í setningunni?`,
    options: roles, answer: h.t.r,
    why: { frumlag: "Frumlagið er sá eða það sem gerir eitthvað eða er eitthvað (*hver/hvað?*).",
      umsögn: "Umsögnin er sögnin sem segir hvað frumlagið gerir.",
      andlag: "Andlagið er það sem sögnin beinist að (*hvern/hvað?*), oft í aukafalli.",
      sagnfylling: "Sagnfylling fylgir sögnum eins og *vera, verða, heita* og lýsir frumlaginu.",
      "óbeint andlag": "Óbeint andlag er sá sem fær eitthvað (*gaf **henni** bókina*), oftast í þágufalli." }[h.t.r],
    base: 10, lvl: h.s.lvl, cell: "setn:" + h.t.r, word: null, tags: ["syn"], miss: ["setningalidir"],
  });
}

export function synSort(lex, view, rng) {
  const P = view.policy;
  const b = Math.max(3, bandFor(view, "setningafraedi"));
  for (let k = 0; k < 40; k++) {
    const s = pick(lex.sentences.filter((x) => P.level(x.lvl) && x.lvl <= b), rng);
    if (!s) return null;
    const idx = s.tok.map((t, j) => (ROLES.includes(t.r) && roleHead(t, s, j) ? j : -1)).filter((j) => j >= 0);
    const kinds = new Set(idx.map((j) => s.tok[j].r));
    if (idx.length < 3 || kinds.size < 3 || idx.length > 5) continue;
    return built({
      type: "sort", skill: "setningafraedi", s, items: idx.map((j) => ({ w: s.tok[j].w, j, cls: s.tok[j].r })),
      buckets: ROLES, title: "Flokkaðu setningarhlutana",
      question: "Hvert er hlutverk hvers undirstrikaðs orðs?",
      base: 4 + 3 * idx.length, lvl: s.lvl, cell: "sort:setn", word: null, tags: ["syn"],
    });
  }
  return null;
}

export const TYPES = [
  { id: "syntax", skill: "setningafraedi", weight: 8, renderer: "syntax",
    tags: ["syn"],
    bands: [1, 4, 5],
    build: taskSyntax },
  { id: "setn_hlut", skill: "setningafraedi", weight: 5, renderer: "choice",
    tags: ["syn"],
    bands: [1, 4, 5],
    build: synRole },
  { id: "setn_flokka", skill: "setningafraedi", weight: 4, renderer: "sort",
    tags: ["syn"],
    bands: [1, 4, 5],
    build: synSort },
];
