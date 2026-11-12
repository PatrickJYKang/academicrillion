/*
 * The playable page: intro -> seven timed rounds -> results, then the next
 * climb. All game rules live in engine.js and the backdrop in scene.js; this
 * file is timing, input and DOM.
 */
(function () {
  'use strict';

  const O = window.GAME;
  const tower = window.TOWER || { climbTo() {}, setMarks() {} };
  const PREVIEW_MS = 3000; // the prompt is shown before the clock starts
  const ANSWER_MS = 25000;
  const FEEDBACK_MS = 3200; // how long a result stays up before moving on
  const SKIP_GUARD_MS = 350; // ignore the keypress that submitted the answer
  const HISTORY_LIMIT = 500;
  const POINTS_PER_FLOOR = 10;
  const TOP_FLOOR = O.MAX_SCORE / POINTS_PER_FLOOR;
  const STORE_KEY = 'academicrillion.v1';
  const OLD_STORE_KEY = 'outlier.v1'; // the game's working name before it had one

  const view = document.getElementById('view');
  const runLabel = document.getElementById('runLabel');

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const sharePct = (share) => {
    const v = share * 100;
    return (v >= 9.95 ? Math.round(v) : v >= 0.995 ? v.toFixed(1) : v.toFixed(2)) + '%';
  };
  const dayKey = (ms) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Tick a number up to its new value in a few steps, like a mechanical counter.
  function countTo(el, to, prefix = '', steps = 8) {
    const from = Number(el.textContent.replace(/[^0-9]/g, '')) || 0;
    clearInterval(el.ticking);
    if (calm || from === to) {
      el.textContent = prefix + to;
      return;
    }
    let i = 0;
    el.ticking = setInterval(() => {
      i++;
      el.textContent = prefix + Math.round(from + ((to - from) * i) / steps);
      if (i >= steps) clearInterval(el.ticking);
    }, 45);
  }

  const floorOf = (points) => Math.floor(points / POINTS_PER_FLOOR);
  const floorsClimbed = (points) => {
    const f = points / POINTS_PER_FLOOR;
    return `${Number.isInteger(f) ? f : f.toFixed(1)} ${f === 1 ? 'floor' : 'floors'}`;
  };

  // ------------------------------------------------------------------ logbook

  function loadStore() {
    try {
      // Carry a log over from the old name the first time.
      if (localStorage.getItem(STORE_KEY) === null && localStorage.getItem(OLD_STORE_KEY) !== null) {
        localStorage.setItem(STORE_KEY, localStorage.getItem(OLD_STORE_KEY));
        localStorage.removeItem(OLD_STORE_KEY);
      }
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && Number.isInteger(s.nextRun) && s.nextRun >= 1 && Array.isArray(s.history)) return s;
    } catch (e) {
      /* unreadable or blocked storage: start fresh */
    }
    return { nextRun: 1, history: [] };
  }

  function saveStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (e) {
      /* the game still works without persistence */
    }
  }

  let store = loadStore();

  function logbookStats() {
    const h = store.history;
    if (!h.length) return null;
    const scores = h.map((r) => r.score);
    // Consecutive calendar days played, counting back from the latest one.
    const days = [...new Set(h.map((r) => dayKey(r.at)))];
    let streak = 0;
    const cursor = new Date(h[h.length - 1].at);
    while (days.includes(dayKey(cursor.getTime()))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return {
      played: h.length,
      average: Math.round(scores.reduce((a, b) => a + b, 0) / h.length),
      best: Math.max(...scores),
      streak,
    };
  }

  function logbookHtml() {
    const s = logbookStats();
    if (!s) return '<p class="muted">No climbs logged yet.</p>';
    return `<dl class="stats">
      <div><dt>Climbs</dt><dd>${s.played}</dd></div>
      <div><dt>Average</dt><dd>${s.average}</dd></div>
      <div><dt>Highest</dt><dd>${s.best}</dd></div>
      <div><dt>Day streak</dt><dd>${s.streak}</dd></div>
    </dl>`;
  }

  // -------------------------------------------------------------------- intro

  let S = null; // the climb in progress, if any

  // Keep the backdrop in step with the game: how high, and a flag per round.
  function syncTower() {
    let total = 0;
    tower.setMarks(S ? S.results.map((r) => ({ points: (total += r.score), tier: r.tier })) : []);
    tower.climbTo(total);
  }

  function tiersHtml() {
    return `<ul class="tiers">${O.TIER_ORDER.map((id) => {
      const t = O.TIERS[id];
      return `<li class="tier-${id}"><span class="spine"></span><b>${esc(t.name)}</b><span class="pts">+${t.score}</span><span class="muted">${esc(t.blurb)}</span></li>`;
    }).join('')}</ul>`;
  }

  function showIntro() {
    S = null;
    syncTower();
    runLabel.textContent = '';
    view.innerHTML = `
      <div class="intro panel">
        <p class="eyebrow">The library tower</p>
        <p class="tagline">7 prompts · 25 seconds each · rarer answers climb higher</p>
        <p class="muted subjects">${Object.values(O.SUBJECTS).map(esc).join(' · ')}</p>
        <button class="primary wide" id="start" type="button">Start climb #${store.nextRun}</button>
        <ol class="how">
          <li>Each prompt has a long catalogue of valid answers. Type any one of them.</li>
          <li>A guess that isn't in the catalogue costs nothing. Keep trying until the clock runs out.</li>
          <li>The fewer readers who would give your answer, the higher it takes you. Ten points is one floor, and a perfect climb reaches the lantern room on floor ${TOP_FLOOR}.</li>
          <li>Some shelves run deep: hundreds of volcanoes, theorems and composers. Past the best known, everything counts as a ${esc(O.TIERS.obscure.name)}.</li>
        </ol>
        <h3>The shelves</h3>
        ${tiersHtml()}
        <h3>Climbing log</h3>
        ${logbookHtml()}
        ${store.history.length ? '<button class="link" id="reset" type="button">Erase the log</button>' : ''}
      </div>`;
    const start = document.getElementById('start');
    start.addEventListener('click', () => startRun(store.nextRun));
    start.focus({ preventScroll: true });
    const reset = document.getElementById('reset');
    if (reset) {
      reset.addEventListener('click', () => {
        if (reset.dataset.armed) {
          store = { nextRun: 1, history: [] };
          saveStore();
          showIntro();
        } else {
          reset.dataset.armed = '1';
          reset.textContent = 'Click again to erase every climb';
        }
      });
    }
  }

  // ------------------------------------------------------------------- rounds

  function startRun(run) {
    S = { run, prompts: O.promptsForRun(run), results: [], roundIndex: 0, phase: 'preview', pausedAt: null };
    runLabel.textContent = `Climb #${run}`;
    syncTower();
    window.scrollTo(0, 0);
    beginRound(0);
  }

  const score = () => S.results.reduce((sum, r) => sum + r.score, 0);
  const prompt = () => S.prompts[S.roundIndex];

  function pipsHtml(fresh) {
    let html = '';
    for (let i = 0; i < O.ROUNDS; i++) {
      const r = S.results[i];
      const cls = r ? `tier-${r.tier || 'miss'} done${fresh && i === S.results.length - 1 ? ' fresh' : ''}` : i === S.roundIndex ? 'now' : '';
      html += `<i class="pip ${cls}"></i>`;
    }
    return html;
  }

  function beginRound(i) {
    const now = Date.now();
    S.roundIndex = i;
    S.phase = 'preview';
    S.previewEndsAt = now + PREVIEW_MS;
    S.answerEndsAt = S.previewEndsAt + ANSWER_MS;
    view.innerHTML = `
      <div class="round">
        <div class="hud">
          <span>Floor <b id="floor">${floorOf(score())}</b></span>
          <span class="pips" id="pips">${pipsHtml()}</span>
          <span>Score <b id="score">${score()}</b></span>
        </div>
        <div class="panel">
          <p class="eyebrow">Prompt ${i + 1} of ${O.ROUNDS} · ${esc(O.SUBJECTS[prompt().subject])}</p>
          <h2 class="prompt">${esc(prompt().text)}</h2>
          <div class="clock" id="clock">
            <div class="clock-track"><i id="bar"></i></div>
            <span class="clock-secs" id="secs"></span>
          </div>
          <div id="stage">
            <form id="answerForm" autocomplete="off">
              <input id="answer" type="text" maxlength="80" disabled placeholder="Get ready…"
                autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Your answer" />
              <button class="primary" id="submit" type="submit" disabled>Enter</button>
            </form>
            <p class="msg" id="msg" role="status" aria-live="polite"></p>
          </div>
        </div>
      </div>`;
    document.getElementById('answerForm').addEventListener('submit', onSubmit);
    document.getElementById('answer').addEventListener('input', () => {
      // Editing a suggested correction means it was not what they meant.
      if (S && S.phase === 'answering') setMessage('');
    });
    tick();
  }

  function setMessage(text, kind) {
    const msg = document.getElementById('msg');
    if (!msg) return;
    msg.textContent = text;
    msg.className = 'msg' + (kind ? ' ' + kind : '');
  }

  function beginAnswering() {
    S.phase = 'answering';
    const input = document.getElementById('answer');
    input.disabled = false;
    input.placeholder = 'Type an answer';
    document.getElementById('submit').disabled = false;
    input.focus({ preventScroll: true });
  }

  function refuse(raw, misfit) {
    const text = misfit ? `"${raw}" doesn't fit this prompt. Try again.` : `"${raw}" isn't in the catalogue. Try again.`;
    const input = document.getElementById('answer');
    input.value = '';
    setMessage(text, 'bad');
    const form = document.getElementById('answerForm');
    form.classList.remove('shake');
    void form.offsetWidth; // restart the animation
    form.classList.add('shake');
    input.focus({ preventScroll: true });
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!S || S.phase !== 'answering' || S.pausedAt) return;
    const input = document.getElementById('answer');
    const raw = input.value.trim();
    if (!raw) return;
    const res = O.match(prompt(), raw);
    if (res.type === 'exact') {
      land(res.answer, raw);
    } else if (res.type === 'near') {
      // Show the corrected spelling and let them confirm it with another Enter.
      input.value = res.answer.name;
      input.select();
      setMessage(`Did you mean "${res.answer.name}"? Press Enter to confirm.`, 'hint');
    } else {
      refuse(raw, res.known);
    }
  }

  // The clock ran out: whatever is in the box is the final answer, and a
  // near-miss spelling is accepted without asking.
  function timeUp() {
    const input = document.getElementById('answer');
    const raw = input ? input.value.trim() : '';
    const res = raw ? O.match(prompt(), raw) : { type: 'none' };
    land(res.type === 'none' ? null : res.answer, raw);
  }

  function land(answer, raw) {
    const result = { prompt: prompt(), raw, answer, tier: answer ? answer.tier : null, score: answer ? answer.score : 0 };
    S.results.push(result);
    S.phase = 'feedback';
    S.feedbackStartedAt = Date.now();
    S.feedbackEndsAt = S.feedbackStartedAt + FEEDBACK_MS;
    syncTower();

    const total = score();
    countTo(document.getElementById('score'), total);
    countTo(document.getElementById('floor'), floorOf(total));
    document.getElementById('pips').innerHTML = pipsHtml(true);
    if (answer) tower.burst(answer.tier, result.score);
    document.getElementById('clock').classList.add('stopped');

    const last = S.roundIndex === O.ROUNDS - 1;
    const tier = answer ? O.TIERS[answer.tier] : null;
    const note = !answer
      ? null
      : answer.tail
        ? `${esc(tier.blurb)} It is one of ${O.catalogue(prompt()).total.toLocaleString()} answers in this catalogue, from past the part anyone ranks by hand.`
        : `${esc(tier.blurb)} About ${sharePct(answer.share)} of readers would say this.`;
    const missNote =
      raw
        ? `Time's up. "${esc(raw)}" isn't in the catalogue, so you stay on floor ${floorOf(total)}.`
        : `Time's up with nothing in the box. You stay on floor ${floorOf(total)}.`;
    document.getElementById('stage').innerHTML = `
      <div class="card tier-${answer ? answer.tier : 'miss'}">
        <div class="card-head">
          <span class="tier-name">${answer ? esc(tier.name) : 'No answer'}</span>
          <span class="points" id="points">+0</span>
        </div>
        ${answer ? `<div class="card-answer">${esc(answer.name)}</div>` : ''}
        <div class="meter"><i style="width:${result.score}%"></i></div>
        <p class="card-climb">${answer ? `▲ Up ${floorsClimbed(result.score)}` : '▬ No floors gained'}</p>
        <p class="card-note">${note || missNote}</p>
        ${answer && answer.fact ? `<p class="fact">${esc(answer.fact)}</p>` : ''}
        <button class="link" id="next" type="button">${last ? 'See how high you got' : 'Next prompt'} ↵</button>
      </div>`;
    document.getElementById('next').addEventListener('click', nextRound);
    countTo(document.getElementById('points'), result.score, '+');
  }

  function nextRound() {
    if (!S || S.phase !== 'feedback') return;
    if (S.roundIndex + 1 < O.ROUNDS) beginRound(S.roundIndex + 1);
    else finish();
  }

  // The clock is frozen while the page is hidden. This is checked on every
  // tick as well as on the browser's event, because the event doesn't always
  // arrive (embedded panes, tabs restored from the background).
  function syncPause() {
    if (!S || S.phase === 'done') return;
    if (document.hidden) {
      if (!S.pausedAt) S.pausedAt = Date.now();
    } else if (S.pausedAt) {
      const away = Date.now() - S.pausedAt;
      S.pausedAt = null;
      for (const k of ['previewEndsAt', 'answerEndsAt', 'feedbackEndsAt']) if (S[k]) S[k] += away;
    }
  }

  function tick() {
    syncPause();
    if (!S || S.pausedAt) return;
    const now = Date.now();
    if (S.phase === 'preview') {
      const left = S.previewEndsAt - now;
      if (left <= 0) {
        beginAnswering();
      } else {
        document.getElementById('bar').style.width = '100%';
        document.getElementById('secs').textContent = Math.ceil(left / 1000);
        document.getElementById('clock').className = 'clock waiting';
        return;
      }
    }
    if (S.phase === 'answering') {
      const left = S.answerEndsAt - now;
      if (left <= 0) {
        timeUp();
        return;
      }
      document.getElementById('bar').style.width = (left / ANSWER_MS) * 100 + '%';
      document.getElementById('secs').textContent = Math.ceil(left / 1000);
      document.getElementById('clock').className = 'clock' + (left <= 5000 ? ' urgent' : '');
    } else if (S.phase === 'feedback' && now >= S.feedbackEndsAt) {
      nextRound();
    }
  }

  // ------------------------------------------------------------------ results

  function finish() {
    S.phase = 'done';
    const total = score();
    const field = O.simulateField(S.prompts, S.run);
    S.total = total;
    S.field = field;
    S.percentile = O.percentile(field, total);

    store.history.push({ run: S.run, score: total, tiers: S.results.map((r) => r.tier), at: Date.now() });
    if (store.history.length > HISTORY_LIMIT) store.history.splice(0, store.history.length - HISTORY_LIMIT);
    store.nextRun = Math.max(store.nextRun, S.run + 1);
    saveStore();
    showResults();
  }

  // Each round is a step that starts where the last one ended, so the chart
  // is the staircase you actually climbed.
  function stairsHtml() {
    const total = S.total || 1;
    let before = 0;
    return `<div class="stairs">${S.results
      .map((r, i) => {
        const bottom = (before / total) * 100;
        before += r.score;
        return `<div class="step tier-${r.tier || 'miss'}" data-round="${i}" style="--i:${i}" role="button" tabindex="0" aria-label="Round ${i + 1}: ${esc(r.answer ? r.answer.name : 'no answer')}, ${r.score} points">
          <i style="bottom:${bottom}%;height:${(r.score / total) * 100}%"><span>+${r.score}</span></i>
          <b>${i + 1}</b>
        </div>`;
      })
      .join('')}<div class="tip" id="tip" hidden></div></div>`;
  }

  function histogramHtml(field, total) {
    const BUCKET = 50;
    const count = O.MAX_SCORE / BUCKET;
    const bins = new Array(count).fill(0);
    const at = (v) => Math.min(count - 1, Math.floor(v / BUCKET));
    field.forEach((v) => bins[at(v)]++);
    const peak = Math.max(...bins);
    const mine = at(total);
    const bars = bins
      .map((n, i) => `<i class="${i === mine ? 'you' : ''}" style="--i:${i};height:${Math.max(3, (n / peak) * 100)}%" title="${i * BUCKET}–${i === count - 1 ? O.MAX_SCORE : i * BUCKET + BUCKET - 1}: ${n} climbers"></i>`)
      .join('');
    return `<div class="histo">${bars}</div>
      <div class="histo-axis"><span>Floor 0</span><span>35</span><span>${TOP_FLOOR}</span></div>`;
  }

  const SEARCH_LIMIT = 60; // most rows shown for one search

  function answerRowHtml(a, mine) {
    const you = a === mine;
    return `<li class="tier-${a.tier}${you ? ' you' : ''}">
      <span class="spine"></span>
      <span class="a-name">${esc(a.name)}${you ? ' <em>you</em>' : ''}${a.fact ? `<small>${esc(a.fact)}</small>` : ''}</span>
      <span class="a-share">${a.share == null ? '' : sharePct(a.share)}</span>
      <span class="pts">+${a.score}</span>
    </li>`;
  }

  // A round's catalogue: a filter per tier, a search box, and the answers.
  function answerListHtml(result, i) {
    const cat = O.catalogue(result.prompt);
    const chip = (tier, label, count) => `<button class="chip${tier ? ` tier-${tier}` : ''}" type="button" data-tier="${tier}" aria-pressed="${tier ? 'false' : 'true'}">${esc(label)} ${count.toLocaleString()}</button>`;
    const chips = chip('', 'All', cat.total) + O.TIER_ORDER.filter((t) => cat.tiers[t]).map((t) => chip(t, O.TIERS[t].name, cat.tiers[t])).join('');
    return `<div class="catalogue" data-round="${i}" data-tier="">
      <div class="chips">${chips}</div>
      ${cat.total > cat.listed ? `<input class="search" type="search" placeholder="Search all ${cat.total.toLocaleString()} answers…" aria-label="Search this round's answers" />` : ''}
      <ul class="answers"></ul>
      <p class="muted more" hidden></p>
    </div>`;
  }

  // Fill a catalogue's list from its current filter and search text. With
  // neither, it shows the hand-ranked answers; otherwise the best-known matches.
  function fillCatalogue(box) {
    const result = S.results[Number(box.dataset.round)];
    const mine = result.answer;
    const search = box.querySelector('.search');
    const text = search ? search.value.trim() : '';
    const tier = box.dataset.tier;
    const list = box.querySelector('.answers');
    const more = box.querySelector('.more');
    let rows;
    let total;
    if (!text && !tier) {
      rows = result.prompt.answers.slice().sort((x, y) => y.score - x.score || x.name.localeCompare(y.name));
      if (mine && mine.tail) rows.unshift(mine);
      total = O.catalogue(result.prompt).total;
    } else {
      ({ found: rows, total } = O.search(result.prompt, text, SEARCH_LIMIT, tier));
    }
    list.innerHTML = rows.length ? rows.map((a) => answerRowHtml(a, mine)).join('') : `<li class="none">Nothing here matches "${esc(text)}".</li>`;
    more.hidden = total <= rows.length;
    more.textContent = `…and ${(total - rows.length).toLocaleString()} more`;
  }

  function onSearch(e) {
    if (e.target.classList.contains('search')) fillCatalogue(e.target.closest('.catalogue'));
  }

  function onChip(chip) {
    const box = chip.closest('.catalogue');
    box.dataset.tier = chip.dataset.tier;
    for (const c of box.querySelectorAll('.chip')) c.setAttribute('aria-pressed', String(c === chip));
    fillCatalogue(box);
  }

  // ---- the staircase and the round list point at each other

  const roundOf = (el) => el && el.closest('[data-round]');

  function light(round, on) {
    for (const el of view.querySelectorAll(`.step[data-round="${round}"], .rr[data-round="${round}"]`)) el.classList.toggle('lit', on);
  }

  function showTip(step) {
    const tip = document.getElementById('tip');
    if (!tip) return;
    if (!step) {
      tip.hidden = true;
      return;
    }
    const r = S.results[Number(step.dataset.round)];
    const bar = step.querySelector('i');
    tip.textContent = r.answer ? r.answer.name : r.raw || 'No answer';
    tip.className = `tip tier-${r.tier || 'miss'}`;
    tip.hidden = false;
    // Centred over the step, but kept inside the chart.
    const half = tip.offsetWidth / 2;
    const centre = step.offsetLeft + step.offsetWidth / 2;
    tip.style.left = Math.max(half, Math.min(step.parentElement.clientWidth - half, centre)) + 'px';
    tip.style.top = step.offsetTop + bar.offsetTop - 22 + 'px';
  }

  function onHover(e, on) {
    const el = roundOf(e.target);
    if (!el || !S || S.phase !== 'done' || !el.matches('.step, .rr')) return;
    if (roundOf(e.relatedTarget) === el) return; // moving around inside it
    light(el.dataset.round, on);
    if (el.matches('.step')) showTip(on ? el : null);
  }

  function openRound(step) {
    const row = view.querySelector(`.rr[data-round="${step.dataset.round}"]`);
    row.open = true;
    row.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
  }

  function roundRowHtml(result, i) {
    const a = result.answer;
    const said = a
      ? `<span class="rr-answer">${esc(a.name)}</span><span class="muted">${esc(O.TIERS[a.tier].name)} · ${a.tail ? 'from the deep catalogue' : `about ${sharePct(a.share)} of readers would say this`}</span>`
      : `<span class="rr-answer miss">${result.raw ? `"${esc(result.raw)}"` : 'No answer'}</span><span class="muted">${result.raw ? 'not in the catalogue' : 'the clock ran out'}</span>`;
    return `<details class="rr tier-${result.tier || 'miss'}" data-round="${i}">
      <summary>
        <span class="rr-n">${i + 1}</span>
        <span class="rr-main"><span class="rr-prompt">${esc(result.prompt.text)}</span>${said}</span>
        <span class="pts">+${result.score}</span>
      </summary>
      ${answerListHtml(result, i)}
    </details>`;
  }

  function towerMapHtml(reached) {
    return `<ul class="bands">${O.BANDS.slice()
      .reverse()
      .map((b) => `<li class="${b === reached ? 'on' : ''}"><span>Floors ${b.floors}</span><b>${esc(b.name)}</b><span class="muted">${b === reached ? 'You got this far. ' : ''}${esc(b.verdict)}</span></li>`)
      .join('')}</ul>`;
  }

  function shareText() {
    const row = S.results.map((r) => (r.tier ? O.TIERS[r.tier].emoji : O.MISS_EMOJI)).join('');
    return `Academicrillion climb #${S.run}: floor ${floorOf(S.total)} of ${TOP_FLOOR} (${S.total}/${O.MAX_SCORE})\n${row}`;
  }

  function showResults() {
    const band = O.bandFor(S.total);
    view.innerHTML = `
      <div class="results panel">
        <p class="eyebrow">Climb #${S.run} complete</p>
        <div class="total"><span class="big" id="total">0</span><span class="muted">/ ${O.MAX_SCORE}</span></div>
        <p class="band"><b>Floor ${floorOf(S.total)} · ${esc(band.name)}.</b> ${esc(band.verdict)}</p>
        <div class="actions">
          <button class="primary" id="again" type="button">Next climb ∞</button>
          <button id="copy" type="button">Copy result</button>
        </div>

        <h3>The climb</h3>
        ${stairsHtml()}

        <h3>Other climbers</h3>
        <p>You got higher than <b>${S.percentile}%</b> of ${O.FIELD_SIZE.toLocaleString()} simulated climbers on these seven prompts.</p>
        ${histogramHtml(S.field, S.total)}

        <h3>Every answer <span class="muted">open a round for its full catalogue</span></h3>
        <div class="rounds">${S.results.map(roundRowHtml).join('')}</div>

        <h3>The tower</h3>
        ${towerMapHtml(band)}

        <h3>Climbing log</h3>
        ${logbookHtml()}
      </div>`;
    countTo(document.getElementById('total'), S.total, '', 14);
    for (const box of view.querySelectorAll('.catalogue')) fillCatalogue(box);
    const again = document.getElementById('again');
    again.addEventListener('click', () => startRun(store.nextRun));
    again.focus({ preventScroll: true });
    const copy = document.getElementById('copy');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(shareText());
        copy.textContent = 'Copied';
      } catch (e) {
        copy.textContent = 'Copy failed';
      }
      setTimeout(() => (copy.textContent = 'Copy result'), 1800);
    });
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------- wiring

  const home = document.getElementById('home');
  home.setAttribute('aria-label', home.textContent);
  home.innerHTML = [...home.textContent].map((ch, i) => `<span style="--i:${i}">${ch}</span>`).join('');
  home.addEventListener('click', showIntro);

  view.addEventListener('input', onSearch);
  view.addEventListener('pointerover', (e) => onHover(e, true));
  view.addEventListener('pointerout', (e) => onHover(e, false));
  view.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) return onChip(chip);
    const step = e.target.closest('.step');
    if (step) openRound(step);
  });
  view.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('step')) {
      e.preventDefault();
      openRound(e.target);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!S || S.phase !== 'feedback') return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (Date.now() - S.feedbackStartedAt < SKIP_GUARD_MS) return;
    e.preventDefault();
    nextRound();
  });

  document.addEventListener('visibilitychange', tick);

  setInterval(tick, 100);
  showIntro();
})();
