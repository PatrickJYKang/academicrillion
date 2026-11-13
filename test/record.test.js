// Run with: node test/record.test.js
// The recorder is browser code, so it runs here against stand-ins for the
// page: a storage object, a fetch that can be told to fail, and a test URL.
const assert = require('assert');
const fs = require('fs');
const source = fs.readFileSync(__dirname + '/../js/record.js', 'utf8');
assert(source.includes("const ENDPOINT = '';") || /const ENDPOINT = 'https:\/\//.test(source), 'ENDPOINT should be empty or an https URL');

function page(endpoint, { failing = false, host = 'game.example', protocol = 'https:' } = {}) {
  const kept = new Map();
  const sent = [];
  const win = { addEventListener() {}, crypto: { randomUUID: () => 'test-player' } };
  const localStorage = { getItem: (k) => (kept.has(k) ? kept.get(k) : null), setItem: (k, v) => kept.set(k, String(v)) };
  const net = { failing };
  const fetch = async (url, options) => {
    if (net.refusing) return { ok: false, status: 400 };
    if (net.failing) return { ok: false };
    sent.push({ url, body: JSON.parse(options.body), type: options.headers['Content-Type'] });
    return { ok: true };
  };
  const code = source.replace(/const ENDPOINT = '[^']*';/, `const ENDPOINT = ${JSON.stringify(endpoint)};`);
  new Function('window', 'localStorage', 'fetch', 'crypto', 'location', code)(win, localStorage, fetch, win.crypto, { hostname: host, protocol });
  return { recorder: win.RECORDER, kept, sent, net };
}
const settle = () => new Promise((r) => setTimeout(r, 10));
const climb = (day, score) => ({ day, done: true, score, startedAt: 1, finishedAt: 2, rounds: [{ id: 'rock', name: 'Basalt', raw: 'basalt', tier: 'common', score: 30, ms: 4000, near: false, timeout: false, misses: ['lava rock'], misfits: [] }] });

(async () => {
  // With no endpoint, records wait on the device and nothing is sent.
  let p = page('');
  p.recorder.daily(climb(3, 200));
  await settle();
  assert.strictEqual(p.sent.length, 0);
  assert.strictEqual(p.recorder.pending(), 1);

  // One record per player per day: a second for the same day replaces the first.
  p.recorder.daily(climb(3, 250));
  p.recorder.daily(climb(4, 100));
  assert.strictEqual(p.recorder.pending(), 2);
  const queued = JSON.parse(p.kept.get('academicrillion.outbox'));
  assert.deepStrictEqual(queued.map((r) => [r.day, r.score]), [[3, 250], [4, 100]]);
  assert(queued.every((r) => r.player === 'test-player' && r.v === 1 && r.key === `test-player:${r.day}`));
  // Nothing in a record says who played.
  assert.deepStrictEqual(Object.keys(queued[0]).sort(), ['day', 'done', 'finishedAt', 'key', 'player', 'recordedAt', 'rounds', 'score', 'startedAt', 'v']);

  // With an endpoint, a record is delivered as { records: [...] } and then forgotten.
  p = page('https://example.test/record');
  p.recorder.daily(climb(5, 300));
  await settle();
  assert.strictEqual(p.sent.length, 1);
  assert.strictEqual(p.sent[0].url, 'https://example.test/record');
  assert.strictEqual(p.sent[0].body.records[0].rounds[0].misses[0], 'lava rock');
  assert(p.sent[0].type.startsWith('text/plain'));
  assert.strictEqual(p.recorder.pending(), 0);

  // A refused delivery keeps the record, and the next attempt sends it.
  p = page('https://example.test/record', { failing: true });
  p.recorder.daily(climb(6, 120));
  await settle();
  assert.strictEqual(p.recorder.pending(), 1);
  p.net.failing = false;
  await p.recorder.flush();
  assert.strictEqual(p.recorder.pending(), 0);
  assert.strictEqual(p.sent.length, 1);

  // A copy of the game on a developer's machine sends nothing.
  for (const where of [{ host: 'localhost', protocol: 'http:' }, { host: '127.0.0.1', protocol: 'http:' }, { host: '', protocol: 'file:' }]) {
    p = page('https://example.test/record', where);
    p.recorder.daily(climb(7, 90));
    await settle();
    assert.strictEqual(p.sent.length, 0);
    assert.strictEqual(p.recorder.pending(), 1);
  }

  // The queue is bounded: the oldest records are dropped first.
  p = page('');
  for (let day = 1; day <= 75; day++) p.recorder.daily(climb(day, day));
  assert.strictEqual(p.recorder.pending(), 60);
  assert.strictEqual(JSON.parse(p.kept.get('academicrillion.outbox'))[0].day, 16);

  // A visit is counted once a day; unlimited climbs raise the same record's counts.
  p = page('');
  p.recorder.visit(8);
  p.recorder.visit(8);
  assert.strictEqual(p.recorder.pending(), 1);
  p.recorder.unlimited(8, 'started');
  p.recorder.unlimited(8, 'started');
  p.recorder.unlimited(8, 'finished');
  p.recorder.unlimited(8, 'sideways'); // not a thing that can be counted
  assert.strictEqual(p.recorder.pending(), 1, 'still one record for the day');
  let visits = JSON.parse(p.kept.get('academicrillion.outbox'));
  assert.deepStrictEqual([visits[0].kind, visits[0].key, visits[0].day, visits[0].started, visits[0].finished], ['visit', 'test-player:v:8', 8, 2, 1]);
  assert.deepStrictEqual(Object.keys(visits[0]).sort(), ['day', 'finished', 'firstAt', 'key', 'kind', 'player', 'recordedAt', 'started', 'v']);
  // The next day is a new visit, and a climb started without opening the home screen still counts one.
  p.recorder.unlimited(9, 'started');
  p.recorder.daily(climb(9, 100));
  visits = JSON.parse(p.kept.get('academicrillion.outbox'));
  assert.deepStrictEqual(visits.map((r) => r.key), ['test-player:v:8', 'test-player:v:9', 'test-player:9'], 'a visit and a daily climb on the same day are separate records');
  assert.deepStrictEqual([visits[1].started, visits[1].finished], [1, 0]);

  // Visits are delivered like any other record...
  p = page('https://example.test/record');
  p.recorder.visit(10);
  await settle();
  assert.strictEqual(p.sent.length, 1);
  assert.strictEqual(p.sent[0].body.records[0].kind, 'visit');
  assert.strictEqual(p.recorder.pending(), 0);
  // ...and each change sends the day's record again with the new counts.
  p.recorder.unlimited(10, 'started');
  await settle();
  assert.deepStrictEqual([p.sent.length, p.sent[1].body.records[0].started], [2, 1]);

  // ...but not from a developer's machine, where they are not even queued.
  p = page('https://example.test/record', { host: 'localhost', protocol: 'http:' });
  p.recorder.visit(11);
  p.recorder.unlimited(11, 'started');
  await settle();
  assert.deepStrictEqual([p.sent.length, p.recorder.pending()], [0, 0]);

  // Records the server says it will never take are dropped, so they cannot block the rest.
  p = page('https://example.test/record');
  p.net.refusing = true;
  p.recorder.daily(climb(12, 50));
  await settle();
  assert.strictEqual(p.recorder.pending(), 0);
  p.net.refusing = false;
  p.recorder.daily(climb(13, 60));
  await settle();
  assert.deepStrictEqual([p.sent.length, p.recorder.pending()], [1, 0]);

  console.log('ok: recorder queues, replaces, delivers, retries, counts visits, stays local on localhost and stays bounded');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
