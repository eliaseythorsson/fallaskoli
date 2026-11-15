/* Authentication: passwords, sessions and Google.
 *
 * The rules the owner set, which everything here serves:
 *   - logging in with a username and password **or** with Google,
 *   - passwords stored safely,
 *   - **one** administrator account that admits, excludes and sees everyone,
 *   - registration yields `pending`, not access.
 *
 * Three things are deliberately as they are and must not be "simplified" later:
 *
 * 1. **Passwords are never stored.** Only scrypt hashes with a per-user salt.
 *    scrypt is in Node itself (`node:crypto`), so no third-party package holds
 *    this.
 *
 * 2. **The access token goes into an HttpOnly cookie.** Javascript in the
 *    browser cannot reach it, so it cannot leak through XSS. That is why
 *    `createServer` in core/server.js uses `credentials: "include"` and stores
 *    no token of its own.
 *
 * 3. **Comparison is constant-time** (`timingSafeEqual`). An ordinary `===` on
 *    a password hash leaks information about where it stopped matching.
 */

import crypto from "node:crypto";

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export const hashPassword = (pw, salt = crypto.randomBytes(16).toString("hex")) =>
  new Promise((res, rej) => {
    crypto.scrypt(String(pw), salt, SCRYPT.keylen, SCRYPT, (e, key) =>
      e ? rej(e) : res({ salt, hash: key.toString("hex") }));
  });

export async function verifyPassword(pw, salt, hash) {
  if (!salt || !hash) return false;
  const got = await hashPassword(pw, salt);
  const a = Buffer.from(got.hash, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** The same rule as `passwordProblem` in core/profile.js. The browser check is
    a courtesy; this is the defence. Both have to exist. */
export function passwordProblem(pw) {
  const s = String(pw || "");
  if (s.length < 10) return "Lykilorðið þarf að vera að minnsta kosti tíu stafir.";
  if (/^\d+$/.test(s)) return "Lykilorð sem er bara tölur er auðvelt að giska á.";
  if (/^(.)\1+$/.test(s)) return "Lykilorðið má ekki vera sami stafurinn aftur og aftur.";
  return null;
}

export const newToken = () => crypto.randomBytes(32).toString("hex");
export const newId = () => crypto.randomBytes(9).toString("hex");

/* Sessions are stored under the HASH of the token, not the token (v6.3). The
   token is a password in everything but name: whoever reads `sessions.json` —
   or a backup of it — would otherwise be logged in as every child at once. */
export const hashToken = (token) =>
  crypto.createHash("sha256").update(String(token)).digest("hex");

/* Readable secrets: words a child can read aloud down the phone to a parent.
   Four words out of 64 give 24 bits — little on its own, but the throttle
   below lets only a handful of guesses through per quarter of an hour. Used
   for generated passwords (four words) and invite codes (three and a number). */
export const WORDS = `hestur fjall alda gluggi kaffi bátur sæti lampi refur máfur
  steinn bryggja vetur sumar himinn tunga skógur mosi lauf greni fura elgur
  kanna diskur skeið gaffall panna ofn stigi hurð gólf loft veggur speki
  saga ljóð staka hnífur fiskur lax silungur bleikja hvalur selur örn valur
  smyrill þröstur stari lóa spói kría ugla hrafn krummi gæs önd svanur máni
  sól stjarna`.trim().split(/\s+/);

const pick = () => WORDS[crypto.randomInt(WORDS.length)];
export const makePassword = () => [pick(), pick(), pick(), pick()].join("-");
export const makeInviteCode = () =>
  [pick(), pick(), pick(), String(crypto.randomInt(100, 1000))].join("-");

/* Whoever is on the other end of the connection. Behind a proxy (Fly, Caddy)
   the socket's address is the proxy's, the same for everybody — which turned
   the per-address login limit into a per-username one: eight wrong guesses
   from anywhere locked a child out for a quarter of an hour. The forwarding
   headers are believed ONLY when FALLASKOLI_TRUST_PROXY=1, because on a
   server reached directly anybody can type them. */
export function clientIp(req, env = process.env) {
  if (env.FALLASKOLI_TRUST_PROXY === "1") {
    const fly = String(req.headers["fly-client-ip"] || "").trim();
    if (fly) return fly;
    const xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (xff) return xff;
  }
  return req.socket?.remoteAddress || "";
}

export const SESSION_DAYS = 30;
export const COOKIE = "fallaskoli";

export function cookieHeader(token, { secure = true, maxAge = SESSION_DAYS * 86400 } = {}) {
  const bits = [
    `${COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) bits.push("Secure");
  return bits.join("; ");
}

export const clearCookie = (secure) => cookieHeader("", { secure, maxAge: 0 });

export function readCookie(header, name = COOKIE) {
  const raw = String(header || "");
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/* ---------- Login attempt throttle --------------------------------------
 *
 * Without it, anybody can guess passwords as fast as the network allows. The
 * counting is in memory: it is lost on restart, and that is fine — this is a
 * brake, not an audit log.
 */
export function createThrottle({ max = 8, windowMs = 15 * 60 * 1000 } = {}) {
  const hits = new Map();
  const sweep = () => {
    if (hits.size < 5000) return;
    const now = Date.now();
    for (const [k, v] of hits) if (now > v.until) hits.delete(k);
  };
  return {
    /** `limit` lets one throttle hold keys with different ceilings (a name and
        address together get few guesses; an address alone gets more). */
    blocked(key, limit = max) {
      const rec = hits.get(key);
      if (!rec) return false;
      if (Date.now() > rec.until) { hits.delete(key); return false; }
      return rec.n >= limit;
    },
    fail(key) {
      sweep();
      const rec = hits.get(key) || { n: 0, until: Date.now() + windowMs };
      rec.n += 1;
      if (Date.now() > rec.until) { rec.n = 1; rec.until = Date.now() + windowMs; }
      hits.set(key, rec);
    },
    ok(key) { hits.delete(key); },
  };
}

/* ---------- Google ------------------------------------------------------
 *
 * The flow is ordinary OAuth 2.0 with a `code`: the browser goes to Google,
 * Google sends it back with a code, and **the server** exchanges that code for
 * an identity over its own TLS connection. The secret never enters the browser.
 *
 * On `id_token`: it is a JWT, and here it is read without verifying the
 * signature. That is safe **here and only here**, because it did not come from
 * the browser but straight from `oauth2.googleapis.com` over a TLS connection
 * the server opened itself. If it came from the browser the signature would have
 * to be verified against Google's keys — that day arrives if an `id_token` is
 * ever accepted from the front end.
 */
export function googleConfig(env = process.env) {
  const id = env.GOOGLE_CLIENT_ID || "";
  const secret = env.GOOGLE_CLIENT_SECRET || "";
  return { id, secret, enabled: !!(id && secret) };
}

export function googleAuthUrl(cfg, redirectUri, state) {
  const q = new URLSearchParams({
    client_id: cfg.id,
    redirect_uri: redirectUri,
    response_type: "code",
    /* Identity only (v6.3). `email` and `profile` handed the server a child's
       address and real name, and the name went straight onto the leaderboard. */
    scope: "openid",
    state,
    prompt: "select_account",
  });
  return "https://accounts.google.com/o/oauth2/v2/auth?" + q;
}

export async function googleExchange(cfg, code, redirectUri, fetchImpl = globalThis.fetch) {
  const r = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: cfg.id, client_secret: cfg.secret,
      redirect_uri: redirectUri, grant_type: "authorization_code",
    }),
  });
  if (!r.ok) throw new Error("Google hafnaði kóðanum (" + r.status + ")");
  const data = await r.json();
  const payload = decodeJwtPayload(data.id_token);
  if (!payload || !payload.sub) throw new Error("Google skilaði engu auðkenni");
  return { sub: payload.sub };
}

export function decodeJwtPayload(jwt) {
  const parts = String(jwt || "").split(".");
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")); }
  catch { return null; }
}
