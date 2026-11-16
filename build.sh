#!/bin/bash
# Fallaskóli — full build.
#
# Regenerates every byte of data from pinned sources, validates every parse
# against BÍN and the government table, runs the tests, and refuses to finish
# if the data changed since the last accepted build.
#
#   ./build.sh            build and verify
#   ./build.sh --accept   accept a reviewed change to the data (manifest)
#
# Needs Python 3.10+ (PYTHON=/path/to/python3 to choose one), Node 18+, and
# for the browser checks a Chromium (CHROME_PATH=/path/to/chrome).
set -euo pipefail

ACCEPT=""
[ "${1:-}" = "--accept" ] && ACCEPT="--accept"
export PYTHONHASHSEED=0        # so the build is reproducible word for word

echo "── 1. dependencies ─────────────────────────────────────────────────"
py_ok() { "$1" -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)' 2>/dev/null; }
PY=""
if [ -n "${PYTHON:-}" ]; then
  py_ok "$PYTHON" || { echo "  PYTHON=$PYTHON is not Python 3.10 or newer." >&2; exit 1; }
  PY="$PYTHON"
else
  for candidate in python3.14 python3.13 python3.12 python3.11 python3.10 python3 python; do
    command -v "$candidate" >/dev/null 2>&1 || continue
    if py_ok "$candidate"; then PY="$candidate"; break; fi
  done
fi
if [ -z "$PY" ]; then
  echo "  This build needs Python 3.10 or newer (macOS ships 3.9: install one" >&2
  echo "  from python.org or Homebrew, then open a new terminal)." >&2
  exit 1
fi
echo "  python: $("$PY" -c 'import platform,sys;print(platform.python_version(),"—",sys.executable)')"

"$PY" -m pip --version >/dev/null 2>&1 || "$PY" -m ensurepip --upgrade >/dev/null 2>&1 || true
"$PY" -m pip --version >/dev/null 2>&1 || {
  echo "  $PY has no pip (Debian/Ubuntu: apt install -y python3-pip)." >&2; exit 1; }
if [ "$(uname -s)" = "Linux" ] && [ "$(uname -m)" = "aarch64" ]; then
  echo "  NOTE: islenska/reynir ship no ARM Linux wheels; pip will compile them." >&2
fi
PIP_FLAGS=""
"$PY" -m pip install --help 2>/dev/null | grep -q -- "--break-system-packages" && PIP_FLAGS="--break-system-packages"
"$PY" -m pip install -r requirements.txt $PIP_FLAGS -q
npm ci --no-audit --no-fund --silent 2>/dev/null || npm install --no-audit --no-fund --silent

echo "── 2. frequency list (committed, not fetched) ──────────────────────"
if command -v sha256sum >/dev/null 2>&1; then sha256sum -c freq_raw.sha256
elif command -v shasum >/dev/null 2>&1; then shasum -a 256 -c freq_raw.sha256
else echo "  Neither sha256sum nor shasum found." >&2; exit 1; fi

echo "── 3. data ─────────────────────────────────────────────────────────"
"$PY" build_freq.py        # repair encoding, rank lemmas   -> freq_lemmas.json
"$PY" build_lexicon.py     # paradigms out of BÍN           -> lexicon.json
"$PY" build_sentences.py   # parse + guard every token      -> sentences.json
"$PY" build_bundle.py      # lexicon + sentences + classes + definitions -> data/data_bundle.js
"$PY" build_exercises.py   # exercises.py, every form looked up in BÍN -> data/exercises.js
node tools/licenses.mjs    # requirements.txt + package.json -> data/licenses.js
node tools/coverage.mjs --json | tail -14

echo "── 4. manifest ─────────────────────────────────────────────────────"
node tools/manifest.mjs $ACCEPT

echo "── 5. tests ────────────────────────────────────────────────────────"
node --test tests/*.test.js

echo "── 6. bundle ───────────────────────────────────────────────────────"
node tools/build.mjs          # ES modules -> dist/fallaskoli-v<version>.html

echo "── 7. real Chromium on the built file ──────────────────────────────"
# The browser test exits 2 when, and only when, no Chromium is available.
set +e; node tools/browser-test.mjs; RC=$?; set -e
if [ "$RC" = "2" ]; then echo "  (skipped: no Chromium — set CHROME_PATH)"
elif [ "$RC" != "0" ]; then echo "  THE BROWSER TEST FAILED (code $RC)."; exit "$RC"; fi

# The guided first run (item 84) has a test of its own: the browser test
# above starts from a new pupil hundreds of times to check other things.
set +e; node tools/tour-test.mjs; RC=$?; set -e
if [ "$RC" = "2" ]; then echo "  (skipped: no Chromium — set CHROME_PATH)"
elif [ "$RC" != "0" ]; then echo "  THE FIRST-RUN TEST FAILED (code $RC)."; exit "$RC"; fi

echo "── 8. the server and the app together ──────────────────────────────"
set +e; node tools/server-test.mjs; RC=$?; set -e
if [ "$RC" = "2" ]; then echo "  (skipped: no Chromium — set CHROME_PATH)"
elif [ "$RC" != "0" ]; then echo "  THE SERVER TEST FAILED (code $RC)."; exit "$RC"; fi

echo
echo "built dist/$(node --input-type=module -e 'import {HTML_NAME} from "./tools/version.mjs"; process.stdout.write(HTML_NAME)')"
