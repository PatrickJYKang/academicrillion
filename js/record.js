/*
 * Records each daily climb, for diagnostics: which prompts are too hard, and
 * which real answers the catalogues are missing.
 *
 * A record carries no name, account or address. It holds a random id made up
 * by this browser, the day's number, and for each prompt the answer given,
 * the guesses that were turned away and how long it took.
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
        if (!res.ok) break;
        // Drop exactly what was sent; anything queued meanwhile stays.
        const sent = new Set(batch.map((r) => r.key));
        write(OUTBOX_KEY, JSON.stringify(outbox().filter((r) => !sent.has(r.key))));
      }
    } catch (e) {
      /* offline or refused: try again next time */
    }
    sending = false;
  }

  // Queue one daily climb, finished or abandoned, and try to deliver it.
  function daily(climb) {
    const id = player();
    const record = Object.assign({ v: VERSION, key: `${id}:${climb.day}`, player: id, recordedAt: Date.now() }, climb);
    // One record per player per day: a later one replaces an earlier one.
    const list = outbox().filter((r) => r.key !== record.key);
    list.push(record);
    write(OUTBOX_KEY, JSON.stringify(list.slice(-OUTBOX_LIMIT)));
    flush();
  }

  window.RECORDER = { daily, flush, pending: () => outbox().length, endpoint: ENDPOINT };
  window.addEventListener('online', flush);
  flush();
})();
