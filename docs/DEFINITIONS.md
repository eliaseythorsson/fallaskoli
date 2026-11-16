# Word definitions: how the gap gets filled

## Where things stand

Nearly every word the program teaches has a definition. They come from ÍNO
wherever the extract has one and from the hand-written table in
`definitions.py` otherwise — `build_bundle.py` prints the split. The words
without one are listed, each with the reason, in `data/ino-report.json`
(`unmatched`), and `node tools/checkdefs.mjs` follows a definition through every
hand-off to the screen. No figure is repeated here, because it would be out of
date at the next build. Meaning questions are only drawn from words that have a
definition, so any gap is silent.

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
   and inside it one **XML** file of some tens of MB — not JSON (the one in this
   repository is `islensk_nutimamalsordabok_2026-02.xml`). The admin page
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
   Or, without a rebuild: upload the same `data/ino.json` as the administrator, under **Umsjón** (the dataset box).
   `PUT /admin/dataset` reads the identical shape, and the status line then
   shows the count, the date and the source.

   **Check the build's own line.** `build_bundle.py` prints what it found:

   ```
   ÍNO found: <n> entries (format 2)
   definitions attached: <n> (ÍNO <n>, hand-written <n>)
   ```

   A count in single or double digits means the file is not what it should be —
   the build reads either the flat map or `{"entries": …}`, and counts only
   entries that actually carry a `def`. It warns below 100 rather than
   attaching nothing in silence.
4. **On a server**, `/definitions` serves the same data set and
   `core/definitions.js` switches from `bundledSource` to
   `[remoteSource, bundledSource]`: `GET /definitions?bin_id=…` answers one word
   at a time (cached in the browser), with the bundled definition as the
   fallback. The bundled file still carries the definitions of the words the
   program teaches, so it works offline and opened from a file.

## What this opened up

Meaning questions are drawn from nearly the whole vocabulary, and words that
once showed only lookup links (*bar*, *bekkur* …) have a real definition. The
definitions are ÍNO's (CC BY-SA 4.0), so ShareAlike applies to the built file
(README, *Licences*).
