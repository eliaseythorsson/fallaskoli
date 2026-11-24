/* What tests/saved-progress.test.js holds still: a saved progress file
   (tests/fixtures/saved-progress.json, made by tools/sim/progress-fixture.mjs)
   loaded, merged between two devices and checked by the server, with the
   code under `root`. tools/sim/progress-fixture.mjs writes these outputs as
   tests/fixtures/saved-progress.expected.json. */

/**
 * @param {string} root  a checkout of the program
 * @param {{today: string, base: any, local: any, remote: any}} f  the fixture
 */
export async function outputs(root, f) {
  const { blankState, migrate } = await import(root + "/src/js/core/state.js");
  const { mergeStates } = await import(root + "/src/js/core/merge.js");
  const { cleanState } = await import(root + "/server/guard.mjs");
  const today = new Date(f.today);
  const copy = (x) => JSON.parse(JSON.stringify(x));
  const merged = mergeStates(migrate(copy(f.base)), migrate(copy(f.local)), migrate(copy(f.remote)));
  return {
    blank: blankState(),
    /* Loaded on this device, and loaded twice. */
    load: migrate(copy(f.local)),
    loadTwice: migrate(migrate(copy(f.local))),
    /* What the server stores of each copy. */
    serverLocal: cleanState(copy(f.local), { today }),
    serverRemote: cleanState(copy(f.remote), { today }),
    /* The two devices put together after the server refused a write (409). */
    merged,
    /* … in the other direction, and with no common past. */
    mergedOther: mergeStates(migrate(copy(f.base)), migrate(copy(f.remote)), migrate(copy(f.local))),
    mergedNoBase: mergeStates(null, migrate(copy(f.local)), migrate(copy(f.remote))),
    /* The whole round: merged, loaded, sent, stored. */
    round: cleanState(migrate(copy(merged)), { today }),
  };
}
