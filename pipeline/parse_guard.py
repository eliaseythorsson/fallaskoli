# -*- coding: utf-8 -*-
"""The guard over the parse.

This is the answer to the flaw found when v5 was rebuilt: Greynir had parsed
*fyrir okkur* as accusative when it is dative, and nothing in the build noticed.
A newer Greynir then changed its mind — also silently.

The surface form *okkur* is in BÍN both ÞGFFT and ÞFFT of *ég*. It is therefore
not decidable from the surface, and the preposition *fyrir* governs both cases.
No parser can resolve this; the only right move is not to ask.

The guard runs four checks on every token:

  1. MARK VALIDITY (hard error)
     Does the mark Greynir produced actually exist in BÍN for this surface form
     and this lemma? If not, the parse is wrong and the build stops.

  2. AMBIGUITY (soft — the token is annotated)
     Which of the form's inflectional features are not determined by the
     surface? They are recorded in `u` (uncertain). The program never asks about
     a feature that is in `u`. It is therefore impossible to ask a question with
     more than one correct answer, whichever way the parser jumped.

  3. GOVERNMENT (hard error)
     Does the case the preposition or verb takes contradict the table in
     government.py? Then the parse is wrong and the build stops.

  4. CLAUSE STRUCTURE (soft — the sentence is annotated)
     Is there an island of main clause in the middle of a subordinate clause,
     with no verb? That was the other thing that changed between versions (*um
     bók* became a main clause inside an infinitive clause). Such a sentence gets
     `ku` and the program then says nothing about its clause structure.

Hard errors stop the build. Soft annotations are counted, and the count goes into
data/manifest.json — so if it changes between builds, the build also fails.
"""

import re
import government

CASE_OF_MARK = (("NF", "nf"), ("ÞGF", "þgf"), ("ÞF", "þf"), ("EF", "ef"))

# ---------------------------------------------------------------------------
# BÍN and Greynir do not spell the same mark quite the same way. These rewrites
# are *formatting*, not grammar: they let us compare the marks without relaxing
# the check itself. Everything that remains is a genuine disagreement.
# ---------------------------------------------------------------------------

# BÍN adds prefixes Greynir omits: SP- (interrogative, "þarftu"),
# OP-ÞF-/OP-ÞGF-/OP-það- (impersonal verbs, "mig langar", "það rignir").
_BIN_PREFIXES = re.compile(r"^(SP-|OP-(ÞF|ÞGF|það)-|OP-)")

# BÍN marks on personal pronouns carry no gender — gender is a property of the
# lemma (hann/hún/það), not of the inflection. Greynir prefixes it anyway.
_GENDER_PREFIX = re.compile(r"^(KK|KVK|HK)-")

_PERSON = re.compile(r"(^|-)([123]P)(-|$)")


def _strip_bin_prefixes(mark):
    out = mark
    while True:
        nxt = _BIN_PREFIXES.sub("", out)
        if nxt == out:
            return out
        out = nxt


def _drop_person(mark):
    return re.sub(r"-[123]P(?=-|$)", "", mark)


def marks_compatible(greynir_mark, bin_mark):
    """Is the mark Greynir produced the same mark BÍN has, formatting aside?

    This is deliberately tolerant about formatting and deliberately strict about
    content. Greynir may be *coarser* than BÍN (omitting person on an impersonal
    verb), but it may not say a different case, number, gender or mood.
    """
    if not greynir_mark or not bin_mark:
        return False
    g = greynir_mark
    b = _strip_bin_prefixes(bin_mark)
    if g == b:
        return True
    if _GENDER_PREFIX.sub("", g) == b:
        return True
    if _GENDER_PREFIX.sub("", g) == _GENDER_PREFIX.sub("", b):
        return True
    # Greynir omits person on impersonal verbs: GM-FH-ÞT-ET.
    if _PERSON.search(b) and not _PERSON.search(g) and _drop_person(b) == g:
        return True
    return False


# Word classes that do not inflect: they should never carry an inflection mark.
# If the parser puts a mark on an adverb, that is an error in the parse, not in
# BÍN.
UNINFLECTED = {"atviksorð", "forsetning", "samtenging", "upphrópun",
               "nafnháttarmerki"}

# The order matters: ÞGF has to be tested before ÞF, or "ÞF" grabs the wrong
# part of "ÞGFETgr". Test the longest prefixes first.
_CASE_PREFIXES = (("ÞGF", "þgf"), ("NF", "nf"), ("ÞF", "þf"), ("EF", "ef"))


def case_of(mark):
    """The case in a BÍN mark, or None if the mark carries no case."""
    if not mark:
        return None
    for part in str(mark).split("-"):
        for pref, name in _CASE_PREFIXES:
            if part.startswith(pref):
                rest = part[len(pref):]
                if rest.startswith("ET") or rest.startswith("FT"):
                    return name
    return None


def number_of(mark):
    """The number in a BÍN mark: "ÞGFFTgr", "FSB-KK-NFET", and the verb marks,
    where it stands alone ("GM-FH-NT-3P-FT"). Before v6.4 a verb mark had no
    number as far as this function was concerned, so nothing that compared a
    subject with its verb ever compared anything."""
    if not mark:
        return None
    for part in str(mark).split("-"):
        if part == "ET":
            return "et"
        if part == "FT":
            return "ft"
        for pref, _ in _CASE_PREFIXES:
            if part.startswith(pref):
                rest = part[len(pref):]
                if rest.startswith("ET"):
                    return "et"
                if rest.startswith("FT"):
                    return "ft"
    return None


def strength_of(mark):
    """sterk / veik for an adjective mark, None when the mark has neither
    (the comparative, which BÍN does not divide)."""
    for part in str(mark or "").split("-"):
        if part in ("FSB", "ESB"):
            return "sterk"
        if part in ("FVB", "EVB"):
            return "veik"
    return None


def gender_of(mark):
    for part in str(mark or "").split("-"):
        if part in ("KK", "KVK", "HK"):
            return part
    return None


def definite_of(mark):
    if not mark:
        return None
    return str(mark).endswith("gr")


def degree_of(mark):
    for part in str(mark or "").split("-"):
        if part in ("FSB", "FVB"):
            return "frumstig"
        if part in ("MST", "MSTSB"):
            return "miðstig"
        if part in ("ESB", "EVB"):
            return "efsta stig"
    return None


def mood_of(mark):
    for part in str(mark or "").split("-"):
        if part in ("FH", "VH", "BH", "NH", "SAGNB", "LHNT", "LHÞT"):
            return part
    return None


def tense_of(mark):
    for part in str(mark or "").split("-"):
        if part in ("NT", "ÞT"):
            return part
    return None


class Guard:
    """Holds BÍN and collects errors. One instance per build."""

    def __init__(self, bin_pkg, overrides=None, score=None):
        self.b = bin_pkg
        self.hard = []      # errors that stop the build
        self.soft = []      # annotations that are counted
        self.rejected = []  # tokens a declared decision took out of circulation
        self.relemma = []   # tokens withdrawn because the lemma is implausible
        self.withdrawn = [] # tokens withdrawn by a declared decision
        self._cache = {}
        self._ov = overrides
        self._ov_used = set()
        # corpus frequency of (lemma, class), for check_lemma
        self._score = score or (lambda lemma, ofl: 0)

    # -- 0. the lemma itself -------------------------------------------------

    # How much commoner the competing lemma has to be before Greynir's choice
    # is judged implausible. *sáum* as present tense of *sá* (to sow) rather
    # than past tense of *sjá*: 886 against 25,174.
    LEMMA_RATIO = 25
    # classes a noun or verb reading is also weighed against: a form that is
    # overwhelmingly a pronoun or an adverb is not a rare noun
    FUNCTION_CLASSES = ("pfn", "fn", "afn", "abfn", "ao", "fs", "st", "nhm", "uh", "gr")

    def check_lemma(self, sent, i, tok, bin_ofl):
        """Is the lemma Greynir chose a plausible reading of this surface form?

        The mark check (below) asks whether the form exists in BÍN under the
        chosen lemma. It does — *sáum* IS a form of *sá*, *höfðum* IS a form
        of *höfða*, *nöfnum* IS a form of *nafni* — so the mark check passes
        and the analysis is wrong in a way nothing downstream can see: the
        child would be told *höfðum* is present tense. Two tests catch it:

          1. the form is not a core form of the chosen lemma at all, but is a
             core form of another lemma of the same class (*húsum* -> *húsi*);
          2. another lemma of the same class has this form and is LEMMA_RATIO
             times commoner in the corpus (*sá* against *sjá*).

        Either way the token's analysis is withdrawn (`rj`), the sentence is
        kept, and the build prints what happened so the sentence can be
        rewritten. Nouns and verbs only: adjective lemmas are a matter of
        convention between Greynir and BÍN (*síðari*/*síðastur*), and the
        mark is right either way.
        """
        if tok.get("c") not in ("nafnorð", "sagnorð") or not tok.get("m"):
            return True
        if self._ov and self._ov.lemma_rejected(tok["w"], tok["l"]):
            self.relemma.append((sent, i, tok["w"], tok["l"], tok.get("m"),
                                 "yfirlýst í pipeline/parse_overrides.py: þetta lemma á ekki við hér"))
            tok["m"] = None
            tok["rj"] = True
            return False
        classes = ("kk", "kvk", "hk") if tok["c"] == "nafnorð" else ("so",)
        form = tok["w"]
        entries = []
        for w in {form, form.lower()}:
            try:
                entries += self.b.lookup_ksnid(w)[1]
            except Exception:
                pass
        # every core reading of the form, in any class, with its corpus score
        alts = {}
        for m in entries:
            if m.hluti != "alm" or m.birting != "K":
                continue
            alts[(m.ord, m.ofl)] = max(alts.get((m.ord, m.ofl), 0),
                                       self._score(m.ord, m.ofl))
        if not alts:
            return True
        if self._ov and self._ov.lemma_accepted(form, tok["l"]):
            return True
        mine = [v for (o, c), v in alts.items() if o == tok["l"] and c in classes]
        same_class = {k: v for k, v in alts.items() if k[1] in classes}
        # a noun or verb read where a function word stands: *úti*, *hún*
        function = {k: v for k, v in alts.items() if k[1] in self.FUNCTION_CLASSES}
        reason = None
        if not mine:
            # not a core form of the chosen lemma — of what, then?
            pool = same_class or alts
            b2 = max(pool.values())
            reason = (f"{form!r} er ekki mynd af {tok['l']!r} í BÍN-kjarna heldur af "
                      f"{sorted(f'{o}·{c}' for (o, c), v in pool.items() if v == b2)!r}")
        else:
            rivals = {k: v for k, v in same_class.items() if k[0] != tok["l"]}
            rivals.update(function)
            if rivals:
                best = max(rivals.values())
                if max(mine) * self.LEMMA_RATIO < best:
                    who = sorted(f"{o}·{c}" for (o, c), v in rivals.items() if v == best)
                    reason = (f"{form!r} er lesið sem {tok['l']!r} (tíðni {max(mine):.0f}) "
                              f"en er miklu líklegar mynd af {who!r} (tíðni {best:.0f})")
        if reason is None:
            return True
        self.relemma.append((sent, i, tok["w"], tok["l"], tok.get("m"), reason))
        tok["m"] = None
        tok["rj"] = True
        return False

    # -- BÍN look-up ---------------------------------------------------------

    def marks_for(self, form, lemma=None, ofl=None):
        """Every BÍN mark this surface form can carry.

        The general vocabulary first (birting=K, hluti=alm) — the same filter
        the vocabulary uses. A word BÍN files under a specialised heading
        (*fiðla* under music, *jól* under festivals, *laugardagur* under time)
        is not in that set, and used to pass unverified; it is now checked
        against its own heading instead. A form that is only found with a
        small first letter is a common word standing first in its sentence."""
        key = (form, lemma, ofl)
        if key in self._cache:
            return self._cache[key]
        out = []
        tries = [form]
        if form[:1].isupper():
            tries.append(form[:1].lower() + form[1:])
        for f in tries:
            try:
                _, entries = self.b.lookup_ksnid(f)
            except Exception:
                entries = []
            entries = [m for m in entries if m.birting == "K"
                       and (lemma is None or m.ord == lemma)
                       and (ofl is None or m.ofl == ofl) and m.mark]
            core = [m.mark for m in entries if m.hluti == "alm"]
            out = core or [m.mark for m in entries]
            if out:
                break
        self._cache[key] = out
        return out

    def withdraw(self, sent, i, tok, why):
        """A declared decision (parse_overrides.py): this token's analysis is
        not used. The word stays in the sentence as text."""
        self.withdrawn.append((sent, i, tok["w"], tok.get("c"), tok.get("m"), why))
        tok["m"] = None
        tok["c"] = None
        tok["r"] = None
        tok["g"] = None
        tok.pop("ra", None)
        tok["rj"] = True

    # -- 1. markgildi --------------------------------------------------------

    def check_mark_exists(self, sent, i, tok, bin_ofl):
        """Does the mark exist in BÍN for this surface form? A hard error if not."""
        mark = tok.get("m")
        if not mark:
            return True
        cands = self.marks_for(tok["w"], tok["l"], bin_ofl)
        if not cands:
            # The word is not in the BÍN core under this lemma/word class. There
            # is then nothing to verify against — we assert nothing, but record.
            self.soft.append(("ekki-í-BÍN", sent, i, tok["w"], mark))
            return True
        if any(marks_compatible(mark, c) for c in cands):
            return True
        # Some marks Greynir produces are coarser than BÍN's (e.g. LHÞT with
        # no inflection). Accept that if any BÍN mark starts the same way.
        if any(c.startswith(mark) or mark.startswith(c) for c in cands):
            return True

        # A declared decision? Then the analysis is withdrawn, not silenced.
        if self._ov:
            why = self._ov.reason_for(sent, i, tok["w"])
            if why:
                self._ov_used.add((sent, i, tok["w"]))
                self.rejected.append((sent, i, tok["w"], mark, why))
                tok["m"] = None
                tok["rj"] = True
                return True

        self.hard.append(
            f"{sent!r} tákn {i} ({tok['w']!r}, lemma {tok['l']!r}): Greynir gaf "
            f"markið {mark!r} en BÍN hefur aðeins {sorted(set(cands))!r}"
        )
        return False

    # -- 2. ambiguity --------------------------------------------------------

    def uncertain_features(self, toks, i, bin_ofl, governor_case, possessor=False,
                           allowed_cases=None):
        """Which inflectional features are *not* determined by anything we can
        verify — neither by the surface form, the government, nor the syntactic
        role.

        This is not the same as \"the surface form is ambiguous\". The form
        *hjálpa* can be an infinitive or a 1st-person indicative, but in \"Ég
        hjálpa kennaranum\" it is the predicate with a 1st-person singular
        subject, and only one analysis remains. That analysis is verified, not
        guessed.

        *okkur* in \"fyrir okkur\", on the other hand, is both accusative and
        dative in BÍN, and *fyrir* governs both. Nothing verifiable separates
        them, so the case goes into `u` and the program never asks about it. That
        is the kind of error that slipped through silently in v5.
        """
        tok = toks[i]
        mark = tok.get("m")
        if not mark:
            return []
        cands = self.marks_for(tok["w"], tok["l"], bin_ofl)
        if len(cands) <= 1:
            return []

        # ---- narrowing 0: cases the position rules out ----------------------
        # No preposition governs the nominative and no object stands in it, so
        # after *með* the form *verkefnið* (NF and ÞF) is accusative. The cases
        # the position allows come from the caller; a reading in any other case
        # is dropped before anything is called uncertain.
        if allowed_cases:
            narrowed = [c for c in cands if case_of(c) is None or case_of(c) in allowed_cases]
            if narrowed:
                cands = narrowed

        # ---- narrowing 1: the verb's syntactic role ------------------------
        # A predicate is a finite verb form. Infinitives, participles, the
        # supine and the imperative cannot be a predicate with a subject, so they
        # drop out.
        role = tok.get("r")
        if tok.get("c") == "sagnorð" and role == "umsögn":
            finite = [c for c in cands if mood_of(c) in ("FH", "VH")]
            if finite:
                cands = finite

        # ---- narrowing 2: agreement with the subject -----------------------
        subj = self._subject_of(toks, i)
        if tok.get("c") == "sagnorð" and subj:
            sp, sn = subj
            narrowed = [c for c in cands
                        if (sp is None or self._person_of(c) in (None, sp))
                        and (sn is None or number_of(c) in (None, sn))]
            if narrowed:
                cands = narrowed

        # ---- narrowing 3: government and the role of the case-bearing word -
        case_settled = governor_case is not None
        if role in ("frumlag", "sagnfylling"):
            case_settled = True          # subject and predicative: nominative
        # A noun standing as the possessor of another ("þak hússins", "bíll
        # pabba") is in the genitive by its position; *pabba* being accusative
        # and dative as well does not make the case uncertain here.
        if possessor and case_of(mark) == "ef":
            case_settled = True
        if not case_settled and tok.get("c") != "sagnorð":
            vc = self._verb_government_of(toks, i)
            if vc is not None:
                case_settled = True

        # ---- narrowing 4: a subject's number is the number of its verb ------
        # "Þetta eru bara orð": *orð* is both NFET and NFFT, but *eru* is only
        # plural, so the noun is plural. The verb's number is read off its own
        # form, which is verified, so nothing is asserted here.
        number_settled = False
        if role == "frumlag" and tok.get("c") in ("nafnorð", "fornafn", "töluorð"):
            vn = self._predicate_number(toks, i)
            if vn is not None:
                narrowed = [c for c in cands if number_of(c) in (None, vn)]
                if narrowed and len(narrowed) < len(cands):
                    cands = narrowed
                number_settled = len({number_of(c) for c in cands} - {None}) <= 1

        out = []
        if not case_settled and len({case_of(c) for c in cands} - {None}) > 1:
            out.append("fall")
        if not number_settled and len({number_of(c) for c in cands} - {None}) > 1:
            out.append("tala")
        if len({definite_of(c) for c in cands if case_of(c)} - {None}) > 1:
            out.append("greinir")
        if len({degree_of(c) for c in cands} - {None}) > 1:
            out.append("stig")
        if len({mood_of(c) for c in cands} - {None}) > 1:
            out.append("háttur")
        if len({tense_of(c) for c in cands} - {None}) > 1:
            out.append("tíð")
        if len({self._person_of(c) for c in cands} - {None}) > 1:
            out.append("persóna")
        return out

    @staticmethod
    def _person_of(mark):
        m = _PERSON.search(str(mark or ""))
        return m.group(2) if m else None

    @staticmethod
    def _subject_of(toks, verb_i):
        """(person, number) of the subject standing with this verb, if it can be
        found. Personal pronouns give the person; nouns are 3rd person."""
        best = None
        for j, t in enumerate(toks):
            if t.get("r") != "frumlag":
                continue
            if abs(j - verb_i) > 4:
                continue
            num = number_of(t.get("m"))
            if t.get("x") == "pfn":
                lemma = t.get("l")
                per = {"ég": "1P", "þú": "2P"}.get(lemma, "3P")
            else:
                per = "3P"
            if best is None or abs(j - verb_i) < best[2]:
                best = (per, num, abs(j - verb_i))
        return (best[0], best[1]) if best else None

    def _predicate_number(self, toks, noun_i):
        """The number of the finite verb this subject stands with, if the verb
        form itself settles it (every BÍN reading of the form agrees)."""
        for j in range(max(0, noun_i - 3), min(len(toks), noun_i + 4)):
            t = toks[j]
            if j == noun_i or t.get("c") != "sagnorð" or t.get("r") != "umsögn":
                continue
            cands = self.marks_for(t["w"], t["l"], "so")
            finite = [c for c in cands if mood_of(c) in ("FH", "VH")]
            nums = {number_of(c) for c in (finite or cands)} - {None}
            return next(iter(nums)) if len(nums) == 1 else None
        return None

    @staticmethod
    def _verb_government_of(toks, i):
        """The case the nearest preceding verb governs, if the table gives a single
        case and this token is its object."""
        if toks[i].get("r") not in ("andlag", "óbeint andlag"):
            return None
        for j in range(i - 1, max(-1, i - 5), -1):
            t = toks[j]
            if t.get("c") == "sagnorð":
                allowed = government.VERB_CASES.get(t.get("l"))
                if allowed and len(allowed) == 1:
                    return next(iter(allowed))
                return None
        return None

    # -- 3. government -------------------------------------------------------

    def check_preposition(self, sent, i, toks):
        """Preposition: the case that follows has to be permitted.

        Returns the case the preposition governs here, or None if it cannot be
        confirmed. Only a confirmed case is used in a government question, so the
        question cannot be wrong."""
        prep = toks[i]
        lemma = prep.get("l") or prep.get("w")
        table = government.PREP_CASES.get(lemma)

        # The next case-bearing word, within three tokens. The scan stops at
        # the infinitive marker or a verb: in "bað mig um að hjálpa henni", *um*
        # governs the infinitive clause, not the dative on *henni*. Without that
        # stop, the guard wrongly concluded that *um* takes the dative.
        nxt = None
        for j in range(i + 1, min(i + 4, len(toks))):
            t = toks[j]
            if t.get("c") in ("nafnháttarmerki", "sagnorð", "samtenging"):
                break
            if case_of(t.get("m")):
                nxt = t
                break
        if nxt is None:
            return None

        parsed = case_of(nxt["m"])

        if table is not None and parsed not in table:
            self.hard.append(
                f"{sent!r}: forsetningin {lemma!r} fékk {parsed} á "
                f"{nxt['w']!r}, en taflan leyfir aðeins {sorted(table)!r}"
            )
            return None

        # If the table gives a single case, it is safe regardless of Greynir.
        if table is not None and len(table) == 1:
            return next(iter(table))

        # Two cases in the table: only safe if the surface form is unambiguous.
        if "fall" in (nxt.get("u") or []):
            return None
        return parsed

    def check_verb(self, sent, i, tok):
        """Greynir's verb government, verified against the table."""
        gov = tok.get("g") or []
        lemma = tok.get("l")
        table = government.VERB_CASES.get(lemma)
        if table is None:
            return gov or None
        bad = [c for c in gov if c not in table]
        if bad:
            self.hard.append(
                f"{sent!r}: sögnin {lemma!r} fékk stjórn {bad!r} úr þáttun, "
                f"en taflan leyfir aðeins {sorted(table)!r}"
            )
            return None
        return gov or None

    # -- 4. clause structure -------------------------------------------------

    def check_clauses(self, sent, toks):
        """An island of main clause inside a subordinate clause, with no verb, is
        a sign that the parse failed to attach the phrase in the right place.
        That is what happened with *um bók* in 'Kennarinn sagði að við ættum að
        skrifa ritgerð um bók sem við höfum lesið.'"""
        labels = [t.get("k") for t in toks]
        n = len(labels)
        suspicious = False
        i = 0
        while i < n:
            if labels[i] != "aðalsetning":
                i += 1
                continue
            j = i
            while j < n and labels[j] == "aðalsetning":
                j += 1
            run = list(range(i, j))
            # Skip the full stop — the final token is always marked main clause.
            run = [k for k in run if toks[k].get("w") not in (".", "!", "?")]
            before_sub = i > 0 and labels[i - 1] not in (None, "aðalsetning")
            after_sub = j < n and labels[j] not in (None, "aðalsetning")
            has_verb = any(toks[k].get("c") == "sagnorð" for k in run)
            if run and before_sub and after_sub and not has_verb:
                suspicious = True
                self.soft.append(
                    ("aðalsetningareyland", sent, i,
                     " ".join(toks[k]["w"] for k in run), None)
                )
            i = j
        return suspicious

    # -- result --------------------------------------------------------------

    def check_overrides_all_used(self):
        """An exemption that no longer matches is dangerous: it could be hiding a
        new error somewhere else, or it could be forgotten rubbish. Either way,
        it should stop the build."""
        if not self._ov:
            return
        stale = self._ov.unused(self._ov_used)
        for (s, i, w) in stale:
            self.hard.append(
                f"Ónotuð undanþága í pipeline/parse_overrides.py: tákn {i} ({w!r}) í "
                f"{s!r} er ekki lengur í ágreiningi. Fjarlægðu færsluna — "
                f"annars gæti hún hulið nýja villu síðar."
            )

    def report(self):
        counts = {}
        for kind, *_ in self.soft:
            counts[kind] = counts.get(kind, 0) + 1
        return {"hard": len(self.hard), "soft": counts,
                "rejected": len(self.rejected)}

    def raise_if_hard(self):
        if not self.hard:
            return
        print("\n" + "=" * 72)
        print(f"ÞÁTTUNARVILLUR: {len(self.hard)}. Smíðin stöðvast.")
        print("=" * 72)
        for e in self.hard:
            print("  ✗", e)
        print()
        print("Þetta þýðir að þáttarinn og fallstjórnartaflan eru ósammála.")
        print("Annaðhvort er þáttunin röng (þá á setningin að fara út eða")
        print("breytast) eða taflan er röng (þá á að leiðrétta government.py).")
        print("Hvorugt má gerast þegjandi — þess vegna stöðvast smíðin hér.")
        raise SystemExit(3)
