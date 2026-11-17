# Fallaskóli — the server, as a container.
#
# Nothing is BUILT here. The program (fallaskoli-v*.html) is built on your own
# computer with ./build.sh, where Python and the grammar libraries are; this
# image only carries the result. That is why it needs no Python, no npm install
# and no particular processor: the server uses nothing but Node itself.
#
#   ./build.sh          on your computer, first
#   fly deploy          then this file is used        (docs/HOSTING.md)

# The optional `greynir` target below is built on the build container's own
# pinned images (Dockerfile.build); they are named here because Docker reads
# an ARG in a FROM line only from before the first FROM. The plain image does
# not use them.
ARG PYTHON_IMAGE=python:3.13.18-slim-bookworm
ARG NODE_IMAGE=node:22.23.4-bookworm-slim

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
#
# Pinned like the build container (Dockerfile.build, item 80), and on the very
# same images: Python 3.13.18 and Node 22.23.4, exact, on x86_64. The Python
# packages are installed by hash, wheels only — the build's own lock
# (requirements-build.txt: reynir, islenska, tokenizer and what they pull in)
# together with the writing check's (server/requirements-writing-build.txt) —
# so GreynirCorrect cannot move the grammar libraries, and the checker reads
# a text with exactly the parser the data was built with.
# (PYTHON_IMAGE and NODE_IMAGE are declared at the top of this file: Docker
# reads an ARG in a FROM line only from before the first FROM.)
# hadolint ignore=DL3029
FROM --platform=linux/amd64 ${NODE_IMAGE} AS greynir-node
# hadolint ignore=DL3029
FROM --platform=linux/amd64 ${PYTHON_IMAGE} AS greynir
COPY --from=greynir-node /usr/local/bin/node /usr/local/bin/node
COPY requirements-build.txt /tmp/req/requirements-build.txt
COPY server/requirements-writing-build.txt /tmp/req/requirements-writing-build.txt
RUN pip install --no-cache-dir --disable-pip-version-check \
      --require-hashes --only-binary=:all: \
      -r /tmp/req/requirements-build.txt -r /tmp/req/requirements-writing-build.txt \
 && rm -rf /tmp/req /root/.cache
# The server drops root for uid/gid 1000 (`node` in the plain image); Debian's
# python image has no such user, so it is made here with the same numbers.
RUN groupadd -g 1000 node && useradd -u 1000 -g 1000 -M -s /usr/sbin/nologin node
WORKDIR /app
COPY --from=plain /app /app
COPY server/greynir_worker.py ./server/greynir_worker.py
ENV NODE_ENV=production \
    PORT=8080 \
    FALLASKOLI_DATA=/data \
    FALLASKOLI_TRUST_PROXY=1 \
    FALLASKOLI_UID=1000 \
    FALLASKOLI_GID=1000 \
    FALLASKOLI_WRITING_PYTHON=python3 \
    PYTHONHASHSEED=0 \
    PYTHONDONTWRITEBYTECODE=1
EXPOSE 8080
CMD ["node", "server/server.mjs"]

# The default image is the plain one above, unchanged: the last stage is what
# `docker build` and `fly deploy` build when no target is named.
FROM plain
