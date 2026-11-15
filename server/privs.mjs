/* Giving up root — shared by the server and by the two tools run by hand
 * (admin.mjs, backup.mjs).
 *
 * The tools matter as much as the server: in a container they are run through
 * a root shell, and a `users.json` written by root is a file the server —
 * which is NOT root — can no longer read.
 */
import fs from "node:fs/promises";
import path from "node:path";

/* Give up root. A container starts as root, and so does the service file in
 * older copies of docs/SERVER.md — which meant that a bug in this program was
 * a bug with the run of the whole machine. If FALLASKOLI_UID is set and the
 * process is root, it takes ownership of the data folder for that user and
 * then becomes that user, before a single request is read. (It has to start as
 * root to do the first half: a freshly mounted volume belongs to root.) */
export async function dropPrivileges(dataDir, env = process.env) {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) return null;
  const uid = Number(env.FALLASKOLI_UID), gid = Number(env.FALLASKOLI_GID || env.FALLASKOLI_UID);
  if (!Number.isInteger(uid) || uid <= 0) return null;
  const own = async (p) => {
    await fs.chown(p, uid, gid).catch(() => {});
    let entries = [];
    try { entries = await fs.readdir(p, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const child = path.join(p, e.name);
      if (e.isDirectory()) await own(child); else await fs.chown(child, uid, gid).catch(() => {});
    }
  };
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  await own(dataDir);
  await fs.chmod(dataDir, 0o700).catch(() => {});
  process.setgroups?.([gid]);
  process.setgid(gid);
  process.setuid(uid);
  return uid;
}

