# Fallaskóli — the server, as a container.
#
# Nothing is BUILT here. The program (fallaskoli-v*.html) is built on your own
# computer with ./build.sh, where Python and the grammar libraries are; this
# image only carries the result. That is why it needs no Python, no npm install
# and no particular processor: the server uses nothing but Node itself.
#
#   ./build.sh          on your computer, first
#   fly deploy          then this file is used        (docs/HOSTING.md)

FROM node:22-alpine

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
