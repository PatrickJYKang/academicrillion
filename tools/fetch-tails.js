/*
 * Download the raw answer sets described in sources.js into tools/cache/,
 * one file per category (set-<id>.json). Slow by necessity; safe to stop and
 * rerun, because anything already downloaded is skipped.
 *
 *   node tools/fetch-tails.js              everything not yet cached
 *   node tools/fetch-tails.js pope moon    just those categories
 */
const fs = require('fs');
const path = require('path');
const { sparql, CACHE } = require('./wdqs.js');
const { BATCHES, SINGLES, query, batchQuery } = require('./sources.js');

const cached = (id) => fs.existsSync(path.join(CACHE, `set-${id}.json`));

(async () => {
  const wanted = process.argv.slice(2);
  const want = (id) => (!wanted.length || wanted.includes(id)) && !cached(id);

  // Batches first: one request fills several categories.
  for (const [name, ids] of Object.entries(BATCHES)) {
    if (!ids.some(want)) continue;
    const rows = await sparql('batch-' + name, batchQuery(name), { force: true });
    if (!rows) {
      console.error(`batch ${name}: FAILED (${ids.join(' ')})`);
      continue;
    }
    for (const id of ids) {
      const mine = rows.filter((r) => r.cat === id);
      fs.writeFileSync(path.join(CACHE, `set-${id}.json`), JSON.stringify(mine));
      console.log(`  ${id}: ${mine.length}`);
    }
  }
  for (const id of SINGLES) {
    if (!want(id)) continue;
    if (!(await sparql('set-' + id, query(id)))) console.error(`${id}: FAILED`);
  }
  console.log('fetch finished');
})();
