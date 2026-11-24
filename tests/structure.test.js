/* Item 25: the structure of a sentence, marked from its parse.

   Three things are pinned here.
     1. Every mark comes out of the data the build wrote — a role (`r`), a
        recorded phrase (`ph`), a recorded clause (`cl`), a word class (`c`) —
        and a word the build would not vouch for is never marked.
     2. The marks are right by school grammar on sentences read by hand.
     3. No mark is told from another by colour alone, and every colour can be
        read on paper and on the board.
   The hint that uses it (the `syntax` question type) is at the end. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DATA } from "../data/data_bundle.js";
import { buildLexicon } from "../src/js/core/lexicon.js";
import { sentenceStructure, withoutMarks, hasMarks, STRUCTURE_ROLES } from "../src/js/core/structure.js";
import { structureHTML, structureClass } from "../src/js/ui/structure.js";
import { judge } from "../src/js/core/answer.js";
import { blankState, newSession } from "../src/js/core/state.js";

const lex = buildLexicon(DATA);
const HEAD = readFileSync(new URL("../src/head.html", import.meta.url), "utf8");
const RENDER_SRC = readFileSync(new URL("../src/js/ui/render.js", import.meta.url), "utf8");
const byText = (t) => {
  const s = lex.sentences.find((x) => x.t === t);
  assert.ok(s, "the bank no longer has: " + t);
  return s;
};
const SETNINGARHLUTAR = ["frumlag", "umsögn", "andlag", "óbeint andlag", "sagnfylling"];

/** "[Hesturinn]frumlag [borðar]umsögn [gras]andlag ." — a structure as text. */
function written(s, st = sentenceStructure(s)) {
  const open = {}, close = {};
  for (const c of st.clauses) { (open[c.a] ||= []).push("{" + c.kind + ": "); (close[c.b] ||= []).unshift("}"); }
  for (const p of st.parts) { (open[p.a] ||= []).push("["); (close[p.b] ||= []).unshift("]" + p.role); }
  return s.tok.map((t, j) => (open[j] || []).join("") + t.w + (close[j] || []).join("")).join(" ");
}

/* ---------- 1. from the parse only ---------------------------------------- */

test("25: every mark is something the build wrote into the sentence", () => {
  let parts = 0;
  for (const s of lex.sentences) {
    const st = sentenceStructure(s);
    for (const p of st.parts) {
      parts++;
      const toks = s.tok.slice(p.a, p.b + 1);
      const where = `${p.role} „${toks.map((t) => t.w).join(" ")}“ in: ${s.t}`;
      if (SETNINGARHLUTAR.includes(p.role)) {
        const roles = new Set(toks.map((t) => t.r).filter(Boolean));
        assert.deepEqual([...roles], [p.role], "a part's role is its words' own role — " + where);
        if (!p.whole) assert.ok(toks.every((t) => t.r === p.role), "outside a recorded phrase only role words are marked — " + where);
        else assert.ok((s.ph || []).some((r) => r.t === "nl" && !r.i && r.a === p.a && r.b === p.b), "a whole part is a recorded nafnliður — " + where);
      } else if (p.role === "forsetningarliður") {
        assert.ok((s.ph || []).some((r) => r.t === "fl" && r.a === p.a && r.b === p.b), "a forsetningarliður is a recorded one — " + where);
      } else {
        assert.equal(p.role, "samtenging");
        const heads = (s.cl || []).some((c) => c.a === p.a);
        if (p.b > p.a) assert.ok(heads, "a conjunction of several words opens a recorded clause — " + where);
        else assert.ok(toks[0].c === "samtenging" || heads, "a samtenging has that word class — " + where);
      }
    }
    for (const c of st.clauses)
      assert.ok((s.cl || []).some((r) => r.a === c.a && r.b === c.b && r.t === c.kind), "a box is a recorded clause: " + s.t);
  }
  assert.ok(parts > 5000, "the bank should give thousands of marks, got " + parts);
});

test("25: what the build would not vouch for is not marked", () => {
  for (const s of lex.sentences) {
    const st = sentenceStructure(s);
    s.tok.forEach((t, j) => {
      const role = st.roleAt[j];
      /* withdrawn analysis: only as a word of a conjunction the clause table matched */
      if (t.rj) assert.ok(!role || role === "samtenging", `withdrawn word marked ${role}: ${t.w} — ${s.t}`);
      /* a role that is not judged (`rn`), an infinitive or participle (`ra`) */
      if (t.rn) assert.ok(!SETNINGARHLUTAR.includes(role), `unjudged word marked ${role}: ${t.w} — ${s.t}`);
      if (!t.r && t.ra) assert.equal(role, null, `infinitive or participle marked: ${t.w} — ${s.t}`);
      if (/^[.,!?;:]$/.test(t.w)) assert.equal(role, null, "punctuation marked: " + s.t);
      if (role && SETNINGARHLUTAR.includes(role) && !t.r)
        assert.ok(st.parts.some((p) => p.whole && j >= p.a && j <= p.b), `a word without a role marked outside a recorded phrase: ${t.w} — ${s.t}`);
    });
    if (s.ku) assert.equal(st.clauses.length, 0, "clauses boxed in a sentence whose clause structure is not vouched for: " + s.t);
  }
});

test("25: parts never overlap and never cross the edge of a box; boxes nest", () => {
  for (const s of lex.sentences) {
    const { parts, clauses, roleAt } = sentenceStructure(s);
    const seen = new Set();
    for (const p of parts) {
      for (let j = p.a; j <= p.b; j++) {
        assert.ok(!seen.has(j), "two parts on one word: " + s.t);
        seen.add(j);
        assert.equal(roleAt[j], p.role);
      }
      for (const c of clauses)
        assert.ok(p.b < c.a || p.a > c.b || (p.a >= c.a && p.b <= c.b), "a part crosses a box: " + s.t);
    }
    assert.equal(roleAt.filter(Boolean).length, seen.size);
    for (const c of clauses) for (const d of clauses)
      assert.ok(c === d || c.b < d.a || d.b < c.a || (c.a <= d.a && d.b <= c.b) || (d.a <= c.a && c.b <= d.b), "boxes cross: " + s.t);
  }
});

test("25: the function is pure — the same sentence gives the same marks and is not changed", () => {
  for (const s of lex.sentences.slice(0, 200)) {
    const before = JSON.stringify(s);
    const a = sentenceStructure(s), b = sentenceStructure(s);
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(s), before);
  }
});

/* ---------- 2. right by school grammar ------------------------------------- */

test("25: sentences read by hand come out as a teacher would mark them", () => {
  const cases = [
    ["Hesturinn borðar gras.", "[Hesturinn]frumlag [borðar]umsögn [gras]andlag ."],
    ["Á túninu stendur hestur.", "[Á túninu]forsetningarliður [stendur]umsögn [hestur]frumlag ."],
    ["Pabbi minn er kennari.", "[Pabbi minn]frumlag [er]umsögn [kennari]sagnfylling ."],
    ["Bíllinn er rauður.", "[Bíllinn]frumlag [er]umsögn [rauður]sagnfylling ."],
    /* óbeint andlag in the dative before the andlag */
    ["Strákurinn gaf litla hundinum vatn úti í garði.",
      "[Strákurinn]frumlag [gaf]umsögn [litla hundinum]óbeint andlag [vatn]andlag úti í garði ."],
    /* an andlag in the genitive; the adverbial of time is left alone */
    ["Amma naut góðrar heilsu alla ævi.", "[Amma]frumlag [naut]umsögn [góðrar heilsu]andlag alla ævi ."],
    /* the helping verb and the supine are the umsögn; the infinitive after *ætla* is not marked */
    ["Ég hef alltaf haft áhuga á bílum.", "[Ég]frumlag [hef]umsögn alltaf [haft]umsögn [áhuga]andlag [á bílum]forsetningarliður ."],
    ["Ég ætla að hjálpa vini mínum eftir skóla.", "[Ég]frumlag [ætla]umsögn að hjálpa [vini mínum]andlag eftir skóla ."],
    /* two predicatives joined by *og* */
    ["Fjöllin eru há og hvít í vetur.", "[Fjöllin]frumlag [eru]umsögn [há]sagnfylling [og]samtenging [hvít]sagnfylling í vetur ."],
    /* a relative clause and a clause of time, each with its own frumlag and umsögn */
    ["Strákurinn sem sat fyrir aftan mig í bíóinu hló hátt þegar myndin byrjaði.",
      "[Strákurinn]frumlag {tilvísunarsetning: [sem]samtenging [sat]umsögn [fyrir aftan mig]forsetningarliður [í bíóinu]forsetningarliður} "
      + "[hló]umsögn hátt {tíðarsetning: [þegar]samtenging [myndin]frumlag [byrjaði]umsögn} ."],
    /* conjunctions of several words are one samtenging */
    ["Af því að ég var veikur fór ég ekki í skólann.",
      "{orsakarsetning: [Af því að]samtenging [ég]frumlag [var]umsögn [veikur]sagnfylling} [fór]umsögn [ég]frumlag ekki í skólann ."],
    /* a clause inside a clause */
    ["Ég hefði hringt í þig ef ég hefði vitað að þú værir kominn heim.",
      "[Ég]frumlag [hefði hringt]umsögn [í þig]forsetningarliður {skilyrðissetning: [ef]samtenging [ég]frumlag [hefði vitað]umsögn "
      + "{skýringarsetning: [að]samtenging [þú]frumlag [værir]umsögn kominn heim}} ."],
    /* a question word opens a spurnarsetning and is no samtenging */
    ["Ég veit ekki hvar taskan hennar er núna.",
      "[Ég]frumlag [veit]umsögn ekki {spurnarsetning: hvar [taskan hennar]frumlag [er]umsögn núna} ."],
    /* an oblique subject (*Leiknum var frestað*) is where books differ: not marked */
    ["Leiknum var frestað til morguns af því að völlurinn var á kafi í snjó.",
      "Leiknum [var frestað]umsögn til morguns {orsakarsetning: [af því að]samtenging [völlurinn]frumlag [var]umsögn [á kafi]forsetningarliður í snjó} ."],
  ];
  for (const [text, want] of cases) assert.equal(written(byText(text)), want);
});

test("25: a conjunction of several words is never half marked", () => {
  /* *til þess að* and *svo að* in clauses the build did not record: nothing of them is marked */
  const s = byText("Ég hlakka til þess að sumarið komi svo að við getum farið í útilegu.");
  const st = sentenceStructure(s);
  s.tok.forEach((t, j) => {
    if (["til", "þess", "að", "svo"].includes(t.w)) assert.equal(st.roleAt[j], null, t.w);
  });
  for (const x of lex.sentences) {
    const r = sentenceStructure(x).roleAt;
    x.tok.forEach((t, j) => {
      const prev = j ? x.tok[j - 1].w.toLowerCase() : "";
      if (r[j] !== "samtenging" || r[j - 1] === "samtenging") return;
      const w = t.w.toLowerCase();
      assert.ok(!(w === "að" && ["því", "þess", "svo", "þó", "eftir", "til"].includes(prev)), `lone „að“ after „${prev}“: ${x.t}`);
      assert.ok(!(w === "en" && ["áður", "fyrr"].includes(prev)), `lone „en“ after „${prev}“: ${x.t}`);
      assert.ok(!(w === "sem" && prev === "þar"), "lone „sem“ after „þar“: " + x.t);
    });
  }
});

test("25: a subject the parse calls a predicative is not marked as one", () => {
  /* *að prófið væri á föstudaginn*: the data has *prófið* as sagnfylling. */
  const s = byText("Kennarinn sagði að prófið væri á föstudaginn.");
  const j = s.tok.findIndex((t) => t.w === "prófið");
  assert.equal(sentenceStructure(s).roleAt[j], null);
  /* made up: the predicative first, the subject after the verb — kept */
  const t = { tok: [
    { w: "Kennari", c: "nafnorð", r: "sagnfylling", k: "aðalsetning" },
    { w: "er", c: "sagnorð", r: "umsögn", k: "aðalsetning" },
    { w: "hún", c: "fornafn", r: "frumlag", k: "aðalsetning" }, { w: ".", c: null, r: null, k: "aðalsetning" }] };
  assert.equal(written(t), "[Kennari]sagnfylling [er]umsögn [hún]frumlag .");
});

test("25: a sentence with nothing certain gives nothing, and odd input does not throw", () => {
  assert.deepEqual(sentenceStructure({ tok: [] }), { parts: [], clauses: [], roleAt: [] });
  const s = { tok: [{ w: "Úff", c: null, r: null }, { w: "!", c: null, r: null }], cl: [{ a: 0, b: 9, t: "x" }], ph: [{ a: 0, b: 5, t: "fl" }] };
  const st = sentenceStructure(s);
  assert.equal(hasMarks(st), false);
  /* crossing clauses are both left out */
  const x = { tok: "a b c d e".split(" ").map((w) => ({ w, c: "atviksorð", r: null })),
    cl: [{ a: 0, b: 2, t: "tíðarsetning" }, { a: 2, b: 4, t: "skilyrðissetning" }] };
  assert.equal(sentenceStructure(x).clauses.length, 0);
});

/* ---------- hiding marks --------------------------------------------------- */

test("25: withoutMarks takes out the asked role and, when asked, the boxes", () => {
  const s = byText("Strákurinn sem sat fyrir aftan mig í bíóinu hló hátt þegar myndin byrjaði.");
  const st = sentenceStructure(s);
  const h = withoutMarks(st, { hide: ["frumlag"] });
  assert.ok(st.parts.some((p) => p.role === "frumlag"));
  assert.ok(!h.parts.some((p) => p.role === "frumlag") && !h.roleAt.includes("frumlag"));
  assert.equal(h.parts.length, st.parts.length - 2);
  assert.equal(h.clauses.length, 2);
  assert.equal(withoutMarks(st, { clauses: false }).clauses.length, 0);
  assert.equal(st.parts.filter((p) => p.role === "frumlag").length, 2, "the structure itself is not changed");
});

/* ---------- 3. the picture ------------------------------------------------- */

const strip = (html) => html.replace(/<span class="sc-c?name">[^<]*<\/span>/g, "").replace(/<[^>]+>/g, "");

test("25: the HTML is the sentence itself, with a name written under every mark", () => {
  for (const s of lex.sentences) {
    const st = sentenceStructure(s);
    const html = structureHTML(s);
    assert.equal(strip(html).replace(/&#39;/g, "'").replace(/&amp;/g, "&"), s.t, "the words changed: " + s.t);
    for (const role of STRUCTURE_ROLES) {
      const n = st.parts.filter((p) => p.role === role).length;
      assert.equal(html.split(`<span class="sc-name">${role}</span>`).length - 1, n, role + " names: " + s.t);
      assert.equal(html.split(`class="sc ${structureClass(role)}"`).length - 1, n, role + " classes: " + s.t);
    }
    for (const c of st.clauses) assert.ok(html.includes(`<span class="sc-cname">${c.kind}</span>`), s.t);
    assert.equal(html.split("<span").length, html.split("</span>").length, "unbalanced: " + s.t);
  }
});

test("25: a renderer draws its own words, hides a role, and can keep the kind of clause to itself", () => {
  const s = byText("Af því að ég var veikur fór ég ekki í skólann.");
  const html = structureHTML(s, { word: (t, j) => `<b data-j="${j}">${t.w}</b>`, hide: ["umsögn"], kinds: false });
  assert.equal(html.split("<b data-j=").length - 1, s.tok.length - 1, "every word but the full stop goes through `word`");
  assert.ok(!html.includes(">umsögn<") && html.includes(">frumlag<"));
  assert.ok(html.includes('<span class="sc-cname">aukasetning</span>') && !html.includes("orsakarsetning"));
  assert.ok(!structureHTML(s, { clauses: false }).includes("sc-clause"));
  assert.ok(structureHTML({ tok: [{ w: "<i>", r: "frumlag", c: "nafnorð" }] }).includes("&lt;i&gt;"), "words are escaped");
});

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c) => {
  const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const VARS = { frumlag: "--sc-frumlag", "umsögn": "--sc-umsogn", andlag: "--sc-andlag", "óbeint andlag": "--sc-obeint",
  sagnfylling: "--sc-sagnfylling", "forsetningarliður": "--sc-fl", samtenging: "--sc-st", aukasetning: "--sc-clause" };
const block = (selector) => {
  const at = HEAD.indexOf(selector + "{\n  --sc-frumlag");
  assert.ok(at >= 0, "no --sc colours declared for " + selector);
  return HEAD.slice(at, HEAD.indexOf("}", at));
};

test("25: every colour reads on paper and on the board (4.5:1), also on the board's lightest smear", () => {
  const paper = block(":root,.blackboard .verdict"), chalk = block(".blackboard");
  const board = rgb(HEAD.match(/--board:(#[0-9A-Fa-f]{6})/)[1]);
  const smear = [255, 255, 255].map((v, i) => Math.round(v * 0.055 + board[i] * 0.945));
  for (const [role, name] of Object.entries(VARS)) {
    const light = paper.match(new RegExp(name + ":(#[0-9A-Fa-f]{6})")), dark = chalk.match(new RegExp(name + ":(#[0-9A-Fa-f]{6})"));
    assert.ok(light && dark, role + " needs a colour for paper and one for the board");
    assert.ok(ratio(rgb(light[1]), [255, 255, 255]) >= 4.5, `${role} on paper: ${ratio(rgb(light[1]), [255, 255, 255]).toFixed(2)}`);
    assert.ok(ratio(rgb(dark[1]), board) >= 4.5, `${role} on the board: ${ratio(rgb(dark[1]), board).toFixed(2)}`);
    assert.ok(ratio(rgb(dark[1]), smear) >= 4.5, `${role} on the smear: ${ratio(rgb(dark[1]), smear).toFixed(2)}`);
  }
});

test("25: no two marks share a kind of line — colour is never the only difference", () => {
  const shape = (role) => {
    const cls = structureClass(role);
    const m = HEAD.match(new RegExp(`\\.${cls} \\.sc-w\\{([^}]*)\\}`));
    const css = m ? m[1].replace(/\s+/g, " ") : "";
    if (/wavy/.test(css)) return "wavy";
    if (/border-radius:99px/.test(css)) return "ring";
    if (/border:2px solid[^;]*;border-top:none/.test(css)) return "bracket";
    const style = css.match(/border-bottom:\S+ (double|dashed|dotted|solid)/);
    return style ? style[1] : "solid";             // the plain .sc-w line
  };
  const shapes = STRUCTURE_ROLES.map(shape);
  assert.equal(new Set(shapes).size, STRUCTURE_ROLES.length, "kinds of line: " + shapes.join(", "));
  assert.match(HEAD, /\.sc-w\{[^}]*border-bottom:3px solid/);
  assert.match(HEAD, /\.sc-clause\{[^}]*border:2px dashed/);
  for (const role of STRUCTURE_ROLES) assert.ok(HEAD.includes(`.${structureClass(role)}{--c:`), role + " has no colour rule");
  /* and the name is real text, drawn for everyone */
  assert.ok(!/\.sc-name[^{]*\{[^}]*display:none/.test(HEAD));
});

/* ---------- the hint on „Smelltu á rétta orðið“ ---------------------------- */

const pupil = () => { const S = blankState(); S.enabled.setningafraedi = true; return { S, sess: newSession(S) }; };

test("25: the structure hint halves the XP of a syntax answer and is not an error", () => {
  const s = byText("Hesturinn borðar gras.");
  const t = { type: "syntax", skill: "setningafraedi", s, askRole: "andlag", base: 12, lvl: 1, cell: "setn:andlag" };
  const plain = judge(t, { picked: 2 }, pupil());
  const hinted = judge(t, { picked: 2, hinted: true }, pupil());
  assert.equal(plain.ok, true);
  assert.equal(hinted.ok, true);
  assert.deepEqual(hinted.findings, []);
  assert.ok(plain.xp > 0 && hinted.xp < plain.xp && hinted.xp >= Math.floor(plain.xp / 2) && hinted.xp <= Math.ceil(plain.xp / 2),
    `XP ${plain.xp} → ${hinted.xp}`);
  const record = (j) => j.effects.find((e) => e.do === "record");
  assert.equal(record(hinted).hinted, true);
  assert.ok(!("hinted" in record(plain)), "an answer without the hint is recorded exactly as before");
  /* a wrong answer with the hint is still simply wrong */
  assert.equal(judge(t, { picked: 0, hinted: true }, pupil()).ok, false);
});

test("25: the hint never marks the part the question asks for, and is offered only when it has something to show", () => {
  for (const s of lex.sentences) {
    for (const role of new Set(s.tok.map((t) => t.r).filter(Boolean))) {
      const shown = withoutMarks(sentenceStructure(s), { hide: [role] });
      s.tok.forEach((t, j) => { if (t.r === role) assert.equal(shown.roleAt[j], null, `${role} shown in: ${s.t}`); });
      const html = structureHTML(s, { hide: [role] });
      assert.ok(!html.includes(`<span class="sc-name">${role}</span>`), `${role} named in: ${s.t}`);
    }
  }
  /* the renderer: the button and the marks come from the plan the builder
     made (item 26, tests/hint.test.js), and the response says whether it was used */
  const fn = RENDER_SRC.slice(RENDER_SRC.indexOf("RENDER.syntax = function"), RENDER_SRC.indexOf("/* Whether a click is right for a role"));
  assert.match(fn, /hintButtonHTML\(t\)/);
  assert.match(RENDER_SRC, /codedHTML\(t, pickWord\)/);
  assert.match(fn, /judge\(t, \{ picked: t\.picked, hinted: !!t\.hinted \}, app\)/);
});
