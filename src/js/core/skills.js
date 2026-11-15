/* Skills. Everything that is "per kind" — XP, levels, difficulty, badges and
   settings — reads from here, so a new skill is one entry and nothing else. */

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
  { id: "setningafraedi", nm: "Setningafræði",  cur: "9.b", ico: "🌳",
    ds: "Frumlag, umsögn, andlag, aðal- og aukasetningar" },
  /* v6.9: the grammar used, not just named — find and fix errors in a text,
     build a sentence from word cards, rewrite a sentence. */
  { id: "malbeiting",   nm: "Málbeiting",       cur: "8.b", ico: "✍️",
    ds: "Villuveiðar, setningasmiðja og umritun: tíð, tala, þolmynd, orðaröð" },
  /* Years 9-10. Off by default like everything outside year 8, until the
     adult switches it on in the Stillingar og námsefni tab. */
  { id: "setningagerd", nm: "Setningagerðir",   cur: "9.b", ico: "🪜",
    ds: "Aðalsetning, aukasetning og nafnháttarsetning" },
];

export const SKILL_IDS = SKILLS.map((s) => s.id);
export const skillById = (id) => SKILLS.find((s) => s.id === id) || null;
export const skillName = (id) => (skillById(id) || {}).nm || id;

/** Default on/off per skill. Year 9 is off until the adult turns it on. */
export function defaultEnabled() {
  const out = {};
  SKILLS.forEach((s) => { out[s.id] = s.cur === "8.b"; });
  return out;
}

