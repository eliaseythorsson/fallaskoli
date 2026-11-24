/* The text reader's GreynirCorrect plug (server/reader.mjs; moved here from
 * server/writing.mjs in #47, unchanged in what it does).
 *
 * GreynirCorrect is Python and needs ~400 MB and a few seconds to load, so it
 * runs as ONE long-lived child process (server/greynir_worker.py) started on
 * the first need and kept, speaking one JSON line per text over stdin/stdout:
 *   → { id, text }      ← { id, sentences, annotations } | { id, error }
 * The timeout, the queue and the quote check are the reader's; this file is
 * the worker:
 *   - `start()` gets it running (at most `startMs`); one that cannot start
 *     (no Python, the package missing — as in the default Docker image)
 *     leaves the plug unavailable, and it is tried again after RETRY_MS;
 *   - when the reader's timeout aborts a text, the worker is KILLED — a parse
 *     that runs away cannot hold the next pupil's text hostage — and the
 *     next text starts a fresh one;
 *   - the text goes over a pipe; the worker's stderr is thrown away, so
 *     nothing it prints can carry a text into a log. */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fault } from "./reader.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const START_MS = 90_000;          // loading GreynirCorrect the first time
const RETRY_MS = 5 * 60_000;      // after a failed start, before trying again
const LINE_MAX = 1 << 20;         // a line longer than this from the worker is a fault

/**
 * The worker, as a plug. Findings are GreynirCorrect's annotations as they
 * come ({ start, end, code, msg, detail, suggest }); the answer also carries
 * `sentences`.
 */
export function greynirPlug({
  command = "python3", args = [path.join(HERE, "greynir_worker.py")],
  startMs = START_MS, off = false,
} = {}) {
  let child = null, ready = null, state = off ? "off" : "idle", failedAt = 0;
  let buf = "", seq = 0;
  const pending = new Map();      // id -> { resolve, reject }

  const failAll = (code) => {
    for (const [, p] of pending) p.reject(fault(code));
    pending.clear();
  };

  function kill(next = "idle") {
    const c = child;
    child = null; ready = null; buf = "";
    state = next;
    if (next === "failed") failedAt = Date.now();
    failAll("failed");
    if (c) { try { c.kill("SIGKILL"); } catch { /* already gone */ } }
  }

  function start() {
    if (state === "off") return Promise.reject(fault("off"));
    if (state === "failed" && Date.now() - failedAt < RETRY_MS) return Promise.reject(fault("unavailable"));
    if (ready) return ready;
    state = "starting";
    ready = new Promise((resolve, reject) => {
      let c;
      try {
        c = spawn(command, args, {
          /* stderr is thrown away: nothing a worker prints may carry a text
             into a log. A minimal environment, and Python told to speak UTF-8. */
          stdio: ["pipe", "pipe", "ignore"],
          env: { PATH: process.env.PATH || "/usr/bin:/bin", PYTHONIOENCODING: "utf-8",
            PYTHONDONTWRITEBYTECODE: "1", HOME: process.env.HOME || "/tmp" },
        });
      } catch { kill("failed"); reject(fault("unavailable")); return; }
      child = c;
      /* The worker must never keep the server (or a test) alive by itself. */
      c.unref(); c.stdin.unref?.(); c.stdout.unref?.();
      const startTimer = setTimeout(() => { if (state === "starting") { kill("failed"); reject(fault("unavailable")); } }, startMs);
      startTimer.unref?.();
      c.on("error", () => { clearTimeout(startTimer); if (child === c) kill("failed"); reject(fault("unavailable")); });
      c.on("exit", () => {
        clearTimeout(startTimer);
        if (child !== c) return;
        const wasStarting = state === "starting";
        kill(wasStarting ? "failed" : "idle");
        if (wasStarting) reject(fault("unavailable"));
      });
      c.stdin.on("error", () => { /* a dead pipe: the exit handler answers */ });
      c.stdout.setEncoding("utf8");
      c.stdout.on("data", (chunk) => {
        if (child !== c) return;
        buf += chunk;
        if (buf.length > LINE_MAX) { kill("idle"); return; }
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          let msg;
          try { msg = JSON.parse(line); } catch { continue; }
          if (state === "starting" && "ready" in msg) {
            clearTimeout(startTimer);
            if (msg.ready === true) { state = "ready"; resolve(); }
            else { kill("failed"); reject(fault("unavailable")); }
            continue;
          }
          const p = pending.get(msg.id);
          if (!p) continue;
          pending.delete(msg.id);
          if (msg.error) p.reject(fault("failed"));
          else p.resolve({ sentences: Number(msg.sentences) || 0,
            findings: Array.isArray(msg.annotations) ? msg.annotations : [] });
        }
      });
    });
    ready.catch(() => {});
    return ready;
  }

  async function read(text, { signal } = {}) {
    await start();
    if (!child) throw fault("unavailable");
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      /* The reader's timeout: a runaway parse is killed, so the next text is
         not stuck behind it. */
      signal?.addEventListener("abort", () => {
        if (!pending.delete(id)) return;
        reject(fault("timeout"));
        kill("idle");
      }, { once: true });
      try { child.stdin.write(JSON.stringify({ id, text }) + "\n"); }
      catch { pending.delete(id); kill("idle"); reject(fault("failed")); }
    });
  }

  return {
    start, read,
    /** "off" | "idle" | "starting" | "ready" | "failed" */
    get state() { return state; },
    /** Start the worker in the background if it is not running. */
    warm() { if (state === "idle" || (state === "failed" && Date.now() - failedAt >= RETRY_MS)) start().catch(() => {}); },
    /** Is it up (true), down (false), or not known yet (null)? */
    available() { return state === "ready" ? true : state === "off" || state === "failed" ? false : null; },
    stop() { if (state !== "off") kill("idle"); },
  };
}
