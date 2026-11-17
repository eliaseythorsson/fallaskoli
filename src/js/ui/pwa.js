/* Installing the program, from the page's side (item 54).

   Served over http(s) with the worker's files beside it (dist/web/ on a web
   host, or server/server.mjs), the page registers src/sw.js, links the
   manifest, and offers a new version when one is published. Opened from a
   file, none of this happens: `installable()` is false and the page is the
   same single file it has always been — no worker, no manifest link, not a
   single request.

   A web host that carries only the HTML file (no sw.js beside it) is the
   same as before too: the registration fails quietly and nothing is linked. */

import { $ } from "./dom.js";

export const installable = () =>
  typeof location !== "undefined" && /^https?:$/.test(location.protocol) &&
  typeof navigator !== "undefined" && "serviceWorker" in navigator;

/* Head links added only once the worker is known to be there, so a host with
   just the HTML file is not asked for a manifest it does not have. */
function linkHead() {
  if (document.querySelector('link[rel="manifest"]')) return;
  const add = (tag, attrs) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.head.appendChild(el);
  };
  add("link", { rel: "manifest", href: "manifest.webmanifest" });
  add("link", { rel: "apple-touch-icon", href: "apple-touch-icon.png" });
  add("meta", { name: "theme-color", content: "#22392F" });
}

/**
 * Register the worker and watch for a new version.
 *
 * `beforeReload` is awaited before the page reloads into the new version
 * (the program passes its store's `flush`), so the last answer is saved first.
 */
export function startPWA({ beforeReload = async () => {} } = {}) {
  if (!installable()) return null;
  const sw = navigator.serviceWorker;
  let reloading = false;
  /* The worker takes over the page in two cases: the very first install
     (clients.claim — nothing to reload, the page already IS that version)
     and after the pupil asked for the new version. Only the second reloads. */
  sw.addEventListener("controllerchange", () => { if (reloading) location.reload(); });

  const offer = (reg) => showUpdate(async () => {
    reloading = true;
    try { await beforeReload(); } catch { /* the reload saves what it can */ }
    if (reg.waiting) reg.waiting.postMessage({ type: "skip-waiting" });
    else location.reload();
  });

  return sw.register("sw.js").then((reg) => {
    linkHead();
    /* A version found on an earlier visit and not yet taken. */
    if (reg.waiting && sw.controller) offer(reg);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener("statechange", () => {
        /* With no controller this is the first install, not an update. */
        if (w.state === "installed" && sw.controller) offer(reg);
      });
    });
    /* The browser looks for a new worker when a page is opened. A tab left
       open all week also looks when it comes back into view, and hourly. */
    const look = () => reg.update().catch(() => {});
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") look();
    });
    setInterval(look, 60 * 60000);
    return reg;
  }).catch(() => null);
}

function showUpdate(go) {
  if (document.getElementById("updatebar")) return;
  const bar = document.createElement("div");
  bar.id = "updatebar";
  bar.className = "updatebar";
  bar.setAttribute("role", "status");
  bar.innerHTML = `<button type="button" id="update-go">Ný útgáfa er tilbúin — endurhlaða</button>`;
  document.body.appendChild(bar);
  $("update-go").onclick = () => {
    $("update-go").disabled = true;
    go();
  };
}

/* ---------- a server that cannot be reached ----------

   On a Fallaskóli server the pupil's progress lives on the server. Opened
   offline (from the worker's cache), the program cannot reach it — and the
   start-up used to read "no server answered" as "this is a plain web host"
   and quietly start a separate progress in this browser, which the account
   would never see. Now the program remembers that this address IS a server
   (a mark in this browser, nothing personal in it) and says so instead. */

const MARK = "fallaskoli.server";

export function rememberServer(yes) {
  try { yes ? localStorage.setItem(MARK, "1") : localStorage.removeItem(MARK); }
  catch { /* storage refused: the program then behaves as before */ }
}

export function wasServer() {
  try { return localStorage.getItem(MARK) === "1"; } catch { return false; }
}

/** The card shown instead of the login or the program. Tries again by
    itself when the browser says the network is back. */
export function renderOffline() {
  $("task").innerHTML = `
  <div class="card" id="offline">
    <p class="eyebrow"><span>Ekkert samband</span></p>
    <p>Ekki næst samband við þjóninn. Framvindan þín er geymd þar, svo það
      þarf netsamband til að æfa.</p>
    <p class="gloss">Forritið reynir aftur um leið og netið kemst á.</p>
    <div class="answer"><button class="go" id="offline-retry">Reyna aftur</button></div>
  </div>`;
  $("offline-retry").onclick = () => location.reload();
  addEventListener("online", () => location.reload(), { once: true });
}
