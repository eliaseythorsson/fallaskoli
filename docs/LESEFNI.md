# Lesefni — for the teacher who reads it through

The twenty pages in `src/js/content/lessons.js` were drafted by an AI model
(Claude) for 8th–10th grade. The tables on them are not hand-written: they are
filled from BÍN when the page is drawn (`src/js/core/lessons.js`). The prose and
the examples are, and should be read by a teacher before the pages are relied on.

To change a page, edit `src/js/content/lessons.js` and run `./build.sh`. The
format is described at the top of `src/js/core/lessons.js`; `npm test` fails if a
table names a word BÍN does not have.

## Points the author was least sure of

1. **Stýfður boðháttur** is taught as the bare form (*kom, far*), with *komdu*
   as the ordinary form with *þú* attached — following the glossary.
2. **Sterk/veik nafnorð**: eignarfall eintölu ends in a consonant (usually -s or
   -ar) = sterk; vowel in every singular case = veik. *faðir, móðir, bróðir* only
   mentioned as irregular; *gleði, keppni* count as veik.
3. **Kennimyndir**: four for strong verbs, three for weak; the table shows four
   columns for every verb and the text says so. The last is called
   "lýsingarháttur þátíðar eða sagnbót".
4. **Sagnbót** listed as a fourth fallháttur (some books treat it as a form of
   lýsingarháttur þátíðar).
5. **Veik beyging lýsingarorða** after greinir, ábendingarfornafn, laus greinir and
   eignarfornafn; ávarp (*kæri vinur*) left out.
6. **Stigbreyting**: *-legur → -legri, -legastur* as its own pattern; *dauður*
   does not compare; *hissa* with *meira/mest*.
7. **Raðtölur** all weak except *annar*; strong *fyrstur* not mentioned.
8. **Forsetningar með tveimur föllum**: hreyfing/dvöl only for *í, á, undir,
   yfir*; for *með, við, eftir, fyrir* the page says the meaning decides.
9. **Ópersónulegar sagnir**: *mig langar / mig vantar*, *ég hlakka til*; the
   subject is called "frumlag í þolfalli/þágufalli" (older books: frumlagsígildi).
10. **Þolmynd**: only the agreeing type (*Bækurnar voru lesnar*), not *Stráknum var hjálpað*.
11. **Boðháttur** described as always 2. persóna; *förum!* ignored.
12. **sem** called a samtenging, as in the glossary.
13. **Setningagerðir**: *ætla að / fara að / vera að* + nafnháttur not addressed.
    *og, en, eða* the only aðaltengingar named.
14. **Beint/óbeint andlag** defined by meaning (the thing given vs. the receiver).

## Glossary entries (core/glossary.js) the author thinks are off

Not changed; the pages do not contradict them.

- **sagnfylling** names only *vera* and *verða*; usual teaching adds *heita, þykja, kallast*.
- **upphrópun** lists *já, nei, takk* (as BÍN does); some books call *já/nei* atviksorð.
- **stofn**: "sést í þolfalli eintölu" holds for strong masculine nouns; for
  feminine and neuter the stem is usually read from nefnifall.
- **ópersónuleg sögn**: "ekkert frumlag í nefnifalli. Frumlagið stendur þá í
  þolfalli eða þágufalli" is slightly self-contradictory and leaves out *það rignir*.
- **frumstig / efsta stig**: the abbreviations FVB and EVB point to the degree
  only, so hovering them says nothing about the weak inflection.
