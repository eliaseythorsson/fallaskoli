/* Backups that can leave the machine.
 *
 * `server/data` holds every child's progress and every password hash. A copy
 * of that folder on a laptop or in an email is the same thing, unprotected.
 * So a backup made here is ONE file, encrypted with a passphrase the owner
 * chooses: AES-256-GCM, the key stretched from the passphrase with scrypt.
 * Without the passphrase the file is noise — and there is no way to recover a
 * forgotten one, which is the point.
 *
 * Two ways in:
 *   - the admin page (Umsjón → Öryggisafrit) downloads one, and
 *   - this file, run by hand:
 *
 *       node server/backup.mjs taka  <file>      make a backup
 *       node server/backup.mjs lesa  <file>      restore one (replaces the data)
 *
 *     The passphrase is read from FALLASKOLI_BACKUP_KEY. Stop the server before
 *     `lesa`, and start it afterwards.
 *
 * Only what ships with Node, like the rest of the server.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KDF = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

const key = (passphrase, salt) => new Promise((res, rej) =>
  crypto.scrypt(String(passphrase), salt, 32, KDF, (e, k) => (e ? rej(e) : res(k))));

export function passphraseProblem(p) {
  if (String(p || "").length < 12) return "Lykilsetningin þarf að vera að minnsta kosti tólf stafir.";
  return null;
}

/** Anything JSON can hold -> an encrypted envelope (itself JSON). */
export async function seal(value, passphrase) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", await key(passphrase, salt), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return {
    fallaskoli: "afrit", v: 1, at: new Date().toISOString(),
    kdf: "scrypt", cipher: "aes-256-gcm",
    salt: salt.toString("base64"), iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

export async function open(envelope, passphrase) {
  if (!envelope || envelope.fallaskoli !== "afrit" || envelope.v !== 1)
    throw new Error("Þetta er ekki afrit úr Fallaskóla.");
  const decipher = crypto.createDecipheriv("aes-256-gcm",
    await key(passphrase, Buffer.from(envelope.salt, "base64")),
    Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  try {
    const text = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, "base64")), decipher.final(),
    ]).toString("utf8");
    return JSON.parse(text);
  } catch {
    throw new Error("Röng lykilsetning, eða skráin er skemmd.");
  }
}

/* ---------- run by hand ---------- */

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const { createStore } = await import("./store.mjs");
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const { dropPrivileges } = await import("./privs.mjs");
  const DATA_DIR = process.env.FALLASKOLI_DATA || path.join(HERE, "data");
  await dropPrivileges(DATA_DIR);
  const store = createStore(DATA_DIR);
  const [cmd, target] = process.argv.slice(2);
  const pass = process.env.FALLASKOLI_BACKUP_KEY || "";
  const fail = (msg) => { console.error(msg); process.exit(1); };

  if (!["taka", "lesa"].includes(cmd) || !target) {
    console.log(`Öryggisafrit Fallaskóla

  FALLASKOLI_BACKUP_KEY='löng lykilsetning' node server/backup.mjs taka <skrá>
  FALLASKOLI_BACKUP_KEY='löng lykilsetning' node server/backup.mjs lesa <skrá>

  „lesa“ kemur í stað allra gagna á þjóninum. Stöðvaðu þjóninn fyrst.`);
    process.exit(cmd ? 1 : 0);
  }
  if (passphraseProblem(pass)) fail(passphraseProblem(pass) + " (FALLASKOLI_BACKUP_KEY)");

  if (cmd === "taka") {
    await store.init();
    const all = await store.exportAll();
    await fs.writeFile(target, JSON.stringify(await seal(all, pass)), { mode: 0o600 });
    console.log(`Afrit skrifað: ${target}  (${all.users.length} notendur, ${Object.keys(all.states).length} framvindur)`);
  } else {
    const env = JSON.parse(await fs.readFile(target, "utf8"));
    let all;
    try { all = await open(env, pass); } catch (e) { fail(e.message); }
    const n = await store.importAll(all);
    console.log(`Afrit lesið inn frá ${String(env.at).slice(0, 10)}: ${n.users} notendur, ${n.states} framvindur.`);
    console.log("Allir þurfa að skrá sig inn aftur. Ræstu þjóninn.");
  }
}
