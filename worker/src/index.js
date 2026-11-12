/*
 * Where daily climbs are recorded: a Cloudflare Worker in front of a D1
 * database. The game posts { records: [...] } (see js/record.js); each record
 * becomes one row, replacing any earlier row for the same player and day.
 *
 * The Worker only takes records in. There is no way to read them back over
 * the web: look at them with `wrangler d1 execute` (see the README).
 *
 * Nothing about the sender is stored: no address, no browser details.
 */
const MAX_BODY = 64 * 1024; // bytes
const MAX_RECORDS = 20; // per request
const ROUNDS = 7;
const MAX_GUESSES = 20; // per prompt, of each kind
const TIERS = new Set(['obvious', 'decoy', 'common', 'uncommon', 'obscure', 'outlier']);

const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);
const whole = (v, min, max) => (Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : null);
const list = (v, max) => (Array.isArray(v) ? v.filter((g) => typeof g === 'string' && g).slice(0, MAX_GUESSES).map((g) => g.slice(0, max)) : []);

// Keep only the fields the game sends, each cut down to a sane size.
function clean(record) {
  if (!record || typeof record !== 'object') return null;
  const player = text(record.player, 64);
  const day = whole(record.day, 1, 100000);
  if (!player || !/^[\w-]+$/.test(player) || day === null || !Array.isArray(record.rounds) || record.rounds.length > ROUNDS) return null;
  const rounds = record.rounds.map((r) => ({
    id: text(r && r.id, 40) || '',
    name: text(r && r.name, 160),
    raw: text(r && r.raw, 80) || '',
    tier: r && TIERS.has(r.tier) ? r.tier : null,
    score: whole(r && r.score, 0, 100) || 0,
    ms: whole(r && r.ms, 0, 60000),
    near: !!(r && r.near),
    timeout: !!(r && r.timeout),
    left: !!(r && r.left),
    misses: list(r && r.misses, 80),
    misfits: list(r && r.misfits, 80),
  }));
  return {
    key: `${player}:${day}`,
    player,
    day,
    done: record.done ? 1 : 0,
    score: Math.min(700, rounds.reduce((sum, r) => sum + r.score, 0)),
    startedAt: whole(record.startedAt, 0, 1e14),
    finishedAt: whole(record.finishedAt, 0, 1e14),
    v: whole(record.v, 0, 1000) || 0,
    rounds: JSON.stringify(rounds),
  };
}

const INSERT = `INSERT INTO climbs (key, player, day, done, score, started_at, finished_at, received_at, v, rounds)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (key) DO UPDATE SET done = excluded.done, score = excluded.score, started_at = excluded.started_at,
    finished_at = excluded.finished_at, received_at = excluded.received_at, v = excluded.v, rounds = excluded.rounds`;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const cors = { 'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || '', Vary: 'Origin' };
    const reply = (status, message) => new Response(message, { status, headers: cors });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Max-Age': '86400' } });
    if (request.method !== 'POST') return reply(200, 'Academicrillion daily climb records. POST only.');
    // Records are only expected from the game's own pages.
    if (!allowed.includes(origin)) return reply(403, 'not from the game');

    const body = await request.text();
    if (body.length > MAX_BODY) return reply(413, 'too large');
    let records;
    try {
      records = JSON.parse(body).records;
    } catch (e) {
      return reply(400, 'not JSON');
    }
    if (!Array.isArray(records) || !records.length || records.length > MAX_RECORDS) return reply(400, 'expected { records: [...] }');

    const rows = records.map(clean).filter(Boolean);
    if (!rows.length) return reply(400, 'no usable records');
    const now = Date.now();
    await env.DB.batch(rows.map((r) => env.DB.prepare(INSERT).bind(r.key, r.player, r.day, r.done, r.score, r.startedAt, r.finishedAt, now, r.v, r.rounds)));
    return reply(200, `stored ${rows.length}`);
  },
};

export { clean };
