/* The name of the file the child opens — in ONE place.
 *
 * In v5.4 `fallaskoli-v5.4.html` was written out in six files: build.mjs,
 * browser-test.mjs, server-test.mjs, server.mjs and build.sh. A
 * version bump meant finding all of them, and in v5.5 one was missed: the build
 * wrote `fallaskoli-v5.5.html`, the browser test looked for `v5.4` and failed
 * with `ERR_FILE_NOT_FOUND`. It cost no data error that time, but it is exactly
 * the same shape as the bug §1.2 describes: a test that does not test what it
 * thinks it tests.
 *
 * The number now comes from package.json and nowhere else.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const VERSION =
  JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;

/** "5.6.0" -> "5.6". The file name carries only the first two components. */
export const SHORT = VERSION.split(".").slice(0, 2).join(".");

export const HTML_NAME = `fallaskoli-v${SHORT}.html`;

/** Built files go to dist/, which git ignores (see .gitignore). History lives
 *  in git tags, not in a row of old HTML files beside the source. */
export const DIST = path.join(root, "dist");
export const htmlPath = () => path.join(DIST, HTML_NAME);
export const ROOT = root;
