# Fallaskóli — the server, as a container.
#
# Nothing is BUILT here. The program (fallaskoli-v*.html) is built on your own
# computer with ./build.sh, where Python and the grammar libraries are; this
# image only carries the result. That is why it needs no Python, no npm install
# and no particular processor: the server uses nothing but Node itself.
#
#   ./build.sh          on your computer, first
#   fly deploy          then this file is used        (docs/HOSTING.md)

FROM node:22-alpine AS plain

WORKDIR /app

# Exactly what `node server/server.mjs` imports, and no more:
COPY package.json ./
COPY server/*.mjs ./server/
COPY src/js/core ./src/js/core
# The question builders and the hand-written exercises: the server builds a
# duel's questions itself to grade the answers (v6.13, src/js/core/duel.js).
COPY src/js/tasks ./src/js/tasks
# core/examples.js (the worked example of a question type) reads its texts here.
COPY src/js/content/examples.js ./src/js/content/examples.js
# The skill map of one pupil for their teacher (item 83, core/skillmap.js) is
# computed on the server by the very function the pupil's own map is drawn
# from, and that function reads the Lesefni pages for a node's rule.
COPY src/js/content/lessons.js ./src/js/content/lessons.js
COPY data/data_bundle.js data/exercises.js ./data/
COPY tools/version.mjs ./tools/version.mjs
# Installing the program (item 54): the server makes the manifest, the icons
# and the service worker from the HTML it serves; src/sw.js is the worker's
# text, read (not imported) by tools/pwa.mjs.
COPY tools/pwa.mjs ./tools/pwa.mjs
COPY src/sw.js ./src/sw.js
# The built program (dist/ is git-ignored; ./build.sh makes it). The server
# serves the one whose number matches package.json.
COPY dist/fallaskoli-v*.html ./dist/

ENV NODE_ENV=production \
    PORT=8080 \
    FALLASKOLI_DATA=/data \
    FALLASKOLI_TRUST_PROXY=1 \
    FALLASKOLI_UID=1000 \
    FALLASKOLI_GID=1000

# The process STARTS as root for one reason — a freshly attached volume belongs
# to root — takes ownership of /data for uid 1000 (the image's `node` user) and
# gives root up before it reads a single request. See `dropPrivileges` in
# server/server.mjs.
EXPOSE 8080
CMD ["node", "server/server.mjs"]

# ---------------------------------------------------------------------------
# Optional (critique item 46): the same server WITH the writing check.
#
#   docker build --target greynir -t fallaskoli:greynir .
#   fly deploy --build-target greynir          (and a VM with ≥ 1 GB: the
#                                               checker alone holds ~400 MB)
#
# GreynirCorrect (`reynir-correct`) and the libraries under it ship Linux
# wheels for glibc only — none for Alpine's musl — so this target is Debian
# slim with Python, and the image is several hundred MB larger. That is why
# it is a separate target and not the default: a server whose teachers never
# switch the check on does not need it, and without it the app offers the
# weekly task unchecked. server/writing.mjs starts server/greynir_worker.py
# the first time a group with the check on needs it (docs/SERVER.md).
FROM node:22-bookworm-slim AS greynir
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip \
 && rm -rf /var/lib/apt/lists/*
# The build's own pins first, so GreynirCorrect cannot move reynir/islenska.
COPY requirements.txt /tmp/req/requirements.txt
COPY server/requirements-writing.txt /tmp/req/requirements-writing.txt
RUN pip3 install --break-system-packages --no-cache-dir \
      -r /tmp/req/requirements.txt -r /tmp/req/requirements-writing.txt \
 && rm -rf /tmp/req /root/.cache
WORKDIR /app
COPY --from=plain /app /app
COPY server/greynir_worker.py ./server/greynir_worker.py
ENV NODE_ENV=production \
    PORT=8080 \
    FALLASKOLI_DATA=/data \
    FALLASKOLI_TRUST_PROXY=1 \
    FALLASKOLI_UID=1000 \
    FALLASKOLI_GID=1000 \
    FALLASKOLI_WRITING_PYTHON=python3
EXPOSE 8080
CMD ["node", "server/server.mjs"]

# The default image is the plain one above, unchanged: the last stage is what
# `docker build` and `fly deploy` build when no target is named.
FROM plain
