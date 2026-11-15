/* Administration from the command line.
 *
 * There is an admin page inside the program, but the first account cannot be
 * created there — creating a user requires somebody to be logged in, and at the
 * start nobody is. This is that somebody.
 *
 *   node server/admin.mjs nyr <username> --umsjon
 *   node server/admin.mjs nyr <username> --16
 *   node server/admin.mjs nyr <username> --forsja="Nafn foreldris"
 *   node server/admin.mjs listi
 *   node server/admin.mjs opna <username>
 *   node server/admin.mjs loka <username>
 *   node server/admin.mjs lykilord <username>
 *
 * From v6.3 the admin page does all of this too (Umsjón → Nýr notandi), and
 * this tool is needed for exactly two things: the very first account, and
 * getting back in when the administrator's own password is lost.
 *
 * A learner's account needs to say who consented to it: `--16` (the user is
 * sixteen or older and answers for themselves) or `--forsja="..."` (the
 * parent or guardian who agreed). See docs/PRIVACY.md.
 *
 * The subcommands and the printed output stay in Icelandic: this is a tool the
 * owner runs, not developer documentation.
 *
 * `nyr` and `lykilord` GENERATE the password and print it once. That is
 * deliberate: a password somebody picks in a hurry for a child ends up being
 * "1234", and a password printed once gets written down and kept.
 */

import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createStore } from "./store.mjs";
import { hashPassword, newId, makePassword } from "./auth.mjs";
import { PRIVACY_VERSION } from "./privacy.mjs";
import { dropPrivileges } from "./privs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.FALLASKOLI_DATA || path.join(HERE, "data");
/* Before a single file is touched: become the user the server runs as. */
await dropPrivileges(DATA_DIR);
const store = createStore(DATA_DIR);
await store.init();

const [cmd, name, ...flags] = process.argv.slice(2);
const users = await store.users();
const find = (n) => users.find((u) => u.username === String(n || "").toLowerCase());

async function setPassword(user) {
  const pw = makePassword();
  const { salt, hash } = await hashPassword(pw);
  user.salt = salt; user.hash = hash;
  return pw;
}

if (cmd === "nyr") {
  if (!name) { console.error("vantar notandanafn"); process.exit(1); }
  if (find(name)) { console.error("notandanafnið er þegar til"); process.exit(1); }
  const admin = flags.includes("--umsjon") || flags.includes("--admin");
  /* Two at most: the one who runs it, and one who can get back in when the
     first has lost the password. */
  if (admin && users.filter((u) => u.role === "admin").length >= 2) {
    console.error("Tveir umsjónarreikningar eru þegar til. Þeir eiga ekki að vera fleiri.");
    process.exit(1);
  }
  const over16 = flags.includes("--16");
  const guardian = (flags.find((f) => f.startsWith("--forsja=")) || "").slice(9).trim();
  if (!admin && !over16 && guardian.length < 3) {
    console.error(`Hver samþykkti aðganginn?
  --16                     notandinn er 16 ára eða eldri og samþykkir sjálfur
  --forsja="Nafn"          foreldri eða forsjáraðili sem samþykkti`);
    process.exit(1);
  }
  const user = {
    id: newId(), username: String(name).toLowerCase(), name: String(name),
    role: admin ? "admin" : "learner", status: "active", group: "default",
    created: new Date().toISOString(), lastSeen: new Date().toISOString().slice(0, 10),
    ...(admin ? {} : { consent: {
      by: over16 ? "self" : guardian, over16, at: new Date().toISOString(),
      how: "admin", notice: PRIVACY_VERSION } }),
  };
  const pw = await setPassword(user);
  users.push(user);
  await store.saveUsers(users);
  console.log(`Búinn til: ${user.username}  (${user.role})`);
  console.log(`Lykilorð:  ${pw}`);
  console.log("Skrifaðu það niður — það birtist ekki aftur.");
} else if (cmd === "lykilord") {
  const u = find(name);
  if (!u) { console.error("notandi fannst ekki"); process.exit(1); }
  const pw = await setPassword(u);
  await store.saveUsers(users);
  /* Whoever was logged in with the old one is logged out. */
  await store.updateSessions((s) => {
    for (const [k, v] of Object.entries(s)) if (v.userId === u.id) delete s[k];
    return s;
  });
  console.log(`Nýtt lykilorð fyrir ${u.username}: ${pw}`);
} else if (cmd === "opna" || cmd === "loka") {
  const u = find(name);
  if (!u) { console.error("notandi fannst ekki"); process.exit(1); }
  u.status = cmd === "opna" ? "active" : "blocked";
  await store.saveUsers(users);
  console.log(`${u.username}: ${u.status}`);
} else if (cmd === "listi") {
  if (!users.length) console.log("engir notendur");
  users.forEach((u) => console.log(
    `${u.username.padEnd(20)} ${u.role.padEnd(9)} ${u.status.padEnd(8)} ${
      (u.google ? "google" : "lykilorð").padEnd(9)} ${
      u.role !== "learner" ? "" : u.consent ? "samþykki: " + (u.consent.by === "self" ? "sjálf(ur)" : u.consent.by)
        : "SAMÞYKKI VANTAR"}`));
} else {
  console.log(`Umsjón Fallaskóla

  node server/admin.mjs nyr <notandanafn> --umsjon     nýr umsjónarreikningur
  node server/admin.mjs nyr <notandanafn> --16         nýr notandi, 16 ára eða eldri
  node server/admin.mjs nyr <notandanafn> --forsja="Nafn"   nýr notandi, samþykkt af forsjáraðila
  node server/admin.mjs listi                          allir notendur
  node server/admin.mjs opna <notandanafn>             hleypa inn
  node server/admin.mjs loka <notandanafn>             útiloka
  node server/admin.mjs lykilord <notandanafn>         nýtt lykilorð`);
}
