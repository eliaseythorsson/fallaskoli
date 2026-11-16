/* Orðaforði, "Hvert á ekki heima í hópnum?" (or_utundan): the explanation
   is grammatical and the groups are what it says they are (v6.13 review, M2).

   Until then the explanation was "*a, b, c* eru öll ${KIND}", which agrees
   with almost no kind ("eru öll drykkir", "eru öll matur"), and the groups
   came straight from the noun classes made for generated sentences: the
   kind's own name as a member (*drykkur*, *matur*, *bygging*), a mushroom as
   a plant, saliva and fish skin as body parts, a mirror as furniture, and
   *baðker* and *baðkar* as two members of one group. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { freshView, poolLex } from "./pools.js";
import { typeById } from "../src/js/tasks/index.js";
import { oddMember, ODD_KINDS } from "../src/js/tasks/ordaford.js";
import { seeded } from "../src/js/core/duel.js";

const lex = poolLex();
const spec = typeById("or_utundan");
function builds(n = 400) {
  const out = [];
  for (let s = 0; s < n; s++) {
    const b = spec.build(lex, freshView(1 + (s % 5)), seeded(31000 + s));
    if (b) out.push(b.task);
  }
  return out;
}
const TASKS = builds();

/* the kind in the plural after "þetta eru allt", and "matur" after "þetta er allt" */
const WHY = /^\*([^*]+)\*, \*([^*]+)\* og \*([^*]+)\*: þetta (eru allt (dýr|drykkir|farartæki|föt|húsgögn|líkamshlutar|plöntur|starfsheiti|veðurfyrirbæri|byggingar)|er allt matur)\. \*([^*]+)\* er ekki (dýr|drykkur|matur|farartæki|flík|húsgagn|líkamshluti|planta|starfsheiti|veðurfyrirbæri|bygging)\.$/;

test("or_utundan: the explanation agrees with its kind, whatever the words", () => {
  assert.ok(TASKS.length > 350, TASKS.length);
  for (const t of TASKS) {
    const m = WHY.exec(t.why);
    assert.ok(m, t.why);
    assert.doesNotMatch(t.why, /\böll\b/);
    const odd = m[6];
    assert.equal(odd.toLowerCase(), t.answer, t.why);
    assert.deepEqual([m[1], m[2], m[3], t.answer].sort(), [...t.options].sort(), t.why);
    /* the singular said of the odd word is the plural's own kind */
    const pl = m[5] || "matur", sg = m[7];
    const pair = { dýr: "dýr", drykkir: "drykkur", matur: "matur", farartæki: "farartæki", föt: "flík",
      húsgögn: "húsgagn", líkamshlutar: "líkamshluti", plöntur: "planta", starfsheiti: "starfsheiti",
      veðurfyrirbæri: "veðurfyrirbæri", byggingar: "bygging" };
    assert.equal(pair[pl], sg, t.why);
  }
});

test("or_utundan: every word is one the reviewed list allows, of the kind the sentence names", () => {
  for (const t of TASKS) {
    const ws = t.options.map((o) => lex.nouns.find((w) => w.o === o && oddMember(w, w.s)));
    assert.ok(ws.every(Boolean), t.options.join(", "));
    const kinds = ws.map((w) => w.s);
    const groupKind = kinds.find((k, _, a) => a.filter((x) => x === k).length === 3);
    assert.ok(groupKind, t.options.join(", "));
    assert.notEqual(ws.find((w) => w.o === t.answer).s, groupKind);
    assert.equal(new Set(t.options).size, 4);
  }
});

test("or_utundan: what the review found, and the rest of its kind, never comes up", () => {
  const never = [
    /* the kinds' own names and words for the whole */
    "dýr", "gæludýr", "drykkur", "matur", "máltíð", "farartæki", "ökutæki", "fatnaður", "flík", "líkami", "líffæri",
    "planta", "jurt", "veður", "bygging",
    /* not of the kind */
    "sveppur", "þörungur", "lauf", "rót", "fræ", "munnvatn", "roð", "tár", "sviti", "fingrafar", "spegill",
    "ísskápur", "eldavél", "koddi", "sæng", "teppi", "jarðskjálfti", "myrkur", "alda", "gufa", "heimili", "safn",
    "skór", "stígvél",
    /* one word twice */
    "baðkar", "baðker", "kisi", "kló", "hauskúpa"];
  const seen = new Set(TASKS.flatMap((t) => t.options));
  assert.deepEqual(never.filter((w) => seen.has(w)), []);
  for (const k of ODD_KINDS)
    for (const w of lex.nouns.filter((x) => oddMember(x, k))) assert.ok(!never.includes(w.o), `${k}: ${w.o}`);
});

test("or_utundan: no kind holds two spellings of one word", () => {
  const lev = (a, b) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };
  /* one letter apart and different words, read one by one */
  const fine = new Set(["tunga/lunga", "kuldi/kaldi", "skóli/skáli"]);
  for (const k of ODD_KINDS) {
    const ws = lex.nouns.filter((w) => oddMember(w, k)).map((w) => w.o);
    assert.equal(new Set(ws).size, ws.length, k);
    assert.ok(ws.length >= 7, `${k}: ${ws.length}`);
    for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++)
      if (lev(ws[i], ws[j]) <= 1) assert.ok(fine.has(`${ws[i]}/${ws[j]}`) || fine.has(`${ws[j]}/${ws[i]}`), `${k}: ${ws[i]}/${ws[j]}`);
  }
});

test("or_utundan: no wrong-sense definition is printed for the odd word", () => {
  for (const t of TASKS) for (const d of t.defs || [])
    assert.ok(!["kaffi", "verslun", "búð", "blóm", "hjól", "bolur", "kisa", "hross", "þumall", "vör", "kviður"].includes(d.o), d.o);
});
