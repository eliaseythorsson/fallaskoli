#!/bin/bash
# Fallaskóli — ./build.sh inside the build container (item 80, Dockerfile.build).
#
# The same build as ./build.sh, but with Python, Node, the grammar libraries
# and the processor type pinned, so the data comes out byte for byte the same
# on any computer: a Mac, a Linux machine, GitHub's CI.
#
#   ./build-in-container.sh            build and verify
#   ./build-in-container.sh --accept   accept a reviewed change to the data
#   CHROME_PATH=none ./build-in-container.sh   the same, without the browser checks
#
# Needs Docker (Docker Desktop on a Mac). The first run builds the image —
# several minutes, and on an Apple-silicon Mac everything runs under x86_64
# emulation, so the whole build is slower than ./build.sh. The results land in
# this folder exactly as with ./build.sh; your own node_modules is not touched
# (the container gets its own).
set -euo pipefail
cd "$(dirname "$0")"

IMAGE="${FALLASKOLI_BUILD_IMAGE:-fallaskoli-build}"

command -v docker >/dev/null 2>&1 || {
  echo "Docker is needed: https://docs.docker.com/get-docker/ (Docker Desktop on a Mac)." >&2; exit 1; }

echo "── the build container (Dockerfile.build) ──────────────────────────"
docker build --platform linux/amd64 -f Dockerfile.build -t "$IMAGE" .

# The date of the source, for anything that writes a date (tools/licenses.mjs
# keeps the old one when nothing changed). Asked here, where git works even in
# a worktree whose .git is a pointer to a folder the container cannot see.
SDE="${SOURCE_DATE_EPOCH:-$(git log -1 --format=%ct 2>/dev/null || true)}"

# A terminal gets colours and Ctrl-C; CI has no terminal.
TTY=(); [ -t 0 ] && [ -t 1 ] && TTY=(-it)

set +e
docker run --rm "${TTY[@]}" --platform linux/amd64 \
  -v "$PWD":/src -v /src/node_modules \
  ${SDE:+-e SOURCE_DATE_EPOCH="$SDE"} \
  ${CHROME_PATH+-e CHROME_PATH="$CHROME_PATH"} \
  "$IMAGE" "$@"
RC=$?
set -e

# On Linux the files the container wrote belong to root; give them back.
# (Docker Desktop on a Mac already maps them to you.)
if [ "$(uname -s)" = "Linux" ] && [ "$(id -u)" != "0" ]; then
  docker run --rm --platform linux/amd64 -v "$PWD":/src --entrypoint find "$IMAGE" \
    /src -path /src/node_modules -prune -o -user 0 -exec chown "$(id -u):$(id -g)" {} + || true
fi
exit "$RC"
