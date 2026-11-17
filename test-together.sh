#!/usr/bin/env bash
# Fallaskóli — try the multi-user version on this computer before it goes on a real server.
#
#   ./test-together.sh                  FOUR test pupils on this computer, side by side in one
#                                       page, each already logged in: answer in each, watch the
#                                       leaderboard, challenge each other to duels (tools/quad.mjs)
#   ./test-together.sh --reset          the same, with four fresh pupils
#   ./test-together.sh --lan            people on the SAME Wi-Fi / network, each on their own device
#   ./test-together.sh --internet       people ANYWHERE (free https tunnel)
#   ./test-together.sh tester <name>    make an account for one tester (--lan / --internet)
#   ./test-together.sh demo [N]         make N ready-made test accounts (demo1, demo2 ...; default 3)
#   ./test-together.sh admin <...>      any server/admin.mjs command (listi, opna, loka, lykilord ...)
#
# The four-pupil mode keeps its own accounts and progress (a "fjorir" folder inside the test
# folder below), so it never mixes with what testers made in --lan / --internet.
#
# Everything the testers create (accounts, password hashes, progress, and the
# demo passwords) lives in a temporary folder OUTSIDE the project, made with
# mktemp -d; the script prints where. It is never inside the repository, the
# Docker image or the zip, so a careless `git add` cannot pick it up and the
# real server starts clean. Later runs reuse the same folder (its path is
# remembered in a small file in the temp directory). Choose your own with
#   FALLASKOLI_TEST_DIR=/some/folder ./test-together.sh
# Delete the folder to wipe the test completely.
#
# Stop with Ctrl + C.

set -u
cd "$(dirname "$0")"

# ---- settings you may change -------------------------------------------------
PORT="${PORT:-8080}"
# The test folder: your own choice, else the one a previous run made, else a new
# mktemp -d. It is always outside the project.
POINTER="${TMPDIR:-/tmp}/fallaskoli-test-dir-$(id -u)"
TEST_DIR="${FALLASKOLI_TEST_DIR:-}"
if [ -z "$TEST_DIR" ] && [ -f "$POINTER" ] && [ -d "$(cat "$POINTER")" ]; then
  TEST_DIR="$(cat "$POINTER")"
fi
if [ -z "$TEST_DIR" ]; then
  TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fallaskoli-test.XXXXXX")" || { echo "STOPP: could not make a temp folder." >&2; exit 1; }
  printf '%s\n' "$TEST_DIR" > "$POINTER"
fi
mkdir -p "$TEST_DIR"
TEST_DIR="$(cd "$TEST_DIR" && pwd -P)"
case "$TEST_DIR/" in
  "$PWD"/*) echo "STOPP: the test folder $TEST_DIR is inside the project; choose one outside it." >&2; exit 1 ;;
esac
DATA_DIR="$TEST_DIR/data"
# Shown in the privacy notice while testing. Edit freely.
CONTROLLER="${FALLASKOLI_CONTROLLER:-Prófunarútgáfa (umsjónarmaður prófunar)}"
CONTACT="${FALLASKOLI_CONTACT:-hafið samband við umsjónarmann prófunarinnar}"
# ------------------------------------------------------------------------------

export FALLASKOLI_DATA="$DATA_DIR"
export FALLASKOLI_CONTROLLER="$CONTROLLER"
export FALLASKOLI_CONTACT="$CONTACT"
export PORT

say()  { printf '%s\n' "$*"; }
fail() { printf '\nSTOPP: %s\n' "$*" >&2; exit 1; }

# ---- checks ------------------------------------------------------------------
command -v node >/dev/null 2>&1 || fail "Node is not installed. Get version 20+ from https://nodejs.org and open a NEW Terminal window."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] 2>/dev/null || fail "Node $(node --version) is too old. Version 20 or newer is needed (https://nodejs.org)."

HTML="dist/$(node -e 'import("./tools/version.mjs").then(m=>console.log(m.HTML_NAME))')"
[ -f "$HTML" ] || fail "$HTML is missing. Run ./build.sh first."
[ -f data/data_bundle.js ] || fail "data/data_bundle.js is missing. Run ./build.sh first."

mkdir -p "$DATA_DIR"
chmod 700 "$TEST_DIR" "$DATA_DIR" 2>/dev/null
say "Test data (accounts, passwords, progress) is in: $TEST_DIR"

has_users() { [ -s "$DATA_DIR/users.json" ] && [ "$(tr -d '[:space:]' < "$DATA_DIR/users.json")" != "[]" ]; }

# ---- sub-commands ------------------------------------------------------------
if [ "${1:-}" = "tester" ]; then
  [ -n "${2:-}" ] || fail "Give a username:  ./test-together.sh tester anna"
  # Testers are adults answering for themselves (--16). For a child, use:
  #   ./test-together.sh admin nyr <name> --forsja="Parent's name"
  node server/admin.mjs nyr "$2" --16
  exit $?
fi
if [ "${1:-}" = "demo" ]; then
  N="${2:-3}"
  case "$N" in ''|*[!0-9]*) fail "Give a number:  ./test-together.sh demo 4" ;; esac
  LIST="$TEST_DIR/demo-accounts.txt"
  touch "$LIST"; chmod 600 "$LIST"
  i=1
  while [ "$i" -le "$N" ]; do
    NAME="demo$i"
    if grep -q "\"username\":\"$NAME\"" "$DATA_DIR/users.json" 2>/dev/null; then
      :   # already there; its password is in the list from last time
    else
      OUT="$(node server/admin.mjs nyr "$NAME" --16)" || fail "Could not create $NAME."
      PW="$(printf '%s\n' "$OUT" | awk '/Lykilor/ {print $NF; exit}')"
      grep -v "^$NAME " "$LIST" > "$LIST.tmp" 2>/dev/null; mv "$LIST.tmp" "$LIST"
      printf '%-8s %s\n' "$NAME" "$PW" >> "$LIST"
    fi
    i=$((i + 1))
  done
  say ""
  say "Test accounts (also saved in $LIST):"
  say ""
  sort -V "$LIST" 2>/dev/null || sort "$LIST"
  say ""
  say "To be logged in as several of them at once, give each its own address,"
  say "e.g. http://demo1.localhost:$PORT, http://demo2.localhost:$PORT (Chrome/Firefox),"
  say "or one Safari private window each. A forgotten one gets a new password with:"
  say "  ./test-together.sh admin lykilord demo1"
  exit 0
fi
if [ "${1:-}" = "admin" ]; then
  shift
  node server/admin.mjs "$@"
  exit $?
fi

# ---- the default: four pupils on this computer (tools/quad.mjs) ---------------
if [ -z "${1:-}" ] || [ "${1:-}" = "--reset" ]; then
  export FALLASKOLI_TEST_DIR="$TEST_DIR"
  exec node tools/quad.mjs "$@"
fi

MODE="lan"
[ "${1:-}" = "--internet" ] && MODE="internet"
[ "${1:-}" = "--lan" ] || [ "$MODE" = "internet" ] || fail "Unknown option: $1  (use nothing, --reset, --lan, --internet, tester <name>, demo [N] or admin <...>)"

# ---- first run: an administrator account for you -----------------------------
if ! has_users; then
  say ""
  say "First run: making the administrator account for the test (that is you)."
  printf "Choose a username: "
  read -r ADMIN_NAME
  [ -n "$ADMIN_NAME" ] || fail "No username given."
  node server/admin.mjs nyr "$ADMIN_NAME" --umsjon || fail "Could not create the account."
  say ""
  printf "Write the password down, then press Enter to start the server... "
  read -r _
fi

# ---- is the port free? -------------------------------------------------------
if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  fail "Port $PORT is already in use (is the server already running in another window?). Stop that one, or run:  PORT=8090 ./test-together.sh"
fi

# ---- start -------------------------------------------------------------------
PIDS=""
cleanup() {
  trap - INT TERM EXIT
  say ""; say "Stopping..."
  for p in $PIDS; do kill "$p" 2>/dev/null; done
  wait 2>/dev/null
  say "Stopped. The test data is kept in $TEST_DIR for next time."
  exit 0
}
trap cleanup INT TERM EXIT

LOG="$TEST_DIR/tunnel.log"

if [ "$MODE" = "internet" ]; then
  command -v cloudflared >/dev/null 2>&1 || fail "The tunnel program 'cloudflared' is not installed.
On a Mac:   brew install cloudflared
(no Homebrew? see https://brew.sh — or download cloudflared from
 https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
No Cloudflare account is needed."
  # Only reachable through the tunnel; the tunnel says who the real visitor is.
  export FALLASKOLI_HOST=127.0.0.1
  export FALLASKOLI_TRUST_PROXY=1
else
  export FALLASKOLI_HOST=0.0.0.0
  unset FALLASKOLI_TRUST_PROXY
fi

node server/server.mjs &
SERVER_PID=$!
PIDS="$SERVER_PID"
sleep 1
kill -0 "$SERVER_PID" 2>/dev/null || fail "The server did not start — see the message above."

# Keep the Mac awake while the server runs (it still sleeps if the lid is closed on battery).
if command -v caffeinate >/dev/null 2>&1; then
  caffeinate -dims -w "$SERVER_PID" &
  PIDS="$PIDS $!"
fi

say ""
say "=================================================================="
if [ "$MODE" = "internet" ]; then
  : > "$LOG"
  cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" >"$LOG" 2>&1 &
  PIDS="$PIDS $!"
  URL=""
  for _ in $(seq 1 40); do
    URL="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1)"
    [ -n "$URL" ] && break
    sleep 1
  done
  [ -n "$URL" ] || fail "The tunnel did not come up. Its log is in $LOG"
  say " Testers open:   $URL"
  say ""
  say " This address is NEW every time you start --internet."
  say " It is https (padlock), so passwords are safe on the way."
else
  IP=""
  if command -v ipconfig >/dev/null 2>&1; then
    for ifc in en0 en1 en2 en3 en4 en5; do
      IP="$(ipconfig getifaddr "$ifc" 2>/dev/null)"; [ -n "$IP" ] && break
    done
  fi
  [ -n "$IP" ] || IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  say " You open:       http://localhost:$PORT"
  say " More accounts at once, one address each (separate logins):"
  say "                 http://127.0.0.1:$PORT   http://demo1.localhost:$PORT   http://demo2.localhost:$PORT ..."
  say "                 (*.localhost: Chrome/Firefox. Safari: a private window per account.)"
  say " Testers open:   http://${IP:-THIS-COMPUTERS-IP}:$PORT"
  say ""
  say " They must be on the same Wi-Fi/network as this computer."
  say " If the Mac asks whether 'node' may accept incoming connections: Allow."
  say " This is plain http — use test passwords only. For people elsewhere:"
  say "   ./test-together.sh --internet"
fi
say ""
say " Accounts for testers: log in as admin -> Stillingar og námsefni ->"
say " Umsjón -> Boðskóðar (invitation code), or in a second Terminal:"
say "   ./test-together.sh tester <name>     one named account"
say "   ./test-together.sh demo 3            demo1..demo3, passwords saved for you"
say ""
say " Stop with Ctrl + C."
say "=================================================================="
say ""

wait "$SERVER_PID"
