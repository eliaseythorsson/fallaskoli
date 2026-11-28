/* Skills. Everything that is "per kind" — XP, levels, difficulty, badges and
   settings — reads from here, so a new skill is one entry and nothing else.

   `cur` is the year in which the category is usually first taught, as the
   curriculum map has it (core/curriculum.js, docs/CURRICULUM.md). It is not a
   code from the aðalnámskrá: the national text sets criteria for the end of
   year 10 only and names no year for anything. A category runs on through
   the later years; what a later year adds inside it is in the map's nodes.
   A test keeps these labels equal to the map.

   `placement` is the skill's turn in the placement round (core/placement.js):
   what a pupil has known longest first, so the round opens with something
   familiar, and the two categories of year 10 last. `placementTwice`: asked a
   second time, because that is where most of the practice will be.

   What else a skill needs — a lesson page, curriculum nodes, error patterns,
   skill-map nodes, a builders file — is listed by
   tests/skills-checklist.test.js, which names the file to fill in. */

import { presetContent } from "./curriculum.js";

export const SKILLS = [
  { id: "nafnord",      nm: "Nafnorð",          cur: "8.b", ico: "🧱", placement: 1, placementTwice: true,
    ds: "Föll, tala, greinir, kyn" },
  { id: "lysingarord",  nm: "Lýsingarorð",      cur: "8.b", ico: "🎨", placement: 3, placementTwice: true,
    ds: "Sterk og veik beyging, stigbreyting, samræmi" },
  { id: "sagnord",      nm: "Sagnorð",          cur: "8.b", ico: "⚙️", placement: 2, placementTwice: true,
    ds: "Persóna, tíð, háttur, mynd, sterk/veik beyging" },
  { id: "fornofn",      nm: "Fornöfn og greinir", cur: "8.b", ico: "👉", placement: 5,
    ds: "Gerðir fornafna, laus og viðskeyttur greinir" },
  { id: "toluord",      nm: "Töluorð",          cur: "8.b", ico: "🔢", placement: 7,
    ds: "Frumtölur og raðtölur" },
  { id: "obeygjanleg",  nm: "Óbeygjanleg orð",  cur: "8.b", ico: "🔗", placement: 8,
    ds: "Atviksorð, forsetningar, samtengingar, upphrópanir" },
  { id: "greining",     nm: "Orðflokkagreining", cur: "8.b", ico: "🔍", placement: 4,
    ds: "Þekkja alla ellefu orðflokkana í texta" },
  { id: "fallstjorn",   nm: "Fallstjórn",       cur: "8.b", ico: "🧭", placement: 6,
    ds: "Hvaða falli sögn eða forsetning stýrir" },
  { id: "ordaford",     nm: "Orðaforði",        cur: "8.b", ico: "💬", placement: 9,
    ds: "Merking orða með eigin orðum" },
  /* Year 10: the school plans and the year-10 textbook that could be read put
     setningarhlutar and aðal-/aukasetningar there (v6.13; they said 9.b). */
  { id: "setningafraedi", nm: "Setningafræði",  cur: "10.b", ico: "🌳", placement: 11,
    ds: "Frumlag, umsögn, andlag, aðal- og aukasetningar" },
  /* v6.9: the grammar used, not just named — find and fix errors in a text,
     build a sentence from word cards, rewrite a sentence. */
  { id: "malbeiting",   nm: "Málbeiting",       cur: "8.b", ico: "✍️", placement: 10,
    ds: "Villuveiðar, setningasmiðja og umritun: tíð, tala, þolmynd, orðaröð" },
  /* Year 10. Off by default like everything outside year 8, until the
     adult switches it on in the Stillingar og námsefni tab. */
  { id: "setningagerd", nm: "Setningagerðir",   cur: "10.b", ico: "🪜", placement: 12,
    ds: "Aðalsetning, aukasetning og nafnháttarsetning" },
  /* Issue #19 (docs/DLD-PLAN.md §1, §5): the word track as a skill of its
     own — the pupil's six words in learning (core/wordknowledge.js), with
     its own þyngd, mastery and node on the Færnikort, on in every year and
     one of the NEW_SKILLS that share Lota dagsins (core/today.js). Its
     question types are those about a word in learning; the first are being
     built (#11, #14, #15). Until one is filed here the skill has none, and
     everything that plans questions passes it by (`skillHasTypes`). */
  { id: "namsord",      nm: "Námsorð",          cur: "8.b", ico: "🌱", placement: 13,
    ds: "Orðin sem þú ert að læra: merking og notkun" },
  /* Issue #30 (docs/DLD-PLAN.md §4): reading short stories and subject texts
     (content/textar/). For every year, so year 8 and on by default. Last in
     the placement round: it is the one question there with a text to read. */
  { id: "lesskilningur", nm: "Lesskilningur",   cur: "8.b", ico: "📖", placement: 14,
    ds: "Að finna aðalatriðið í stuttum sögum og fræðitextum" },
  /* Issue #35 (docs/DLD-PLAN.md §5): telling stories with MAIN's six icons
     — first ordering a story and finding what is missing, on the stories of
     content/textar/. For every year, so year 8 and on by default; last in
     the placement round, where its types (none follows the band) are not
     asked. */
  { id: "frasogn",      nm: "Frásögn",          cur: "8.b", ico: "🧩", placement: 15,
    ds: "Að byggja upp sögu: röð atburða og hlutar sögukortsins" },
];

export const SKILL_IDS = SKILLS.map((s) => s.id);
export const skillById = (id) => SKILLS.find((s) => s.id === id) || null;
export const skillName = (id) => (skillById(id) || {}).nm || id;

/** Default on/off per skill: the categories of year 8, as the curriculum map
    has them. Later years are off until the adult turns them on. */
export function defaultEnabled() {
  const year8 = new Set(presetContent(8).skills);
  const out = {};
  SKILLS.forEach((s) => { out[s.id] = year8.has(s.id); });
  return out;
}

