# -*- coding: utf-8 -*-
"""The sentence bank.

The sentences themselves are in content/setningar/setningar.tsv, one per line
(critique item 82): a teacher can read and edit them there without reading
Python. This module reads that file and gives the build the list it always
had, `S`, and keeps what is not content: the format, the rules for writing a
sentence, and the GROUPS a `need` may name.

Every entry is a complete, natural Icelandic sentence. Greynir parses each one
at build time (build_sentences.py) and produces, per token: word class, BÍN
mark, syntactic role and clause type. Everything the app asks about a sentence
is read out of that annotation — nothing grammatical is written here by hand.

    (level, text, slot, need[, options])      as the build sees it
    þyngd  setning  orð  þörf  ekki eyða       the columns of the file

  level   1-7; controls length and clause depth
            lvl 1  3-5 words      lvl 4   9-11
            lvl 2  5-7            lvl 5   11 and up
            lvl 3  7-9
          Levels 1-5 are year 8 and are told apart by length. 6 and 7 are
          years 9 and 10 (docs/CURRICULUM.md) and are told apart from 5 by
          what is IN the sentence, not by its length alone:
            lvl 6  11 words and up, and at least one of: two subordinate
                   clauses, þolmynd ("var frestað", "voru haldnir"),
                   viðtengingarháttur þátíðar ("ef ég hefði vitað"), óbein
                   ræða ("sagði að hún kæmi"), a noun phrase of four words
                   or more ("litli brúni hundurinn hennar ömmu minnar")
            lvl 7  15 words and up, three clauses or more, as a rule two of
                   those constructions together
          The build enforces the two minimum lengths (build_sentences.py
          MIN_WORDS); the constructions are the writer's to keep.
  slot    the lemma of the noun that may be blanked out and swapped for
          another noun; None when the sentence has no such noun
  need    which nouns may stand in the slot instead of the one written:
          class names from noun_classes.py joined with "|", or one of the
          groups below. "none" keeps the sentence usable with its own noun
          only. A sentence whose slot stands next to an adjective, a pronoun
          or the article is never substituted into (the agreement would
          break), whatever `need` says.
          Four names are both a class and a group that adds to it: `person`
          (+ job), `place` (+ building, room, settlement), `text` (+ book),
          `small`/`item` and the rest below. Write "=place" or "=book" for
          the class alone: "úti í garðinum" takes a `=place`, not a bathroom.
          The noun written in the sentence need not belong to `need`; it is
          shown where the sentence is used as it stands.
  options an optional dict: {"nofill": True} means the sentence is never used
          as a cloze (the case after the preposition depends on what is
          meant), though it still serves the analysis questions. In the
          file: "já" in the column `ekki eyða`.
          The file has one more column, `athugasemd`, a free comment the
          build does not read.

WHAT A SLOT NEEDS
-----------------
The blank is only as good as its `need`. "Ég drekk ___" with `thing` produces
"Ég drekk bílinn"; with `drink` it produces Icelandic. Ask of every slot: which
nouns could an Icelander put here without the listener blinking? Then say
exactly that. Nouns the classifier does not know are `abstract`, and only
`any` and `abstract` slots take them — the safe direction.

Read what a need produces before trusting it:

    node _grammar-audit/sample.mjs 6        every open frame with six nouns
    node _grammar-audit/sample-adj.mjs      every adjective frame, every fit
    node _grammar-audit/sample-tasks.mjs    the questions themselves, as text

What reading them taught (v6.5): a verb of lying, standing or waiting wants a
narrower class than a verb of seeing or talking ("Kýrin liggur á borðinu",
"Sníkjudýr biðu úti"); `group` does not do what people do ("Stjórnirnar hlaupa
út í garð"); `event` after *hlakka til* is a party and after *vegna* anything;
and the frames that honestly take any noun are the ones about talking,
thinking, remembering, pictures and causes (*um*, *frá*, *eftir*, *af*,
*vegna*, *án*).

Three rules learned the hard way, kept here so they are not learned again:

  1. Use the past tense for a transitive verb with *ég*: "Ég sé hestana"
     parses as the subjunctive of *vera* and the object comes out nominative.
  2. Where the gender should stay free, keep the subject *ég*, *við* or
     something ungendered. A masculine subject pins the blank to masculine
     nouns (`rk`), and the frame then serves one gender in three.
  3. A numeral predicative ("Klukkan er þrjú") fixes the number of the
     subject; the build refuses such a sentence. A numeral BESIDE the blank
     is fine — it pins the gender, which the build reads.

WRITING FOR LEVELS 6 AND 7
--------------------------
A long sentence gives the parser more room to go wrong, and most of what it
gets wrong it gets wrong SILENTLY: the guard checks that a mark exists in BÍN,
not that it is the right reading. Of about 345 candidates written for these two
levels 217 were kept. Run every candidate through tools/try-sentences.py and
read every token before it goes in. What turned up, so it need not be found
again:

  1. A viðtengingarháttur that looks like another word is read as that word:
     *færi, færum* (færa), *læsi, læsum* (læsa), *kynni* (kynna), *lyki*
     (lúka), *skylli*, *hefðum* before a bare noun (hefða), *sér þætti* (sjá +
     þáttur). Use another verb or *myndi* + infinitive.
  2. A past participle that BÍN also lists as an adjective comes out as a
     lýsingarorð in the masculine and feminine: *stöðvaður, opnaður, sendur,
     reknar, spurður, flokkaður, farinn*. A þolmynd with a dative subject
     ("leiknum var frestað") or one of the participles already in the bank
     (*byggð, lesin, sýnd, haldinn, skrifuð, bakað, flutt, valin*) is safe.
  3. *hvers vegna* stops the build; write *af hverju*. *fyrir hundrað árum*
     stops it too.
  4. *svo* + adjective + *að*, a relative *þar sem* after a noun in the main
     clause and a cleft ("það var ekki fyrr en … að") put the clause boundary
     in the wrong place. *og*, *eða*, *en* after a subordinate clause leave
     the clause structure unvouched (`ku`).
  5. A neuter subject of *byrja* ("áður en fríið byrjaði") is marked
     accusative. Check the case of every subject.
  6. Read the lemmas as well: *liðsins* came out as *liður*.
  7. Read the small words too. Nothing checks an uninflected word's class:
     *sér* in "að sér hefði verið kennt" came out as an adverb, *vita* in
     "láta sig vita" as an adverb, *upp* in "rétta upp hönd" and *niður* in
     "skrifa niður allt" as prepositions, a stranded *í* ("sem amma ólst upp
     í") as an adverb, *þá* in "reiður við þá" as the adverb.
  8. An adjective right before a noun is a frame other adjectives are put
     into. Use one only where *góður, ungur, gamall, lítill, stór* would all
     read well in its place; *margir* and *flestir* count as adjectives.

WHY SOME SLOTS SAY `none`
-------------------------
"Hundurinn geltir" is true of dogs. "Sólin skín" is true of the sun. Such a
sentence is still asked as a cloze with its own noun, and used for every
other question type; it is simply not a template.
"""

# Groups a `need` may name. Expanded by the build into class lists, so the
# app never sees a group name.
GROUPS = {
    # everything, abstract nouns included
    "any": "person job group animal critter plant body food drink clothing vehicle "
           "furniture object struct substance nature weather place building "
           "room settlement sky money text book film music time event abstract",
    # what can be seen, touched or visited — not ideas, weather or times
    "concrete": "person job group animal critter plant body food drink clothing vehicle "
                "furniture object struct substance nature place building room "
                "settlement book",
    # a visible thing that is not alive and not a place
    "thing": "object clothing food drink book furniture vehicle plant",
    # fits in a hand or a bag
    "small": "object clothing food book",
    # a human being: `job` is the part of `person` that names an occupation,
    # `child` the part that is a child or a pupil (v6.13 review, S2)
    "person": "job child",
    # people and animals
    "living": "person job animal",
    # people, animals and collectives
    "being": "person job group animal",
    # somewhere one can be
    "spot": "place building room settlement struct nature",
    # a place, of any kind
    "place": "building room settlement",
    # something read: the content, and the thing it is printed in
    "text": "book",
    # a made thing one owns, carries, sits on or travels in — no food or drink
    "item": "object clothing book furniture vehicle",
    # what one notices and mentions having seen: "Ég sá ___ í gær".
    # `critter` (insects, sea creatures) is here and in `any`/`concrete` only.
    "sight": "person job animal critter vehicle building plant",
    # what has a name of its own: "Ég man ekki nafn ___"
    "named": "person job animal settlement building film book",
}


# The bank: content/setningar/setningar.tsv. An empty `orð` is a sentence with
# no slot (slot and need None); `ekki eyða` = "já" adds the options dict.
def _bank():
    import content_io
    out = []
    for r in content_io.rows("setningar/setningar.tsv", [
            ("þyngd", "int"), ("setning", "text"), ("orð", "opt"), ("þörf", "opt"),
            ("ekki eyða", "flag"), ("athugasemd", "str")]):
        if (r["orð"] is None) != (r["þörf"] is None):
            raise content_io.ContentError(
                "%s:%d: „orð“ og „þörf“ eru annaðhvort bæði útfyllt eða bæði auð / slot and need "
                "go together" % (r.file, r.line))
        e = (r["þyngd"], r["setning"], r["orð"], r["þörf"])
        out.append(e + (({"nofill": True},) if r["ekki eyða"] else ()))
    return out


S = _bank()
