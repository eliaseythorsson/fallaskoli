# Word definitions: how the gap gets filled

## Where things stand

6,510 words out of 6,564 have a definition (99%); the 54 without one are
listed with the reason at the end of `data/ino-report.json`. They come from ÍNO wherever
the extract has one and from the hand-written table in `definitions.py`
otherwise — `build_bundle.py` prints the split. Meaning questions are only drawn
from words that have a definition, so any gap is silent; before the ÍNO extract
arrived it was 75 words.

## No, the program should not call Árnastofnun

Íslensk nútímamálsorðabók has no open web API. A program firing one request per
word would be both fragile (it stops working when the website changes) and
impolite (we would be using a site meant for people as a database).

It is also unnecessary. ÍNO is published under **CC BY-SA 4.0** and is
downloadable. What the build environment cannot reach is `arnastofnun.is` and
`clarin.is` — that is a network condition in this box, not a property of the
dictionary.

## The right route, in four steps

1. **Fetch the extract** from Árnastofnun/CLARIN, outside this environment. This
   is manual work done once. What arrives is `islensk_nutimamalsordabok.zip`,
   and inside it one **XML** file of about 38 MB — not JSON. The admin page
   will not take it, and should not: see the next step.
2. **Convert it once**, on the owner's own machine:

   ```
   node tools/ino.mjs islensk_nutimamalsordabok.xml
   ```

   This writes `data/ino.json` with the shape
   `{ "<bin_id>": { "def": "...", "example": "..." } }`.
   `bin_id` is the key, not the lemma — otherwise *ljós* (noun) and *ljós*
   (adjective) get the same definition. The XML carries no bin_ids, only
   lemmas, so the tool joins on lemma **and word class** against
   `lexicon.json`. A homograph with no word class to tell the two apart is
   left out rather than given a definition that may belong to the other word —
   the same rule `parse_guard.py` applies to grammar.

   It keeps only the words the program teaches, which is why the result is
   small enough to send through a browser. `--allt` keeps the rest as well;
   `--skoda` prints what is actually in the XML and changes nothing — run that
   first if Árnastofnun have renamed the elements, then name them with
   `--fletta --ord --flokkur --skyring --daemi`.

   The conversion happens here, once, and not in the browser or the server:
   neither the child's file nor the always-running process should carry an XML
   parser for a job that is done a single time.
3. **`build_bundle.py` picks it up automatically** if the file exists: it is
   read, joined on `bin_id`, and `definitions.py` becomes the fallback for what
   is missing. Nothing else in the build changes.
   Or, without a rebuild: upload the same `data/ino.json` on the **Gögn** tab.
   `PUT /admin/dataset` reads the identical shape, and the status line then
   shows the count, the date and the source. The program fetches the whole set
   once, at start-up, through `GET /definitions/all` — never one request per
   word.

   **Check the build's own line.** `build_bundle.py` prints what it found:

   ```
   ÍNO found: 6237 entries
   definitions attached: 6237 (ÍNO 6237, hand-written 12)
   ```

   A count in single or double digits means the file is not what it should be —
   the build reads either the flat map or `{"entries": …}`, and counts only
   entries that actually carry a `def`. It warns below 100 rather than
   attaching nothing in silence.
4. **On a server**, `/definitions` serves the same data set and
   `core/definitions.js` switches from `bundledSource` to
   `[remoteSource, bundledSource]`. The file the child opens then does not have
   to carry 50,000 definitions with it.

## What this opens up

Meaning questions go from about 6,200 words to very nearly the
whole vocabulary, and *bar*, *bekkur* and the rest that currently show only
lookup links get a real definition. This is the largest single change still
outstanding.
