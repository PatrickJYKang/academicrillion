// Run with: node test/worker.test.mjs
// The Worker's request handling, against a stand-in for the database.
import assert from 'node:assert';
import worker, { clean } from '../worker/src/index.js';

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

console.log('ok: worker stores good records, refuses the rest, and keeps only what it should');
