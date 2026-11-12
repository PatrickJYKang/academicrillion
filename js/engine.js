/*
 * Game engine: turns the data files into prompts, scores answers, schedules
 * runs and simulates a field of other players. No DOM access, so it runs in
 * Node as well as the browser.
 */
(function (root) {
  'use strict';

  const D = root.GAME_DATA;

  const ROUNDS = 7;
  const MAX_SCORE = 700;
  const MIN_ANSWERS = 6; // a prompt needs at least this many valid answers
  const MAX_PER_SUBJECT = 2; // prompts one climb may take from a single subject
  const ALPHA = 1; // how steeply popularity falls off down an answer list
  const FIELD_SIZE = 2000;
  const FIELD_BLANK_RATE = 0.05; // chance a simulated player runs out the clock
  const FIELD_SECOND_THOUGHT = 0.5; // chance they think of two answers and give the rarer

  const SUBJECTS = {
    phys: 'Physics & Chemistry',
    space: 'Astronomy & Space',
    earth: 'Earth Science',
    life: 'Life Science',
    math: 'Mathematics',
    med: 'Medicine & Psychology',
    tech: 'Technology & Engineering',
    hist: 'History',
    geo: 'Geography',
    lang: 'Language',
    lit: 'Literature',
    art: 'Art & Architecture',
    music: 'Music & Theatre',
    phil: 'Philosophy',
    myth: 'Religion & Mythology',
    law: 'Politics & Law',
    econ: 'Economics',
    acad: 'Academia',
  };

  const TIERS = {
    obvious: { id: 'obvious', name: 'Bestseller', score: 10, emoji: '📰', blurb: 'The first title off everyone’s tongue.' },
    decoy: { id: 'decoy', name: 'Book Club Pick', score: 15, emoji: '📙', blurb: 'Feels like a deep cut. Everyone has read it.' },
    common: { id: 'common', name: 'Well-Thumbed', score: 30, emoji: '📗', blurb: 'Solid, but plenty of readers got here first.' },
    uncommon: { id: 'uncommon', name: 'Back Shelf', score: 60, emoji: '📘', blurb: 'Genuinely off the main aisle.' },
    obscure: { id: 'obscure', name: 'Dusty Tome', score: 85, emoji: '📕', blurb: 'Hardly anyone pulls this one down.' },
    outlier: { id: 'outlier', name: 'Lost Manuscript', score: 100, emoji: '📜', blurb: 'The single rarest answer in the catalogue.' },
  };
  const TIER_ORDER = ['outlier', 'obscure', 'uncommon', 'common', 'decoy', 'obvious'];
  const MISS_EMOJI = '⬛';

  // Ten points is one floor of the tower, so each band is a stretch of floors.
  // scene.js changes the tower's look at the same heights.
  const BANDS = [
    { min: 0, range: '0–150', floors: '0–15', name: 'The Reading Room', verdict: 'You stayed where the crowd reads.' },
    { min: 151, range: '151–250', floors: '15–25', name: 'The Stacks', verdict: 'Up among the well-thumbed shelves.' },
    { min: 251, range: '251–350', floors: '25–35', name: 'The Upper Galleries', verdict: 'Past where most readers turn back.' },
    { min: 351, range: '351–449', floors: '35–45', name: 'The Rare Books Room', verdict: 'Few ever climb this high.' },
    { min: 450, range: '450+', floors: '45–70', name: 'The Lantern Room', verdict: 'Top of the tower. Almost nobody gets here.' },
  ];

  function bandFor(score) {
    let band = BANDS[0];
    for (const b of BANDS) if (score >= b.min) band = b;
    return band;
  }

  // ------------------------------------------------------------ text matching

  // Articles and titles that never tell two answers apart.
  const PREFIX = /^(the|a|an|king|queen|emperor|empress|president|pope|saint|lord|sir) /;
  // Letters that do not decompose into a plain letter plus an accent.
  const LETTERS = { æ: 'ae', œ: 'oe', ø: 'o', ð: 'd', þ: 'th', ß: 'ss', ł: 'l', đ: 'd', ı: 'i', ħ: 'h' };

  const ARTICLE = /^(the|a|an) /;

  // Reduce an answer to a comparison key: case, accents, punctuation and
  // leading articles or titles are all ignored. With keepTitles, only the
  // articles go ("King cobra" stays a king cobra).
  function normalize(s, keepTitles) {
    let t = String(s).toLowerCase().replace(/[æœøðþßłđıħ]/g, (ch) => LETTERS[ch]);
    t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    t = t.replace(/&/g, ' and ').replace(/\+/g, ' plus ').replace(/#/g, ' sharp ');
    t = t.replace(/['’‘`ʻʼʽʾʿ.]/g, '');
    t = t.replace(/[^a-z0-9]+/g, ' ').trim();
    t = t.replace(/\bst\b/g, 'saint').replace(/\bmt\b/g, 'mount').replace(/ (vs|versus) /g, ' v ');
    for (let i = 0; i < 2; i++) {
      const u = t.replace(keepTitles ? ARTICLE : PREFIX, '');
      if (!u || u === t) break;
      t = u;
    }
    return t;
  }

  // "xiv" -> 14, for numerals up to 39 (popes and kings go no higher).
  const NUMERAL = /^(.+) (x{0,3})(ix|iv|v?i{0,3})$/;
  const UNITS = { '': 0, i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9 };

  // Looser forms of a key that should still count: spaces removed, a plural
  // "s" dropped, and "henry viii" written as "henry 8".
  function variants(key) {
    const out = [key];
    const push = (v) => {
      if (v && v.length > 1 && !out.includes(v)) out.push(v);
    };
    push(key.replace(/ /g, ''));
    let stem = null;
    if (/ies$/.test(key)) stem = key.slice(0, -3) + 'y';
    else if (/(ch|sh|x|ss|o)es$/.test(key)) stem = key.slice(0, -2);
    else if (/[^s]s$/.test(key)) stem = key.slice(0, -1);
    if (stem) {
      push(stem);
      push(stem.replace(/ /g, ''));
    }
    const regnal = key.match(NUMERAL);
    if (regnal && (regnal[2] || regnal[3])) push(regnal[1] + ' ' + (regnal[2].length * 10 + UNITS[regnal[3]]));
    return out;
  }

  // Edit distance counting a swap of neighbouring letters as one edit. Gives
  // up early (returning max + 1) once the distance must exceed max.
  function editDistance(a, b, max) {
    const n = a.length;
    const m = b.length;
    let prev2 = null;
    let prev = new Array(m + 1);
    let cur = new Array(m + 1);
    for (let j = 0; j <= m; j++) prev[j] = j;
    for (let i = 1; i <= n; i++) {
      cur[0] = i;
      let rowMin = i;
      for (let j = 1; j <= m; j++) {
        const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
          v = Math.min(v, prev2[j - 2] + 1);
        }
        cur[j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev2 = prev;
      prev = cur;
      cur = new Array(m + 1);
    }
    return prev[m];
  }

  function typoAllowance(len) {
    return len <= 3 ? 0 : len <= 6 ? 1 : len <= 11 ? 2 : 3;
  }

  /*
   * Judge a typed answer against a prompt.
   *   { type: 'exact', answer }  it is in the catalogue
   *   { type: 'near', answer }   probably a misspelling of an answer
   *   { type: 'none', known }    not in the catalogue; known = it is a real
   *                              member of the category that does not fit
   *                              this prompt
   */
  function match(prompt, raw) {
    const key = normalize(raw);
    if (!key) return { type: 'none', known: false };
    const found = find(prompt, raw, true);
    if (found) return { type: 'exact', answer: found };
    // A real member of the wider set that fails this prompt's extra condition.
    if (prompt.universe && variants(key).some((f) => prompt.universe.has(f))) return { type: 'none', known: true };

    // Closest spelling wins; on a tie the better-known answer does, because
    // both lists run from most to least familiar.
    const tail = tailOf(prompt);
    const typed = [key, ...withoutNoun(prompt.nouns, key)];
    let best = Infinity;
    let hit = null;
    const consider = (k, answer) => {
      for (const t of typed) {
        const limit = typoAllowance(Math.min(t.length, k.length));
        if (!limit || Math.abs(k.length - t.length) > limit) continue;
        const d = editDistance(t, k, Math.min(limit, best - 1));
        if (d < best && d <= limit) {
          best = d;
          hit = answer;
        }
      }
    };
    for (const [k, i] of prompt.keys) consider(k, prompt.answers[i]);
    if (tail) for (const [k, a] of tail.keys) consider(k, a);
    return hit ? { type: 'near', answer: hit } : { type: 'none', known: false };
  }

  /*
   * The answer a key names, or null. What was typed is tried as it stands
   * and then without the category's own word ("gobi desert" for "Gobi"). Each
   * form is looked for among full names before looser ones, and among the
   * hand-ranked answers before the deep catalogue. Surnames are only
   * accepted from a player (surnames = true): the build must not decide that
   * Pierre Curie is Marie Curie.
   */
  // A title is normally ignored ("Queen Victoria" is Victoria), but not when
  // the name with its title is an answer in its own right: a king cobra is
  // not a cobra.
  function find(prompt, raw, surnames) {
    const titled = normalize(raw, true);
    const key = normalize(raw);
    if (titled !== key) {
      const i = prompt.exact.get(titled);
      if (i !== undefined) return prompt.answers[i];
      const tail = tailOf(prompt);
      const a = tail && tail.exact.get(titled);
      if (a) return a;
    }
    return lookup(prompt, key, surnames);
  }

  function lookup(prompt, key, surnames) {
    const tail = tailOf(prompt);
    const loose = (map, f) => {
      const hit = map.get(f);
      return hit && (surnames || !hit.surname) ? hit : null;
    };
    for (const form of [key, ...withoutNoun(prompt.nouns, key)]) {
      const forms = variants(form);
      for (const f of forms) {
        const i = prompt.index.get(f);
        if (i !== undefined) return prompt.answers[i];
      }
      if (tail) {
        for (const f of forms) {
          const a = tail.index.get(f);
          if (a) return a;
        }
      }
      for (const f of forms) {
        const hit = loose(prompt.loose, f);
        if (hit) return hit.answer;
      }
      if (tail) {
        for (const f of forms) {
          const hit = loose(tail.loose, f);
          if (hit) return hit.answer;
        }
      }
    }
    return null;
  }

  // ---------------------------------------------------------- prompt building

  function parseItems(str) {
    return str.split('|').map((seg) => {
      const parts = seg.split('~');
      let body = parts[0].trim();
      const gem = body.startsWith('!');
      if (gem) body = body.slice(1);
      const decoy = body.endsWith('*');
      if (decoy) body = body.slice(0, -1);
      const names = body.split('=').map((s) => s.trim());
      return { name: names[0], aliases: names.slice(1), decoy, gem, fact: parts[1] ? parts[1].trim() : null };
    });
  }

  /*
   * The category's own word, which a player may add or leave off: "Pacific"
   * for the Pacific Plate, "Stalingrad" for the battle, "Gobi Desert" for the
   * Gobi. Listed by category id.
   */
  const NOUNS = {
    plate: { suffix: ['plate'] },
    current: { suffix: ['current'] },
    volcano: { prefix: ['mount', 'volcan'], suffix: ['volcano', 'caldera'] },
    bone: { suffix: ['bone'] },
    muscle: { suffix: ['muscle'] },
    hormone: { suffix: ['hormone'] },
    shark: { suffix: ['shark'] },
    primate: { suffix: ['monkey'] },
    cetacean: { suffix: ['whale', 'dolphin', 'porpoise'] },
    wildcat: { suffix: ['cat'] },
    conifer: { suffix: ['tree'] },
    theorem: { suffix: ['theorem'] },
    fallacy: { suffix: ['fallacy'] },
    bias: { suffix: ['bias', 'effect'] },
    proglang: { suffix: ['programming language', 'language'] },
    os: { suffix: ['operating system'] },
    rocket: { suffix: ['rocket'] },
    spacetelescope: { suffix: ['space telescope', 'space observatory', 'telescope', 'observatory'] },
    cipher: { suffix: ['cipher', 'machine'] },
    pharaoh: { prefix: ['pharaoh'] },
    empire: { prefix: ['empire of'], suffix: ['empire'] },
    treaty: { prefix: ['treaty of', 'treaty on', 'treaties of', 'peace of', 'convention of'], suffix: ['treaty', 'agreement', 'accord', 'protocol', 'pact'] },
    ww2battle: { prefix: ['battle of the', 'battle of', 'siege of', 'operation', 'attack on', 'invasion of'] },
    napoleonbattle: { prefix: ['battle of the', 'battle of', 'siege of'] },
    romanprovince: { prefix: ['roman'] },
    spprov: { prefix: ['province of'], suffix: ['province'] },
    jpref: { suffix: ['prefecture'] },
    rusubject: { prefix: ['republic of'], suffix: ['autonomous okrug', 'oblast', 'krai', 'republic'] },
    natpark: { suffix: ['national park'] },
    longriver: { prefix: ['river'], suffix: ['river'] },
    biglake: { prefix: ['lake'], suffix: ['lake'] },
    range: { suffix: ['mountain range', 'mountain', 'range'] },
    desert: { suffix: ['desert'] },
    sea: { prefix: ['sea of'], suffix: ['sea'] },
    strait: { prefix: ['strait of', 'straits of'], suffix: ['strait', 'channel', 'passage'] },
    peninsula: { suffix: ['peninsula'] },
    officiallang: { suffix: ['language'] },
    script: { suffix: ['writing system', 'alphabet', 'script', 'syllabary'] },
    langfamily: { suffix: ['language family', 'language', 'family'] },
    bible: { prefix: ['book of', 'gospel of', 'gospel according to', 'epistle to the', 'letter to the'] },
    epic: { prefix: ['epic of'] },
    litmovement: { suffix: ['movement'] },
    artmovement: { suffix: ['movement'] },
    poeticform: { suffix: ['poem', 'poetry'] },
    archstyle: { suffix: ['style architecture', 'architecture', 'style'] },
    exchange: { suffix: ['stock exchange', 'exchange'] },
    tax: { suffix: ['tax', 'duty'] },
    scilaw: { prefix: ['law of', 'laws of'], suffix: ['law', 'laws', 'principle'] },
    acid: { suffix: ['acid'] },
    probe: { suffix: ['probe', 'spacecraft', 'mission'] },
    comet: { prefix: ['comet'], suffix: ['comet'] },
    cloud: { suffix: ['clouds', 'cloud'] },
    impact: { suffix: ['impact structure', 'impact crater', 'crater'] },
    snake: { suffix: ['snake'] },
    mathbranch: { prefix: ['mathematical'], suffix: ['theory', 'mathematics'] },
    conjecture: { suffix: ['conjecture', 'conjectures', 'hypothesis', 'problem'] },
    curve: { suffix: ['curve'] },
    infection: { suffix: ['virus disease', 'disease', 'infection', 'virus'] },
    disorder: { suffix: ['disorder', 'syndrome'] },
    algorithm: { suffix: ['algorithm'] },
    bridge: { suffix: ['bridge'] },
    npp: { suffix: ['nuclear power plant', 'nuclear power station', 'nuclear generating station', 'nuclear plant', 'power plant', 'power station', 'generating station'] },
    war: { prefix: ['war of the', 'war of', 'war in'], suffix: ['war', 'wars'] },
    revolution: { prefix: ['revolution of', 'revolutions of'], suffix: ['revolution'] },
    period: { suffix: ['period', 'era', 'age', 'ages'] },
    ww1battle: { prefix: ['battles of the', 'battle of the', 'battle of', 'siege of'] },
    uscwbattle: { prefix: ['battle of the', 'battle of', 'siege of'] },
    dynasty: { suffix: ['dynasty'] },
    archipelago: { prefix: ['archipelago of', 'isles of'], suffix: ['archipelago', 'islands', 'isles'] },
    waterfall: { suffix: ['waterfalls', 'waterfall', 'falls', 'fall'] },
    gulf: { prefix: ['gulf of the', 'gulf of', 'bay of the', 'bay of', 'bight of'], suffix: ['gulf', 'bay', 'bight'] },
    highpoint: { prefix: ['mount', 'mont', 'monte', 'pico de', 'pico', 'cerro', 'jebel', 'jabal', 'volcan'], suffix: ['mountain', 'peak'] },
    ireland: { prefix: ['county', 'co'] },
    deadlang: { suffix: ['language'] },
    gramcase: { suffix: ['case'] },
    genre: { suffix: ['fiction', 'literature', 'novel', 'poetry', 'story'] },
    museum: { prefix: ['museum of', 'musee du', 'musee', 'museo del', 'museo'], suffix: ['museum of art', 'art museum', 'museum', 'gallery'] },
    cathedral: { prefix: ['cathedral of'], suffix: ['cathedral', 'minster'] },
    operahouse: { suffix: ['opera house', 'opera', 'theatre', 'theater'] },
    paradox: { prefix: ['paradox of the', 'paradox of'], suffix: ['paradox', 'paradoxes', 'problem'] },
    thoughtexp: { suffix: ['thought experiment', 'paradox', 'problem', 'argument'] },
    index: { suffix: ['composite index', 'index', 'composite'] },
    crisis: { prefix: ['panic of'], suffix: ['financial crisis', 'crisis', 'crash', 'bubble'] },
    econschool: { suffix: ['school of economics', 'economics', 'school'] },
    oxbridge: { suffix: ['college'] },
    olduni: { prefix: ['university of'], suffix: ['university'] },
    china: { suffix: ['autonomous region', 'province', 'municipality'] },
    brazil: { prefix: ['state of'] },
    mexico: { prefix: ['state of'] },
    swisscanton: { prefix: ['canton of'] },
    turkey: { suffix: ['province'] },
    ukcity: { prefix: ['city of'] },
    sultan: { prefix: ['sultan'] },
    constant: { suffix: ['constant'] },
    physbranch: { suffix: ['physics'] },
    asteroid: { prefix: ['\\d+'] }, // "433 Eros"
    galaxy: { suffix: ['dwarf galaxy', 'galaxy'] },
    nebula: { suffix: ['nebula'] },
    spaceagency: { suffix: ['space agency'] },
    observatory: { suffix: ['astronomical observatory', 'observatory', 'observatories'] },
    startype: { suffix: ['star'] },
    wind: { suffix: ['winds', 'wind'] },
    glacier: { suffix: ['glacier'] },
    trench: { suffix: ['trench', 'trough', 'deep'] },
    cave: { prefix: ['cave of the', 'cave of'], suffix: ['caverns', 'cavern', 'caves', 'cave', 'grotto'] },
    parrot: { suffix: ['parrot'] },
    deer: { suffix: ['deer'] },
    turtle: { suffix: ['sea turtle', 'turtle', 'tortoise'] },
    mathconstant: { suffix: ['constant'] },
    distribution: { suffix: ['distribution'] },
    numeral: { suffix: ['numeral system', 'numerals', 'numeral'] },
    numbertype: { suffix: ['numbers', 'number'] },
    equation: { suffix: ['equations', 'equation'] },
    cancer: { suffix: ['cancer', 'tumor', 'tumour'] },
    artery: { suffix: ['arteries', 'artery'] },
    nerve: { suffix: ['nerves', 'nerve'] },
    dam: { suffix: ['dam'] },
    canal: { prefix: ['canal du', 'canal de'], suffix: ['ship canal', 'canal'] },
    protocol: { suffix: ['protocol'] },
    siege: { prefix: ['great siege of', 'siege of the', 'siege of', 'fall of', 'battle of the', 'battle of'] },
    navalbattle: { prefix: ['battle of the', 'battle of', 'battle off'] },
    pirate: { prefix: ['captain'] },
    operation: { prefix: ['operation'] },
    rebellion: { suffix: ['rebellion', 'revolt', 'uprising', 'rising'] },
    calendar: { suffix: ['calendar'] },
    revwarbattle: { prefix: ['battles of', 'battle of the', 'battle of', 'siege of', 'capture of'] },
    civilization: { suffix: ['civilization', 'civilisation', 'culture', 'empire'] },
    formercountry: { prefix: ['kingdom of the', 'kingdom of', 'republic of', 'duchy of', 'empire of'], suffix: ['empire', 'kingdom', 'republic'] },
    bigisland: { suffix: ['island'] },
    cape: { prefix: ['cape of', 'cape', 'cabo de', 'cabo', 'cap'], suffix: ['cape', 'head', 'point'] },
    territory: { suffix: ['islands', 'island'] },
    pass: { prefix: ['col du', 'col de la', 'col de', 'passo', 'paso de'], suffix: ['pass'] },
    scotisland: { prefix: ['isle of'], suffix: ['island', 'isle'] },
    romance: { suffix: ['language'] },
    germanic: { suffix: ['language'] },
    signlang: { suffix: ['sign language'] },
    castle: { prefix: ['chateau de', 'chateau du', 'castle of the', 'castle of', 'burg', 'castello'], suffix: ['castle', 'fortress'] },
    palace: { prefix: ['royal palace of', 'palace of the', 'palace of', 'palazzo', 'palais'], suffix: ['palace'] },
    pyramid: { prefix: ['great pyramid of', 'pyramid of the', 'pyramid of'], suffix: ['pyramid'] },
    orchestra: { suffix: ['symphony orchestra', 'philharmonic orchestra', 'orchestra', 'philharmonic', 'symphony'] },
    philbranch: { prefix: ['philosophy of'] },
    parable: { prefix: ['parable of the'] },
    holyday: { prefix: ['feast of the'] },
    legislature: { prefix: ['parliament of the', 'parliament of'], suffix: ['parliament'] },
    bank: { suffix: ['banking group', 'financial group', 'bank', 'group'] },
    ukuni: { prefix: ['university of'], suffix: ['university'] },
    prize: { suffix: ['prize', 'medal', 'award'] },
    library: { prefix: ['library of'], suffix: ['library'] },
  };

  function affixesFor(id) {
    const n = NOUNS[id];
    if (!n) return null;
    const longestFirst = (list) => (list || []).slice().sort((x, y) => y.length - x.length);
    return {
      prefix: longestFirst(n.prefix).map((w) => new RegExp('^' + w + ' ')),
      suffix: longestFirst(n.suffix).map((w) => new RegExp(' ' + w + '(s|es)?$')),
    };
  }

  // A key with the category's own word taken off the front, the back, or
  // both: "battle of the bulge" -> ["bulge"]. Empty if nothing comes off.
  function withoutNoun(affixes, key) {
    if (!affixes) return [];
    const cut = (text, list) => {
      for (const re of list) {
        const t = text.replace(re, '');
        if (t && t !== text) return t;
      }
      return null;
    };
    const front = cut(key, affixes.prefix);
    const back = cut(key, affixes.suffix);
    const both = front ? cut(front, affixes.suffix) : null;
    return [front, back, both].filter(Boolean);
  }

  /*
   * How a person is named short of their full name: "Bach", "van Gogh",
   * "John Kennedy" for John F. Kennedy.
   */
  const PARTICLES = new Set(['van', 'von', 'de', 'da', 'di', 'del', 'della', 'der', 'den', 'la', 'le', 'du', 'dos', 'das', 'ter', 'ten', 'af', 'zu']);
  const GENERATION = /,?\s+(jr\.?|sr\.?|i{2,3}|iv|v|the elder|the younger)$/i;

  function surnames(name) {
    const words = name.replace(GENERATION, '').trim().split(/\s+/);
    if (words.length < 2 || words.includes('of') || /^\d/.test(words[0])) return [];
    const last = words[words.length - 1];
    let full = last;
    for (let i = words.length - 2; i >= 1 && PARTICLES.has(words[i].toLowerCase()); i--) full = words[i] + ' ' + full;
    const out = [last];
    if (full !== last) out.push(full);
    if (words.length > 2) out.push(words[0] + ' ' + last);
    if (words.length > 2 && full !== last && full !== words.slice(1).join(' ')) out.push(words[0] + ' ' + full);
    return out;
  }

  /*
   * Index a list of answers.
   *   index  key -> answer, for names and their other spellings
   *   loose  key -> { answer, surname }, for shortened forms: the name without
   *          the category's word, or a person's surname
   *   keys   every [key, answer] above, for spotting misspellings
   * Earlier answers are better known, so they claim a key first; a full name
   * always beats an alias, and an alias a shortened form. `taken` holds maps
   * whose keys are already spoken for. `ref` is what the maps store for an
   * answer: its position in a prompt's own list, the answer itself in a tail.
   */
  function indexAnswers(answers, ref, nouns, people, taken) {
    const index = new Map();
    const loose = new Map();
    const exact = new Map(); // names that begin with a title, title kept
    const keys = [];
    const free = (k, maps) => k && !maps.some((m) => m.has(k));
    for (const pass of [0, 1]) {
      answers.forEach((a, i) => {
        for (const n of pass ? a.aliases : [a.name]) {
          const k = normalize(n);
          const titled = normalize(n, true);
          if (titled !== k && !exact.has(titled)) exact.set(titled, ref(a, i));
          if (!free(k, [index, ...taken.index])) continue;
          index.set(k, ref(a, i));
          keys.push([k, ref(a, i)]);
        }
      });
    }
    for (const [k, r] of keys.slice()) {
      for (const v of variants(k)) if (free(v, [index, ...taken.index])) index.set(v, r);
    }
    const everything = [index, loose, ...taken.index, ...taken.loose];
    const shorten = (surname, forms) => {
      answers.forEach((a, i) => {
        for (const n of [a.name, ...a.aliases]) {
          for (const k of forms(n)) {
            if (k.length < 2 || !free(k, everything)) continue;
            loose.set(k, { answer: a, surname });
            keys.push([k, ref(a, i)]);
          }
        }
      });
    };
    if (nouns) shorten(false, (n) => withoutNoun(nouns, normalize(n)));
    if (people) shorten(true, (n) => surnames(n).map(normalize));
    for (const [k, hit] of [...loose]) {
      for (const v of variants(k)) if (free(v, everything)) loose.set(v, hit);
    }
    return { index, loose, keys, exact };
  }

  /*
   * Build a prompt from answers ordered most- to least-popular. Rarity tiers
   * come from rank, and decoys always score 15.
   *
   * A complete list is the whole category: the top ~10% score 10, up to ~44%
   * score 30, up to ~85% score 60, the rest 85, and the single rarest answer
   * (the last, unless one is marked) scores 100.
   *
   * A deep list is only the best-known answers, with a catalogue behind it.
   * Being hand-ranked at all means an answer is fairly familiar, so these
   * stop at 60: roughly the first fifth score 10, most of the rest 30. The
   * 85s and the 100 are in the catalogue.
   */
  function makePrompt(spec) {
    const { id, items } = spec;
    const tail = TAILS[id];
    const deep = !!(tail && (tail.rare || tail.deep));
    const answers = items.map((it) => ({
      name: it.name,
      aliases: it.aliases || [],
      decoy: !!it.decoy,
      gem: !!it.gem,
      fact: it.fact || null,
    }));
    const marked = answers.some((a) => a.gem);
    const ranked = answers.filter((a) => !a.decoy && !a.gem).length;
    let cutObvious;
    let cutCommon;
    let cutUncommon;
    if (deep) {
      cutObvious = Math.min(ranked, Math.max(3, Math.min(9, Math.round(ranked * 0.2))));
      cutCommon = cutObvious + Math.round((ranked - cutObvious) * 0.6);
      cutUncommon = ranked;
    } else {
      cutObvious = Math.max(1, Math.round(ranked * 0.1));
      cutCommon = Math.max(cutObvious, Math.round(ranked * 0.44));
      cutUncommon = Math.max(cutCommon, Math.round(ranked * 0.85));
    }
    let rank = 0;
    let total = 0;
    answers.forEach((a, pos) => {
      a.weight = Math.pow(pos + 3, -ALPHA);
      total += a.weight;
      if (a.decoy) {
        a.tier = 'decoy';
      } else if (a.gem) {
        a.tier = 'outlier';
      } else {
        if (!deep && !marked && rank === ranked - 1 && ranked > 1) a.tier = 'outlier';
        else if (rank < cutObvious) a.tier = 'obvious';
        else if (rank < cutCommon) a.tier = 'common';
        else if (rank < cutUncommon) a.tier = 'uncommon';
        else a.tier = 'obscure';
        rank++;
      }
      a.score = TIERS[a.tier].score;
    });
    answers.forEach((a) => {
      a.share = a.weight / total;
      delete a.weight;
      delete a.gem;
    });

    const nouns = affixesFor(id);
    const people = !!spec.people;
    const { index, loose, keys, exact } = indexAnswers(answers, (a, i) => i, nouns, people, { index: [], loose: [] });
    // universe: every member of the wider set a subset prompt was cut from.
    return {
      id,
      subject: spec.subject,
      group: spec.group,
      text: spec.text,
      answers,
      index,
      loose,
      keys,
      exact,
      nouns,
      people,
      deep,
      universe: spec.universe || null,
      tailId: deep ? id : null,
    };
  }

  // ----------------------------------------------------------- deep catalogues

  /*
   * A hand-ranked list can only reach so far. Behind it, open-ended
   * categories have a deep catalogue built from Wikidata (data-tails.js):
   * every further member of the category, split into the fairly familiar
   * ("rare"), everything else ("deep"), and one picked rarity ("gem"). They
   * are parsed and indexed only when a prompt that uses them comes up.
   */
  const TAILS = D.tails || {};
  const TAIL_TIER = { rare: 'uncommon', deep: 'obscure', gem: 'outlier' };
  // The share of players assumed to answer from past the hand-ranked list.
  const TAIL_MASS = { rare: 0.03, deep: 0.02 };

  // The deep catalogue for one prompt, or null. Building it also rescales
  // the hand-ranked answers' shares to leave room for it.
  function tailOf(prompt) {
    if (!prompt.tailId) return null;
    if (prompt.tail) return prompt.tail;
    const source = TAILS[prompt.tailId];
    const answers = [];
    const gemAlready = prompt.answers.some((a) => a.tier === 'outlier');
    for (const part of ['rare', 'deep', 'gem']) {
      if (!source[part] || (part === 'gem' && gemAlready)) continue;
      const tier = TAIL_TIER[part];
      for (const it of parseItems(source[part])) {
        answers.push({ name: it.name, aliases: it.aliases, decoy: false, fact: it.fact, tier, score: TIERS[tier].score, share: null, tail: part });
      }
    }
    const taken = { index: [prompt.index], loose: [prompt.loose] };
    const { index, loose, keys, exact } = indexAnswers(answers, (a) => a, prompt.nouns, prompt.people, taken);
    const mass = {};
    for (const part of ['rare', 'deep']) if (answers.some((a) => a.tail === part)) mass[TAIL_TIER[part]] = TAIL_MASS[part];
    const kept = 1 - Object.values(mass).reduce((x, y) => x + y, 0);
    for (const a of prompt.answers) a.share *= kept;
    prompt.tail = { answers, index, loose, keys, exact, mass };
    return prompt.tail;
  }

  // How many answers a prompt accepts, in all and per tier.
  function catalogue(prompt) {
    const tail = tailOf(prompt);
    const tiers = {};
    for (const a of prompt.answers) tiers[a.tier] = (tiers[a.tier] || 0) + 1;
    if (tail) for (const a of tail.answers) tiers[a.tier] = (tiers[a.tier] || 0) + 1;
    return { total: prompt.answers.length + (tail ? tail.answers.length : 0), listed: prompt.answers.length, tiers };
  }

  // Answers whose name contains the text and, if given, sit in one tier:
  // the best-known `limit` of them, and how many there are in all.
  function search(prompt, text, limit, tier) {
    const fold = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const needle = fold(text || '').trim();
    const tail = tailOf(prompt);
    const found = [];
    let total = 0;
    for (const a of [...prompt.answers, ...(tail ? tail.answers : [])]) {
      if (tier && a.tier !== tier) continue;
      if (needle && !fold(a.name).includes(needle) && !a.aliases.some((n) => fold(n).includes(needle))) continue;
      total++;
      if (found.length < limit) found.push(a);
    }
    return { found, total };
  }

  function universeOf(names) {
    const set = new Set();
    for (const n of names) for (const v of variants(normalize(n))) set.add(v);
    return set;
  }

  const prompts = [];

  function add(spec) {
    const prompt = makePrompt(spec);
    if (prompt.answers.length >= MIN_ANSWERS) prompts.push(prompt);
    return prompt;
  }

  // ---- the hand-ranked lists

  const PEOPLE = new Set(D.people || []);

  for (const [id, subject, group, text, str] of D.lists) {
    const items = parseItems(str);
    // Other names Wikidata knows for the hand-ranked answers ("Alsatian").
    const also = TAILS[id] && TAILS[id].also ? new Map(parseItems(TAILS[id].also).map((it) => [it.name, it.aliases])) : null;
    if (also) for (const it of items) if (also.has(it.name)) it.aliases = [...it.aliases, ...also.get(it.name)];
    add({ id, subject, group, text, items, people: PEOPLE.has(id) });
  }

  // ---- countries and capitals

  const countries = D.countries.trim().split('\n').map((line) => {
    const [names, conts, caps, flags = ''] = line.split(';');
    const all = names.split('=');
    const capNames = caps.split('=');
    return {
      name: all[0],
      // "=/x" marks an alternative official name; here it is one more alias
      aliases: all.slice(1).map((n) => (n[0] === '/' ? n.slice(1) : n)),
      continents: conts.split('+'),
      capital: capNames[0],
      capitalAliases: capNames.slice(1),
      landlocked: flags.includes('L'),
      island: flags.includes('I'),
      decoy: flags.includes('D'),
    };
  });
  const countryByKey = new Map(countries.map((c) => [normalize(c.name), c]));
  const countryUniverse = universeOf(countries.flatMap((c) => [c.name, ...c.aliases]));

  // Countries are listed best-known first, so any subset is already ranked.
  function countryPrompt(id, text, test, subject = 'geo') {
    const items = countries.filter(test).map((c) => ({ name: c.name, aliases: c.aliases, decoy: c.decoy }));
    add({ id: 'country-' + id, subject, group: 'country', text, items, universe: countryUniverse });
  }

  countryPrompt('all', 'Name a country', () => true);
  for (const [code, label] of [['AF', 'Africa'], ['AS', 'Asia'], ['EU', 'Europe']]) {
    countryPrompt('in-' + code, `Name a country in ${label}`, (c) => c.continents.includes(code));
  }
  countryPrompt('in-AM', 'Name a country in the Americas', (c) => c.continents.includes('NA') || c.continents.includes('SA'));
  countryPrompt('landlocked', 'Name a landlocked country', (c) => c.landlocked);
  countryPrompt('island', 'Name an island country', (c) => c.island);

  // Memberships and the like: [id, subject, prompt, names].
  for (const [id, subject, text, str] of D.countrySets) {
    const wanted = new Set(
      str.split('|').map((n) => {
        const c = countryByKey.get(normalize(n));
        if (!c) throw new Error(`countrySets "${id}": unknown country "${n}"`);
        return c;
      })
    );
    countryPrompt(id, text, (c) => wanted.has(c), subject);
  }

  add({
    id: 'capital-all',
    subject: 'geo',
    group: 'capital',
    text: 'Name a national capital',
    items: countries.map((c) => ({ name: c.capital, aliases: c.capitalAliases })),
  });
  // A capital of the wrong continent is known, but does not fit.
  const capitalUniverse = universeOf(countries.flatMap((c) => [c.capital, ...c.capitalAliases]));
  const capitalPrompt = (code, label, test) =>
    add({
      id: 'capital-in-' + code,
      subject: 'geo',
      group: 'capital',
      text: `Name a national capital in ${label}`,
      items: countries.filter(test).map((c) => ({ name: c.capital, aliases: c.capitalAliases })),
      universe: capitalUniverse,
    });
  for (const [code, label] of [['EU', 'Europe'], ['AF', 'Africa'], ['AS', 'Asia']]) capitalPrompt(code, label, (c) => c.continents.includes(code));
  capitalPrompt('AM', 'the Americas', (c) => c.continents.includes('NA') || c.continents.includes('SA'));

  // ---- US states

  const states = D.states.trim().split('\n').map((line) => {
    const [name, capital] = line.split(';');
    return { name, capital };
  });
  add({ id: 'state-all', subject: 'geo', group: 'state', text: 'Name a US state', items: states.map((s) => ({ name: s.name })) });
  add({
    id: 'statecap-all',
    subject: 'geo',
    group: 'state',
    text: 'Name a US state capital',
    items: D.stateCapitalOrder.split('|').map((name) => ({ name })),
  });

  // ---- chemical elements

  add({
    id: 'element-all',
    subject: 'phys',
    group: 'element',
    text: 'Name a chemical element',
    items: D.elements.trim().split('\n').map((line) => {
      const [names, , , flags = ''] = line.split(';');
      const all = names.split('=');
      return { name: all[0], aliases: all.slice(1), decoy: flags.includes('D') };
    }),
  });

  // ---------------------------------------------------------------- scheduling

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /*
   * A schedule is an endless numbered sequence of seven-prompt sets. Each set
   * draws the prompts that have gone longest without being used (ties broken
   * at random), never two from the same family and never more than
   * `perSubject` from one subject, so nothing repeats until everything else
   * has had its turn. The same number always yields the same seven prompts.
   *
   * `pinned` is an optional list of sets already decided ("id id id ..." per
   * number). A pinned set is used as written, so that adding a prompt later
   * does not reshuffle a day people have already played.
   */
  function scheduler(salt, perSubject, pinned) {
    const schedule = [];
    const lastUsed = new Map();
    const byId = new Map(prompts.map((p) => [p.id, p]));
    const fixed = (n) => {
      const ids = pinned && pinned[n - 1] ? pinned[n - 1].split(' ') : null;
      if (!ids || ids.length !== ROUNDS || !ids.every((id) => byId.has(id))) return null;
      return ids.map((id) => byId.get(id));
    };
    return function (number) {
      while (schedule.length < number) {
        const n = schedule.length + 1;
        const rng = mulberry32(Math.imul(n, 0x9e3779b1) ^ salt);
        let set = fixed(n);
        if (!set) {
          const order = shuffled(prompts, rng).sort((a, b) => (lastUsed.get(a.id) || 0) - (lastUsed.get(b.id) || 0));
          const families = new Set();
          const taken = {};
          const picks = [];
          for (const p of order) {
            if (picks.length === ROUNDS) break;
            if (families.has(p.group) || (taken[p.subject] || 0) >= perSubject) continue;
            families.add(p.group);
            taken[p.subject] = (taken[p.subject] || 0) + 1;
            picks.push(p);
          }
          set = shuffled(picks, rng);
        }
        for (const p of set) lastUsed.set(p.id, n);
        schedule.push(set);
      }
      return schedule[number - 1];
    };
  }

  // Unlimited climbs, numbered from 1: at most two prompts from one subject.
  const promptsForRun = scheduler(0x5bd1e995, MAX_PER_SUBJECT);

  /*
   * The daily climb: one set a day, the same for everyone, seven prompts from
   * seven different subjects. Day 1 is DAILY_START, and a day runs from
   * midnight to midnight UTC, so it changes at the same moment everywhere.
   */
  const DAILY = D.daily || { start: '2026-11-11', days: [] };
  const promptsForDay = scheduler(0x1f83d9ab, 1, DAILY.days);

  function dayNumber(date) {
    const [y, m, d] = DAILY.start.split('-').map(Number);
    return Math.max(1, Math.floor((date.getTime() - Date.UTC(y, m - 1, d)) / 86400000) + 1);
  }

  // -------------------------------------------------------- the simulated field

  // There are no other players offline, so the comparison field is simulated.
  // Each virtual player answers every prompt by popularity; half the time
  // they think of a second answer and give whichever is rarer, and now and
  // then they run out the clock. Those rates were tuned so the spread of
  // totals resembles a real crowd's. Seeded by run number, so a run's field
  // never changes.
  function simulateField(prompts, run) {
    const rng = mulberry32(Math.imul(run, 0x85ebca6b) ^ 0xc2b2ae35);
    // What a simulated player can score on each prompt: any hand-ranked
    // answer, or (rarely) something from the deep catalogue.
    const tables = prompts.map((p) => {
      const tail = tailOf(p);
      const scores = p.answers.map((a) => a.score);
      const shares = p.answers.map((a) => a.share);
      for (const [tier, mass] of Object.entries(tail ? tail.mass : {})) {
        scores.push(TIERS[tier].score);
        shares.push(mass);
      }
      let c = 0;
      return { scores, cumulative: shares.map((x) => (c += x)) };
    });
    const pick = (k) => {
      const x = rng();
      const c = tables[k].cumulative;
      let lo = 0;
      let hi = c.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (c[mid] < x) lo = mid + 1;
        else hi = mid;
      }
      return tables[k].scores[lo];
    };
    const totals = new Array(FIELD_SIZE);
    for (let i = 0; i < FIELD_SIZE; i++) {
      let t = 0;
      for (let k = 0; k < prompts.length; k++) {
        if (rng() < FIELD_BLANK_RATE) continue;
        let s = pick(k);
        if (rng() < FIELD_SECOND_THOUGHT) s = Math.max(s, pick(k));
        t += s;
      }
      totals[i] = t;
    }
    return totals;
  }

  // Share of the field (0-100) that scored strictly lower.
  function percentile(totals, score) {
    let below = 0;
    for (const t of totals) if (t < score) below++;
    return Math.round((below / totals.length) * 100);
  }

  root.GAME = {
    ROUNDS,
    MAX_SCORE,
    FIELD_SIZE,
    TIERS,
    TIER_ORDER,
    MISS_EMOJI,
    BANDS,
    SUBJECTS,
    bandFor,
    normalize,
    variants,
    surnames,
    match,
    find,
    lookup,
    catalogue,
    search,
    prompts,
    promptsForRun,
    promptsForDay,
    dayNumber,
    DAILY_START: DAILY.start,
    simulateField,
    percentile,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
