/* Skills. Everything that is "per kind" — XP, levels, difficulty, badges and
   settings — reads from here, so a new skill is one entry and nothing else.

   `cur` is the year in which the category is usually first taught, as the
   curriculum map has it (core/curriculum.js, docs/CURRICULUM.md). It is not a
   code from the aðalnámskrá: the national text sets criteria for the end of
   year 10 only and names no year for anything. A category runs on through
   the later years; what a later year adds inside it is in the map's nodes.
   A test keeps these labels equal to the map. */

import { presetContent } from "./curriculum.js";

export const SKILLS = [
  { id: "nafnord",      nm: "Nafnorð",          cur: "8.b", ico: "🧱",
    ds: "Föll, tala, greinir, kyn" },
  { id: "lysingarord",  nm: "Lýsingarorð",      cur: "8.b", ico: "🎨",
    ds: "Sterk og veik beyging, stigbreyting, samræmi" },
  { id: "sagnord",      nm: "Sagnorð",          cur: "8.b", ico: "⚙️",
    ds: "Persóna, tíð, háttur, mynd, sterk/veik beyging" },
  { id: "fornofn",      nm: "Fornöfn og greinir", cur: "8.b", ico: "👉",
    ds: "Gerðir fornafna, laus og viðskeyttur greinir" },
  { id: "toluord",      nm: "Töluorð",          cur: "8.b", ico: "🔢",
    ds: "Frumtölur og raðtölur" },
  { id: "obeygjanleg",  nm: "Óbeygjanleg orð",  cur: "8.b", ico: "🔗",
    ds: "Atviksorð, forsetningar, samtengingar, upphrópanir" },
  { id: "greining",     nm: "Orðflokkagreining", cur: "8.b", ico: "🔍",
    ds: "Þekkja alla ellefu orðflokkana í texta" },
  { id: "fallstjorn",   nm: "Fallstjórn",       cur: "8.b", ico: "🧭",
    ds: "Hvaða falli sögn eða forsetning stýrir" },
  { id: "ordaford",     nm: "Orðaforði",        cur: "8.b", ico: "💬",
    ds: "Merking orða með eigin orðum" },
  /* Year 10: the school plans and the year-10 textbook that could be read put
     setningarhlutar and aðal-/aukasetningar there (v6.13; they said 9.b). */
  { id: "setningafraedi", nm: "Setningafræði",  cur: "10.b", ico: "🌳",
    ds: "Frumlag, umsögn, andlag, aðal- og aukasetningar" },
  /* v6.9: the grammar used, not just named — find and fix errors in a text,
     build a sentence from word cards, rewrite a sentence. */
  { id: "malbeiting",   nm: "Málbeiting",       cur: "8.b", ico: "✍️",
    ds: "Villuveiðar, setningasmiðja og umritun: tíð, tala, þolmynd, orðaröð" },
  /* Year 10. Off by default like everything outside year 8, until the
     adult switches it on in the Stillingar og námsefni tab. */
  { id: "setningagerd", nm: "Setningagerðir",   cur: "10.b", ico: "🪜",
    ds: "Aðalsetning, aukasetning og nafnháttarsetning" },
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

