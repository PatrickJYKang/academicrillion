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

  console.log('ok: recorder queues, replaces, delivers, retries, stays local on localhost and stays bounded');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
