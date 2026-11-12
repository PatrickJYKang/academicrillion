/*
 * Run a SPARQL query over Wikidata and cache the rows.
 *
 * Queries go to QLever (qlever.dev), a public mirror of the Wikidata graph
 * run by the University of Freiburg. Wikidata's own query service works with
 * the same queries, but it throttles scripts to one request a minute and
 * times out on anything broad, so it is only the fallback (WDQS=1).
 *
 * Every result is kept in tools/cache/ so that nothing is fetched twice.
 *
 *   node tools/wdqs.js <name> <file.rq>     run one ad-hoc query
 */
const fs = require('fs');
const path = require('path');

const CACHE = path.join(__dirname, 'cache');
const OFFICIAL = !!process.env.WDQS;
const ENDPOINT = OFFICIAL ? 'https://query.wikidata.org/sparql' : 'https://qlever.dev/api/wikidata';
const USER_AGENT = 'TriviaAnswerListBuild/1.0 (one-off local build of trivia answer lists)';
// Wikidata's service declares these itself; QLever wants them spelled out.
const PREFIXES = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX psn: <http://www.wikidata.org/prop/statement/value-normalized/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX schema: <http://schema.org/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
`;
// Time between the starts of two requests. The official service gets a
// minute the first time it says to slow down.
const QUICK_GAP_MS = OFFICIAL ? 12000 : 6000;
const SLOW_GAP_MS = 65000;
const TIMEOUT_MS = 120000;
const ATTEMPTS = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wait until GAP_MS has passed since the last request made by any run.
async function pace() {
  const stamp = path.join(CACHE, '.last');
  let last = 0;
  try {
    last = Number(fs.readFileSync(stamp, 'utf8')) || 0;
  } catch (e) {
    /* first request */
  }
  const gap = fs.existsSync(path.join(CACHE, '.slow')) ? SLOW_GAP_MS : QUICK_GAP_MS;
  const wait = last + gap - Date.now();
  if (wait > 0) await sleep(wait);
  fs.writeFileSync(stamp, String(Date.now()));
}

// Resolves to an array of plain { variable: value } rows, or null if the
// query could not be completed.
async function sparql(name, query, options = {}) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, name + '.json');
  if (!options.force && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    await pace();
    const started = Date.now();
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ query: PREFIXES + query }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        const text = (await res.text()).replace(/\s+/g, ' ').slice(0, 240);
        console.error(`${name}: HTTP ${res.status} ${text}`);
        // A timeout means the query is too heavy; one more try is enough.
        // (QLever reports its timeouts as 429, so this is checked first.)
        if (/TimeoutException|timeout|timed out/i.test(text)) {
          if (attempt >= 2) return null;
          continue;
        }
        if (res.status === 429) {
          if (OFFICIAL) fs.writeFileSync(path.join(CACHE, '.slow'), text); // remembered by later runs too
          await sleep(45000 * attempt);
        }
        continue;
      }
      const rows = (await res.json()).results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
      fs.writeFileSync(file, JSON.stringify(rows));
      console.log(`${name}: ${rows.length} rows in ${((Date.now() - started) / 1000).toFixed(1)}s`);
      return rows;
    } catch (e) {
      console.error(`${name}: attempt ${attempt} failed: ${e.message}`);
    }
  }
  return null;
}

module.exports = { sparql, CACHE };

if (require.main === module) {
  const [name, file] = process.argv.slice(2);
  if (!name || !file) {
    console.error('usage: node tools/wdqs.js <name> <file.rq>');
    process.exit(1);
  }
  sparql(name, fs.readFileSync(file, 'utf8'), { force: true }).then((rows) => {
    if (!rows) process.exit(1);
    for (const row of rows.slice(0, 60)) console.log(Object.entries(row).map(([k, v]) => `${k}=${String(v).slice(0, 80)}`).join(' | '));
  });
}
