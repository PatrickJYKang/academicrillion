/*
 * Records what is played, for diagnostics: how many people come, which
 * prompts are too hard, and which real answers the catalogues are missing.
 *
 * Two kinds of record are kept, and neither carries a name, account or
 * address. Both hold a random id made up by this browser.
 *
 *   daily  one per daily climb: the day's number, and for each prompt the
 *          answer given, the guesses that were turned away and the time taken
 *   visit  one per day the game is opened: the day's number, and how many
 *          unlimited climbs were started and finished that day
 *
 * Records wait in this browser until they have been delivered. ENDPOINT is
 * where they go: any URL that accepts a POST of { records: [...] } as JSON
 * and answers with a 2xx status (worker/ holds the one this game uses). While
 * it is empty nothing leaves the device, and the records simply wait. Nothing
 * is sent from a copy of the game running on a developer's own machine.
 */
(function () {
  'use strict';

  const ENDPOINT = 'https://academicrillion-records.patrickjykang.workers.dev/';
  const LOCAL = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const VERSION = 1;
  const PLAYER_KEY = 'academicrillion.player';
  const OUTBOX_KEY = 'academicrillion.outbox';
  const VISIT_KEY = 'academicrillion.visit';
  const OUTBOX_LIMIT = 60; // records kept while waiting; the oldest go first
  const BATCH = 10; // records per request

  const read = (key) => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null; // storage blocked
    }
  };
  const write = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      /* nothing can be kept; the record is lost with the page */
    }
  };

  // A random id that says only "the same browser as last time".
  function player() {
    let id = read(PLAYER_KEY);
    if (!id) {
      id = window.crypto && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
      write(PLAYER_KEY, id);
    }
    return id;
  }

  function outbox() {
    try {
      const list = JSON.parse(read(OUTBOX_KEY));
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  let sending = false;

  async function flush() {
    if (!ENDPOINT || LOCAL || sending) return;
    sending = true;
    try {
      for (;;) {
        const batch = outbox().slice(0, BATCH);
        if (!batch.length) break;
        // Sent as plain text so the browser makes one simple request.
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({ records: batch }),
          keepalive: true,
        });
        // A batch the server says it will never take must not block the rest.
        const refused = res.status === 400 || res.status === 413;
        if (!res.ok && !refused) break;
        // Drop exactly what was sent; anything queued meanwhile stays.
        const sent = new Set(batch.map((r) => r.key));
        write(OUTBOX_KEY, JSON.stringify(outbox().filter((r) => !sent.has(r.key))));
      }
    } catch (e) {
      /* offline or refused: try again next time */
    }
    sending = false;
  }

  // Queue a record and try to deliver it. A later record with the same key
  // replaces an earlier one that is still waiting.
  function queue(record) {
    const list = outbox().filter((r) => r.key !== record.key);
    list.push(record);
    write(OUTBOX_KEY, JSON.stringify(list.slice(-OUTBOX_LIMIT)));
    flush();
  }

  // Queue one daily climb, finished or abandoned: one record per player per day.
  function daily(climb) {
    const id = player();
    queue(Object.assign({ v: VERSION, key: `${id}:${climb.day}`, player: id, recordedAt: Date.now() }, climb));
  }

  // What this browser has done on `day`, if it has been here: { day, started, finished, at }.
  function visitOn(day) {
    try {
      const v = JSON.parse(read(VISIT_KEY));
      return v && v.day === day ? v : null;
    } catch (e) {
      return null;
    }
  }

  // One visit record per player per day. Its counts only grow, so the latest says everything.
  function sendVisit(v) {
    write(VISIT_KEY, JSON.stringify(v));
    if (LOCAL) return; // a developer's own visits are not traffic
    const id = player();
    queue({ v: VERSION, kind: 'visit', key: `${id}:v:${v.day}`, player: id, recordedAt: Date.now(), day: v.day, started: v.started, finished: v.finished, firstAt: v.at });
  }

  // Count this browser as a visitor on `day`. Calling it again that day does nothing.
  function visit(day) {
    if (!visitOn(day)) sendVisit({ day, started: 0, finished: 0, at: Date.now() });
  }

  // Count one unlimited climb on `day`: what is 'started' or 'finished'.
  function unlimited(day, what) {
    if (what !== 'started' && what !== 'finished') return;
    const v = visitOn(day) || { day, started: 0, finished: 0, at: Date.now() };
    v[what] += 1;
    sendVisit(v);
  }

  window.RECORDER = { daily, visit, unlimited, flush, pending: () => outbox().length, endpoint: ENDPOINT };
  window.addEventListener('online', flush);
  flush();
})();
