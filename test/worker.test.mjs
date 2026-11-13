// Run with: node test/worker.test.mjs
// The Worker's request handling, against a stand-in for the database.
import assert from 'node:assert';
import fs from 'node:fs';
import worker, { clean, cleanVisit } from '../worker/src/index.js';

const ORIGIN = 'https://patrickjykang.github.io';
function env() {
  const stored = [];
  const DB = {
    prepare: (sql) => ({ bind: (...values) => ({ sql, values }) }),
    batch: async (statements) => stored.push(...statements),
  };
  return { env: { DB, ALLOWED_ORIGINS: ORIGIN }, stored };
}
const post = (body, origin = ORIGIN) => new Request('https://records.example/', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'text/plain;charset=UTF-8' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const round = (extra = {}) => ({ id: 'rock', name: 'Basalt', raw: 'basalt', tier: 'common', score: 30, ms: 4000, near: false, timeout: false, misses: ['lava rock'], misfits: [], ...extra });
const record = (extra = {}) => ({ v: 1, key: 'ignored', player: 'abc-123', day: 3, done: true, score: 9999, startedAt: 1, finishedAt: 2, rounds: [round()], ...extra });

// A good record is stored, and the browser is allowed to read the answer.
let e = env();
let res = await worker.fetch(post({ records: [record()] }), e.env);
assert.strictEqual(res.status, 200);
assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
assert.strictEqual(e.stored.length, 1);
const [key, player, day, done, score, , , , v, rounds] = e.stored[0].values;
assert.deepStrictEqual([key, player, day, done, v], ['abc-123:3', 'abc-123', 3, 1, 1]);
assert.strictEqual(score, 30, 'the score is added up from the rounds, not taken on trust');
assert.strictEqual(JSON.parse(rounds)[0].misses[0], 'lava rock');
assert(/ON CONFLICT \(key\) DO UPDATE/.test(e.stored[0].sql), 'a second record for the same player and day replaces the first');

// Anything not from the game's own pages is turned away, and nothing is stored.
e = env();
res = await worker.fetch(post({ records: [record()] }, 'https://elsewhere.example'), e.env);
assert.strictEqual(res.status, 403);
assert.strictEqual(e.stored.length, 0);

// Bad input is refused rather than stored.
for (const body of ['not json', { records: [] }, { records: 'x' }, { records: [{ player: 'x y', day: 1, rounds: [] }] }, { records: [record({ day: 'tomorrow' })] }, { records: new Array(21).fill(record()) }]) {
  e = env();
  res = await worker.fetch(post(body), e.env);
  assert.strictEqual(res.status, 400, JSON.stringify(body).slice(0, 60));
  assert.strictEqual(e.stored.length, 0);
}
e = env();
res = await worker.fetch(post('x'.repeat(70000)), e.env);
assert.strictEqual(res.status, 413);

// Oversized or unexpected fields are cut down, and extra fields are dropped.
const c = clean(record({ extra: 'dropped', rounds: [round({ raw: 'r'.repeat(500), tier: 'made-up', score: 5000, misses: new Array(50).fill('g'.repeat(200)), ip: '1.2.3.4' })] }));
const r0 = JSON.parse(c.rounds)[0];
assert.strictEqual(r0.raw.length, 80);
assert.strictEqual(r0.tier, null);
assert.strictEqual(r0.score, 100);
assert.strictEqual(r0.misses.length, 20);
assert.strictEqual(r0.misses[0].length, 80);
assert(!('ip' in r0) && !('extra' in c));
assert.strictEqual(clean(record({ rounds: new Array(8).fill(round()) })), null, 'more than seven prompts is not a climb');

// Other methods store nothing; a browser's preflight gets a plain yes.
res = await worker.fetch(new Request('https://records.example/'), env().env);
assert.strictEqual(res.status, 200);
res = await worker.fetch(new Request('https://records.example/', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env().env);
assert.strictEqual(res.status, 204);

// A visit goes to its own table, and can share a request with a daily climb.
const visit = (extra = {}) => ({ v: 1, kind: 'visit', key: 'ignored', player: 'abc-123', day: 3, started: 2, finished: 1, firstAt: 5, recordedAt: 6, ...extra });
e = env();
res = await worker.fetch(post({ records: [visit(), record()] }), e.env);
assert.strictEqual(res.status, 200);
assert.strictEqual(await res.text(), 'stored 2');
assert.strictEqual(e.stored.length, 2);
const stored = e.stored.find((st) => /INSERT INTO visits/.test(st.sql));
assert.deepStrictEqual(stored.values.slice(0, 6), ['abc-123:3', 'abc-123', 3, 2, 1, 5]);
assert(/MAX\(started, excluded\.started\)/.test(stored.sql), 'counts only go up');
assert(e.stored.some((st) => /INSERT INTO climbs/.test(st.sql)));
// A visit that cannot be used is refused, and absurd counts are cut down.
e = env();
res = await worker.fetch(post({ records: [visit({ player: 'x y' })] }), e.env);
assert.strictEqual(res.status, 400);
assert.strictEqual(e.stored.length, 0);
const cv = cleanVisit(visit({ started: 1e9, finished: -4, ip: '1.2.3.4', rounds: [round()] }));
assert.deepStrictEqual([cv.started, cv.finished], [1000, 0]);
assert(!('ip' in cv) && !('rounds' in cv));

// The real statements against the real schema, where this Node has SQLite built in.
let sqlite = null;
try {
  sqlite = await import('node:sqlite');
} catch (err) {
  /* older Node: the checks above still stand */
}
if (sqlite) {
  const db = new sqlite.DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../worker/schema.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare: (sql) => ({ bind: (...values) => ({ sql, values }) }),
    batch: async (statements) => statements.forEach((st) => db.prepare(st.sql).run(...st.values)),
  };
  const send = (records) => worker.fetch(post({ records }), { DB, ALLOWED_ORIGINS: ORIGIN });
  // Day 3: two visitors; one plays the daily and two unlimited climbs, finishing one.
  await send([visit({ player: 'ann', started: 0, finished: 0 }), visit({ player: 'bob', started: 0, finished: 0 })]);
  await send([visit({ player: 'ann', started: 2, finished: 1 }), record({ player: 'ann' })]);
  await send([visit({ player: 'ann', started: 1, finished: 0 })]); // an older count arriving late changes nothing
  // Day 4: ann is back, and cat is new.
  await send([visit({ player: 'ann', day: 4, started: 1, finished: 1 }), visit({ player: 'cat', day: 4, started: 0, finished: 0 })]);
  const traffic = db.prepare('SELECT * FROM traffic').all().map((row) => ({ ...row }));
  assert.deepStrictEqual(traffic, [
    { day: 3, date: '2026-11-13', visitors: 2, new_visitors: 2, daily_players: 1, daily_finished: 1, unlimited_players: 1, unlimited_started: 2, unlimited_finished: 1 },
    { day: 4, date: '2026-11-14', visitors: 2, new_visitors: 1, daily_players: 0, daily_finished: 0, unlimited_players: 1, unlimited_started: 1, unlimited_finished: 1 },
  ]);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM guesses').get().n, 1, 'the daily climb still lands where it did');
}

console.log(`ok: worker stores good records, refuses the rest, and keeps only what it should${sqlite ? '; traffic adds up in SQLite' : ''}`);
