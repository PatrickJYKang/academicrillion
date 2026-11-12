// Run with: node test/engine.test.js
const assert = require('assert');
require('../js/data-lists.js');
require('../js/data-geo.js');
require('../js/data-elements.js');
if (require('fs').existsSync(__dirname + '/../js/data-tails.js')) require('../js/data-tails.js');
if (require('fs').existsSync(__dirname + '/../js/data-daily.js')) require('../js/data-daily.js');
require('../js/engine.js');
const { SOURCES } = require('../tools/sources.js');

const O = globalThis.GAME;
const D = globalThis.GAME_DATA;
const all = O.prompts;
const byId = new Map(all.map((p) => [p.id, p]));
const get = (id) => {
  assert(byId.has(id), `missing prompt ${id}`);
  return byId.get(id);
};
// Failures are collected rather than thrown, so one run shows all of them.
let checks = 0;
const failures = [];
const ok = (cond, msg) => {
  checks++;
  if (!cond) failures.push(msg);
};
// What a typed answer comes back as: "exact:Name", "near:Name", "known" or "none".
const said = (id, text) => {
  const m = O.match(get(id), text);
  return m.answer ? `${m.type}:${m.answer.name}` : m.known ? 'known' : 'none';
};
const is = (id, text, want) => ok(said(id, text) === want, `${id}: "${text}" gave ${said(id, text)}, wanted ${want}`);

// ---- data integrity
const countryRows = D.countries.trim().split('\n');
ok(countryRows.length === 197, `expected 197 countries, got ${countryRows.length}`);
const primary = {};
for (const row of countryRows) {
  const f = row.split(';');
  ok(f.length >= 3 && f[2], `bad country row: ${row}`);
  const c = f[1].split('+')[0];
  primary[c] = (primary[c] || 0) + 1;
}
ok(primary.AF === 54 && primary.NA === 23 && primary.SA === 12 && primary.OC === 14, `continent counts off: ${JSON.stringify(primary)}`);
ok(primary.EU + primary.AS === 94, `Europe + Asia should be 94: ${JSON.stringify(primary)}`);
ok(get('country-all').answers.length === 197, 'every country is an answer to "Name a country"');
ok(get('capital-all').answers.length === 197, 'every country has a capital');
ok(get('country-landlocked').answers.length === 45, `landlocked: ${get('country-landlocked').answers.length}`);
ok(get('country-commonwealth').answers.length === 56, `Commonwealth: ${get('country-commonwealth').answers.length}`);
for (const [id, n] of [['eu', 27], ['nato', 32], ['monarchy', 43], ['oecd', 38], ['in-AM', 35]]) {
  ok(get('country-' + id).answers.length === n, `country-${id}: ${get('country-' + id).answers.length} answers, expected ${n}`);
}
for (const set of D.countrySets) ok(set.length === 4 && O.SUBJECTS[set[1]], `countrySets ${set[0]}: [id, subject, prompt, names]`);
ok(get('country-eu').subject === 'law' && get('country-oecd').subject === 'econ' && get('country-in-AF').subject === 'geo', 'country sets sit under their own subjects');

const stateRows = D.states.trim().split('\n').map((r) => r.split(';'));
ok(stateRows.length === 50, 'expected 50 states');
const caps = D.stateCapitalOrder.split('|');
ok(caps.length === 50 && new Set(caps).size === 50, 'expected 50 distinct state capitals');
ok(stateRows.every((r) => caps.includes(r[1])), 'every state capital appears in the capital order');

const elementRows = D.elements.trim().split('\n').map((r) => r.split(';'));
ok(elementRows.length === 118, `expected 118 elements, got ${elementRows.length}`);
const zs = new Set(elementRows.map((r) => Number(r[2])));
ok(zs.size === 118 && Math.min(...zs) === 1 && Math.max(...zs) === 118, 'atomic numbers must be 1..118 exactly once');
ok(new Set(elementRows.map((r) => r[1])).size === 118, 'element symbols must be unique');

// ---- the lists
ok(new Set(D.lists.map((l) => l[0])).size === D.lists.length, 'list ids must be unique');
for (const l of D.lists) {
  ok(l.length === 5, `${l[0]}: a list is [id, subject, family, prompt, answers]`);
  ok(O.SUBJECTS[l[1]], `${l[0]}: unknown subject ${l[1]}`);
  ok(/^Name /.test(l[3]), `${l[0]}: prompt should start "Name ": ${l[3]}`);
  ok(byId.has(l[0]), `${l[0]}: too few answers to be a prompt`);
}
for (const id of D.people) ok(byId.has(id) && get(id).people, `people: no list called ${id}`);
for (const id of Object.keys(SOURCES)) ok(byId.has(id), `tools/sources.js has "${id}" but there is no such list`);

// Sets that can be counted.
const SIZES = {
  constellation: 88,
  president: 45,
  signer: 56,
  hre: 45,
  spprov: 50,
  jpref: 47,
  county: 48,
  natpark: 64,
  shakespeare: 39,
  bible: 73,
  booker: 62,
  usvp: 50,
  oxbridge: 65,
  plato: 36,
  india: 36,
  ireland: 32,
  greekletter: 24,
  'element-all': 118,
  'state-all': 50,
  'statecap-all': 50,
  china: 34,
  brazil: 27,
  mexico: 32,
  italyregion: 20,
  swisscanton: 26,
  turkey: 81,
  ukcity: 75, // 76 cities, two of them called Bangor
  sultan: 36,
  chancellor: 33,
  frpresident: 25,
  canadapm: 24,
  auspm: 31,
  aminoacid: 21,
  'country-euro': 21,
  'country-arableague': 22,
  'capital-in-AS': 51,
  'capital-in-AM': 35,
};
for (const [id, n] of Object.entries(SIZES)) ok(get(id).answers.length === n, `${id}: ${get(id).answers.length} answers, expected ${n}`);

// ---- every prompt is well formed
ok(new Set(all.map((p) => p.id)).size === all.length, 'prompt ids must be unique');
ok(all.length >= 290 && all.length <= 320, `${all.length} prompts; the aim is about 300`);
// Every subject has enough prompts to come up, and no prompt is filed nowhere.
const perSubjectAll = {};
for (const p of all) perSubjectAll[p.subject] = (perSubjectAll[p.subject] || 0) + 1;
for (const s of Object.keys(O.SUBJECTS)) ok(perSubjectAll[s] >= 3, `subject ${s} has only ${perSubjectAll[s] || 0} prompts`);
let deepPrompts = 0;
let catalogueTotal = 0;
for (const p of all) {
  const c = O.catalogue(p);
  catalogueTotal += c.total;
  ok(O.SUBJECTS[p.subject] && p.group && p.text, `${p.id}: missing subject, family or text`);
  ok(p.answers.length >= 6, `${p.id}: too few answers`);
  ok(c.tiers.outlier === 1, `${p.id}: ${c.tiers.outlier || 0} 100-point answers, expected exactly 1`);
  ok(c.tiers.obvious >= 1, `${p.id}: no 10-point answer`);
  for (const a of p.answers) ok(O.TIERS[a.tier] && a.score === O.TIERS[a.tier].score, `${p.id}: bad tier on ${a.name}`);
  const tail = p.tail; // built by catalogue()
  const share = p.answers.reduce((x, a) => x + a.share, 0) + (tail ? Object.values(tail.mass).reduce((x, y) => x + y, 0) : 0);
  ok(Math.abs(share - 1) < 1e-9, `${p.id}: shares sum to ${share}`);

  // Every hand-ranked answer can be reached by its name and by each alias.
  for (const a of p.answers) {
    for (const n of [a.name, ...a.aliases]) {
      const m = O.match(p, n);
      ok(m.type === 'exact', `${p.id}: "${n}" is not accepted`);
      if (n === a.name) ok(m.answer === a, `${p.id}: "${n}" resolves to ${m.answer && m.answer.name}`);
    }
  }
  if (p.deep) {
    deepPrompts++;
    ok(SOURCES[p.id], `${p.id}: has a deep catalogue but no source`);
    ok(!p.answers.some((a) => a.tier === 'obscure'), `${p.id}: a hand-ranked answer in a deep list scored 85`);
    ok(tail.answers.length >= 10, `${p.id}: deep catalogue of only ${tail.answers.length}`);
    // ...and so can every answer in the deep catalogue, without shadowing the list.
    for (const a of tail.answers) {
      const m = O.match(p, a.name);
      ok(m.type === 'exact' && m.answer === a, `${p.id}: deep answer "${a.name}" resolves to ${m.answer ? m.answer.name : 'nothing'}`);
      ok(a.score === (a.tail === 'rare' ? 60 : a.tail === 'deep' ? 85 : 100), `${p.id}: deep answer "${a.name}" scores ${a.score}`);
    }
  } else {
    ok(!tail, `${p.id}: not deep but has a tail`);
  }
}

// ---- matching
is('plate', 'pacific', 'exact:Pacific Plate');
is('plate', 'Pacific plate', 'exact:Pacific Plate');
is('ww2battle', 'stalingrad', 'exact:Battle of Stalingrad');
is('ww2battle', 'the bulge', 'exact:Battle of the Bulge');
is('ww2battle', 'D-Day', 'exact:Normandy landings');
is('ww2battle', 'stalingard', 'near:Battle of Stalingrad');
is('desert', 'gobi', 'exact:Gobi Desert');
is('desert', 'Sahara Desert', 'exact:Sahara');
is('treaty', 'versailles', 'exact:Treaty of Versailles');
is('empire', 'ottoman', 'exact:Ottoman Empire');
is('romanprovince', 'Roman Egypt', 'exact:Egypt');
is('biglake', 'superior', 'exact:Lake Superior');
is('volcano', 'vesuvius', 'exact:Mount Vesuvius');
is('volcano', 'Mt. Etna', 'exact:Mount Etna');
is('natpark', 'Yellowstone National Park', 'exact:Yellowstone');
is('rusubject', 'krasnodar', 'exact:Krasnodar Krai');
is('rusubject', 'Moscow Oblast', 'exact:Moscow Oblast');
is('rusubject', 'Moscow', 'exact:Moscow');
is('archstyle', 'gothic', 'exact:Gothic architecture');
is('langfamily', 'indo european', 'exact:Indo-European languages');
is('bible', 'Book of Job', 'exact:Job');
is('bible', '1 Kings', 'exact:1 Kings');
is('bible', 'First Kings', 'exact:1 Kings');
is('bible', 'Gospel of John', 'exact:John');

// the second round of categories
is('war', 'vietnam', 'exact:Vietnam War');
is('war', 'Hundred Years War', "exact:Hundred Years' War");
is('war', 'WW2', 'exact:World War II');
is('revolution', 'french', 'exact:French Revolution');
is('ww1battle', 'somme', 'exact:Battle of the Somme');
is('uscwbattle', 'gettysburg', 'exact:Battle of Gettysburg');
is('dynasty', 'ming', 'exact:Ming dynasty');
is('gulf', 'bengal', 'exact:Bay of Bengal');
is('gulf', 'Gulf of Mexico', 'exact:Gulf of Mexico');
is('highpoint', 'everest', 'exact:Mount Everest');
is('highpoint', 'Kilimanjaro', 'exact:Mount Kilimanjaro');
is('waterfall', 'niagara', 'exact:Niagara Falls');
is('archipelago', 'galapagos', 'exact:Galápagos Islands');
is('olduni', 'bologna', 'exact:University of Bologna');
is('olduni', 'Oxford University', 'exact:University of Oxford');
is('oxbridge', 'balliol', 'exact:Balliol College');
is('oxbridge', 'trinity', 'exact:Trinity College');
is('oxbridge', 'Trinity Hall', 'exact:Trinity Hall');
is('oxbridge', 'Magdalene', 'exact:Magdalen College');
is('cathedral', 'chartres', 'exact:Chartres Cathedral');
is('acid', 'sulphuric', 'exact:Sulfuric acid');
is('scilaw', "Ohm's law", "exact:Ohm's law");
is('scilaw', 'ohms law', "exact:Ohm's law");
is('greekletter', 'pi', 'exact:Pi');
is('greekletter', 'digamma', 'none');
is('scotuscase', 'roe vs wade', 'exact:Roe v. Wade');

// the third round of categories
is('operation', 'overlord', 'exact:Operation Overlord');
is('operation', 'D-Day', 'exact:Operation Overlord');
is('siege', 'leningrad', 'exact:Siege of Leningrad');
is('siege', 'the alamo', 'exact:Battle of the Alamo');
is('navalbattle', 'trafalgar', 'exact:Battle of Trafalgar');
is('revwarbattle', 'bunker hill', 'exact:Battle of Bunker Hill');
is('rebellion', 'boxer', 'exact:Boxer Rebellion');
is('castle', 'windsor', 'exact:Windsor Castle');
is('palace', 'versailles', 'exact:Palace of Versailles');
is('pyramid', 'Khufu', 'exact:Great Pyramid of Giza');
is('ukuni', 'oxford', 'exact:University of Oxford');
is('ukuni', 'Durham', 'exact:Durham University');
is('library', 'bodleian', 'exact:Bodleian Library');
is('pirate', 'kidd', 'exact:William Kidd');
is('pirate', 'Captain Morgan', 'exact:Henry Morgan');
is('chancellor', 'merkel', 'exact:Angela Merkel');
is('chancellor', 'bismarck', 'exact:Otto von Bismarck');
is('frpresident', 'de gaulle', 'exact:Charles de Gaulle');
is('canadapm', 'trudeau', 'exact:Justin Trudeau');
is('sultan', 'suleiman the magnificent', 'exact:Suleiman the Magnificent');
is('sultan', 'Mehmed 2', 'exact:Mehmed II');
is('equation', 'E=mc^2', 'exact:Mass–energy equivalence');
is('equation', 'e=mc2', 'exact:Mass–energy equivalence');
is('equation', 'schrodinger', 'exact:Schrödinger equation');
is('mathconstant', 'e', "exact:Euler's number");
is('mathconstant', 'pi', 'exact:Pi');
is('constant', 'planck', 'exact:Planck constant');
is('latinphrase', 'etc', 'exact:Et cetera');
is('latinphrase', 'veni vidi vici', 'exact:Veni, vidi, vici');
is('numeral', 'binary', 'exact:Binary numeral system');
is('numbertype', 'prime', 'exact:Prime number');
is('distribution', 'normal', 'exact:Normal distribution');
is('turkey', 'izmir', 'exact:İzmir');
is('turkey', 'igdir', 'exact:Iğdır');
is('china', 'shanxi', 'exact:Shanxi');
is('china', 'shaanxi', 'exact:Shaanxi');
is('ukcity', 'londonderry', 'exact:Derry');
is('ukcity', 'St. Davids', 'exact:St Davids');
is('mexico', 'mexico', 'exact:State of Mexico');
is('swisscanton', 'geneve', 'exact:Geneva');
is('asteroid', 'ceres', 'exact:Ceres');
is('asteroid', '433 Eros', 'exact:Eros');
is('asteroid', '4 vesta', 'exact:Vesta');
is('earlyphil', 'kant', 'exact:Immanuel Kant');
is('medphil', 'aquinas', 'exact:Thomas Aquinas');
is('uscity', 'topeka', 'exact:Topeka');
is('galaxy', 'NGC 1300', 'exact:NGC 1300');
is('nebula', 'crab', 'exact:Crab Nebula');
is('galaxy', 'andromeda', 'exact:Andromeda Galaxy');
is('signlang', 'ASL', 'exact:American Sign Language');
is('signlang', 'british', 'exact:British Sign Language');
is('parable', 'the good samaritan', 'exact:Good Samaritan');
is('parable', 'Parable of the Sower', 'exact:Sower');
is('grimm', 'frog prince', 'exact:The Frog Prince');
is('poe', 'raven', 'exact:The Raven');
is('novel19', 'moby dick', 'exact:Moby-Dick');
is('cape', 'good hope', 'exact:Cape of Good Hope');
is('cape', 'horn', 'exact:Cape Horn');
is('pass', 'khyber', 'exact:Khyber Pass');
is('scotisland', 'skye', 'exact:Skye');
is('bank', 'barclays bank', 'exact:Barclays');
is('orchestra', 'berlin phil', 'none');
is('orchestra', 'vienna philharmonic orchestra', 'exact:Vienna Philharmonic');
is('philbranch', 'philosophy of mind', 'exact:Philosophy of mind');
is('aminoacid', 'glutamate', 'exact:Glutamic acid');
is('country-euro', 'bulgaria', 'exact:Bulgaria');
is('country-euro', 'sweden', 'known');
is('capital-in-AS', 'tokyo', 'exact:Tokyo');
is('capital-in-AM', 'paris', 'known');
is('scotuscase', 'Roe versus Wade', 'exact:Roe v. Wade');
is('scotuscase', 'Brown v Board', 'exact:Brown v. Board of Education');
is('dickens', 'scrooge', 'exact:Ebenezer Scrooge');
is('dickens', 'havisham', 'exact:Miss Havisham');
is('arthur', 'Sir Lancelot', 'exact:Lancelot');
is('arthur', 'King Arthur', 'exact:King Arthur');
is('explorer', 'magellan', 'exact:Ferdinand Magellan');
is('usvp', 'burr', 'exact:Aaron Burr');
is('usvp', 'johnson', 'exact:Lyndon B. Johnson');
is('usvp', 'Andrew Johnson', 'exact:Andrew Johnson');
is('painting', 'starry night', 'exact:The Starry Night');
is('genre', 'gothic', 'exact:Gothic fiction');
is('npp', 'chernobyl', 'exact:Chernobyl');
is('npp', 'Chernobyl Nuclear Power Plant', 'exact:Chernobyl');
is('crisis', 'Panic of 1907', 'exact:Panic of 1907');
is('mathbranch', 'number theory', 'exact:Number theory');
// a title is part of the name when the titled name is its own answer
is('snake', 'cobra', 'exact:Cobra');
is('snake', 'king cobra', 'exact:King cobra');
is('raptor', 'King vulture', 'exact:King vulture');
is('raptor', 'vulture', 'exact:Vulture');

// people: surnames, and names without the middle
is('president', 'kennedy', 'exact:John F. Kennedy');
is('president', 'John Kennedy', 'exact:John F. Kennedy');
is('president', 'JFK', 'exact:John F. Kennedy');
is('president', 'roosevelt', 'exact:Franklin D. Roosevelt'); // the better known of two
is('president', 'Teddy Roosevelt', 'exact:Theodore Roosevelt');
is('president', 'johnson', 'exact:Lyndon B. Johnson');
is('president', 'Andrew Johnson', 'exact:Andrew Johnson');
is('president', 'Benjamin Franklin', 'none');
is('baroque', 'bach', 'exact:Johann Sebastian Bach');
is('baroque', 'JS Bach', 'exact:Johann Sebastian Bach');
is('baroque', 'scarlatti', 'exact:Domenico Scarlatti');
is('baroque', 'Alessandro Scarlatti', 'exact:Alessandro Scarlatti');
is('impressionist', 'van gogh', 'exact:Vincent van Gogh');
is('impressionist', 'Monet', 'exact:Claude Monet');
is('impressionist', 'Manet', 'exact:Édouard Manet');
is('renpainter', 'da vinci', 'exact:Leonardo da Vinci');
is('nobelpeace', 'MLK', 'exact:Martin Luther King Jr.');
is('nobelpeace', 'king', 'exact:Martin Luther King Jr.');
is('nobelphys', 'curie', 'exact:Marie Curie');
is('nobelphys', 'Pierre Curie', 'exact:Pierre Curie');
is('nobelphys', 'einstien', 'near:Albert Einstein');
ok(O.surnames('Vincent van Gogh').join('|') === 'Gogh|van Gogh|Vincent Gogh|Vincent van Gogh' || O.surnames('Vincent van Gogh').includes('van Gogh'), 'van Gogh');
ok(O.surnames('Oliver Wendell Holmes Jr.').includes('Holmes'), 'a generation suffix is not a surname');
ok(O.surnames('Charles Carroll of Carrollton').length === 0, 'no surname is guessed for "X of Y"');
ok(O.surnames('Rembrandt').length === 0, 'a single name has no surname');

// rulers: titles, numerals, old letters
is('monarch', 'Henry 8', 'exact:Henry VIII');
is('monarch', 'Queen Victoria', 'exact:Victoria');
is('monarch', 'King John', 'exact:John');
is('monarch', 'Aethelstan', 'exact:Æthelstan');
is('monarch', 'Ethelred the Unready', 'exact:Æthelred the Unready');
is('pope', 'Pope John Paul II', 'exact:John Paul II');
is('pope', 'john paul 2', 'exact:John Paul II');
is('japan', 'Emperor Meiji', 'exact:Meiji');
is('norse', 'hodr', 'exact:Höðr');
is('norse', 'Tyr', 'exact:Týr');
is('frenchking', 'Louis 14', 'exact:Louis XIV');
is('frenchking', 'Napoleon', 'exact:Napoleon');

// titles of works
is('shakespeare', 'lear', 'exact:King Lear');
is('shakespeare', 'Midsummer Nights Dream', "exact:A Midsummer Night's Dream");
is('shakespeare', 'Henry IV Part 1', 'exact:Henry IV, Part 1');
is('booker', 'The Sea', 'exact:The Sea');
is('booker', 'end of everything', 'exact:The End of Everything');
is('pulitzer', 'angel down', 'exact:Angel Down');
is('pulitzerdrama', 'liberation', 'exact:Liberation');
is('natpark', 'Chiricahua National Park', 'exact:Chiricahua');
is('booker', 'The Sea, the Sea', 'exact:The Sea, the Sea');
is('greekplay', 'Oedipus the King', 'exact:Oedipus Rex');

// subsets know the wider set
is('country-commonwealth', 'India', 'exact:India');
is('country-commonwealth', 'France', 'known');
is('country-in-AF', 'Brazil', 'known');
is('country-in-AF', 'Narnia', 'none');
is('country-eu', 'Germany', 'exact:Germany');
is('country-eu', 'Norway', 'known');
is('country-eu', 'UK', 'known');
is('country-nato', 'Finland', 'exact:Finland');
is('country-monarchy', 'Japan', 'exact:Japan');
is('country-monarchy', 'France', 'known');
is('country-oecd', 'Czech Republic', 'exact:Czechia');
is('country-in-AM', 'Brazil', 'exact:Brazil');
is('capital-in-EU', 'Paris', 'exact:Paris');
is('capital-in-EU', 'Tokyo', 'known');
is('capital-in-AF', 'Nairobi', 'exact:Nairobi');
is('country-all', 'UK', 'exact:United Kingdom');
is('element-all', 'sulphur', 'exact:Sulfur');
is('element-all', 'aluminium', 'exact:Aluminum');

// normalising
ok(O.normalize('  The  Gambia ') === 'gambia', 'articles and spaces');
ok(O.normalize('Æthelstan') === 'aethelstan' && O.normalize('Höðr') === 'hodr' && O.normalize('Wałęsa') === 'walesa', 'letters that do not decompose');
ok(O.normalize('St. Lawrence') === O.normalize('Saint Lawrence'), 'St. means Saint');
ok(O.normalize('C++') !== O.normalize('C') && O.normalize('C#') !== O.normalize('C'), 'C, C++ and C# are three languages');
is('proglang', 'c++', 'exact:C++');
is('proglang', 'C#', 'exact:C#');
is('proglang', 'c', 'exact:C');

// ---- the 100-point answers
for (const [id, name] of [
  ['constellation', 'Caelum'],
  ['president', 'Chester A. Arthur'],
  ['muscle', 'Stapedius'],
  ['theorem', 'Hairy ball theorem'],
  ['centralbank', 'Sveriges Riksbank'],
  ['bigcity', 'Dongguan'],
  ['usvp', 'William R. King'],
  ['oxbridge', 'Campion Hall'],
  ['greekletter', 'Upsilon'],
  ['war', 'Anglo-Zanzibar War'],
  ['crime', 'Barratry'],
  ['plato', 'Rival Lovers'],
]) {
  const m = O.match(get(id), name);
  ok(m.type === 'exact' && m.answer.score === 100 && m.answer.fact, `${id}: ${name} should be the 100-point answer, with a fact`);
}
for (const p of all) {
  const gem = [...p.answers, ...(p.tail ? p.tail.answers : [])].find((a) => a.tier === 'outlier');
  if (D.lists.some((l) => l[0] === p.id)) ok(gem.fact, `${p.id}: the 100-point answer (${gem.name}) has no fact`);
}

// ---- deep catalogues
if (deepPrompts) {
  ok(deepPrompts >= 130, `only ${deepPrompts} deep catalogues`);
  // nothing invented, nothing from the wrong shelf
  for (const [id, text] of [
    ['nobelphys', 'Sheldon Cooper'],
    ['scotus', 'Bart Simpson'],
    ['fallacy', 'Masturbation'],
    ['government', 'North Korea'],
    ['greekphilosopher', 'Immanuel Kant'],
    ['unit', 'Stone Age'],
    ['exchange', 'Goldman Sachs'],
    ['impressionist', 'Pablo Picasso'],
    ['primate', 'Homo sapiens'],
    ['artmovement', 'Rapping'],
    ['curve', 'Equator'],
    ['phobia', 'Anti-Catholicism'],
    ['disorder', 'Larynx'],
    ['meter', 'Big Ben'],
    ['algorithm', 'Bitcoin'],
    ['datastructure', 'PNG'],
    ['explorer', 'Theodore Roosevelt'],
    ['greekmyth', 'Demeter'],
    ['museum', 'Palace of Versailles'],
    ['period', 'World War II'],
    ['ideology', 'Hamas'],
    ['scripture', 'Ten Commandments'],
    ['archipelago', 'Jamaica'],
    ['infection', 'Psoriasis'],
    ['scilaw', 'Queer'],
    ['religion', 'Tawhid'],
    ['landform', 'Backyard'],
  ]) {
    ok(O.match(get(id), text).type !== 'exact', `${id}: "${text}" should not be accepted`);
  }
  // ...and real depth
  for (const [id, text, score] of [
    ['nobelphys', 'Pieter Zeeman', null],
    ['dinosaur', 'Carcharodontosaurus', null],
    ['pope', 'Gregory XVI', null],
    ['pope', 'Pope Gregory XVI', null],
    ['theorem', 'Heine–Borel theorem', null],
    ['theorem', 'heine borel', null],
    ['frdept', 'Lozère', null],
    ['longriver', 'Kama', null],
    ['mineral', 'Goethite', null],
    ['snake', 'Titanoboa', null],
    ['painting', 'The Death of Socrates', null],
    ['scotuscase', 'Nix v. Hedden', null],
    ['greekisland', 'Agistri', null],
    ['journal', 'Current Biology', null],
    ['bibleperson', 'Jesse', null],
    ['waterfall', 'Glymur', null],
    ['highpoint', 'Gunnbjørn Fjeld', null],
    ['anthem', 'Menıñ Qazaqstanym', null],
  ]) {
    const m = O.match(get(id), text);
    ok(m.type === 'exact' && m.answer.score >= 60, `${id}: "${text}" should be a deep answer, got ${m.type} ${m.answer ? m.answer.score : ''}`);
    if (score) ok(m.answer.score === score, `${id}: "${text}" scored ${m.answer.score}`);
  }
  const s = O.search(get('dinosaur'), 'saurus', 5, 'obscure');
  ok(s.found.length === 5 && s.total > 100 && s.found.every((a) => a.tier === 'obscure'), 'search finds deep answers by tier');
}

// ---- scheduling
const seenAt = new Map();
for (let run = 1; run <= 120; run++) {
  const picks = O.promptsForRun(run);
  ok(picks.length === O.ROUNDS, `run ${run}: ${picks.length} prompts`);
  ok(new Set(picks.map((p) => p.group)).size === O.ROUNDS, `run ${run}: two prompts from one family`);
  const perSubject = {};
  for (const p of picks) perSubject[p.subject] = (perSubject[p.subject] || 0) + 1;
  ok(Math.max(...Object.values(perSubject)) <= 2, `run ${run}: three prompts from one subject: ${JSON.stringify(perSubject)}`);
  for (const p of picks) if (!seenAt.has(p.id)) seenAt.set(p.id, run);
}
ok(O.promptsForRun(7) === O.promptsForRun(7), 'a run is stable');
ok(seenAt.size === all.length, `${all.length - seenAt.size} prompts never came up in 120 runs: ${all.filter((p) => !seenAt.has(p.id)).map((p) => p.id).join(' ')}`);
// No prompt repeats while others have not been used at all.
const firstRepeat = (() => {
  const used = new Set();
  for (let run = 1; run <= 120; run++) for (const p of O.promptsForRun(run)) {
    if (used.has(p.id)) return run;
    used.add(p.id);
  }
  return Infinity;
})();
ok(firstRepeat > 6, `a prompt repeated as early as run ${firstRepeat}`);

// ---- the daily climb
const dailySeen = new Map();
let dailyGap = Infinity;
for (let day = 1; day <= 200; day++) {
  const picks = O.promptsForDay(day);
  ok(picks.length === O.ROUNDS, `day ${day}: ${picks.length} prompts`);
  ok(new Set(picks.map((p) => p.subject)).size === O.ROUNDS, `day ${day}: two prompts from one subject`);
  ok(new Set(picks.map((p) => p.group)).size === O.ROUNDS, `day ${day}: two prompts from one family`);
  for (const p of picks) {
    if (dailySeen.has(p.id)) dailyGap = Math.min(dailyGap, day - dailySeen.get(p.id));
    dailySeen.set(p.id, day);
  }
}
ok(dailyGap >= 20, `a daily prompt came back after only ${dailyGap} days`);
ok(dailySeen.size === all.length, `${all.length - dailySeen.size} prompts never came up in 200 days of dailies`);
ok(O.promptsForDay(9) === O.promptsForDay(9), 'a day is stable');
ok(O.promptsForDay(1).map((p) => p.id).join() !== O.promptsForRun(1).map((p) => p.id).join(), 'the daily is its own sequence, not the numbered climbs');

// A day is a UTC calendar day counted from the start date, so it changes at
// the same moment for everyone, whatever their own clock says.
const [sy, sm, sd] = O.DAILY_START.split('-').map(Number);
const utc = (...parts) => new Date(Date.UTC(...parts));
ok(O.dayNumber(utc(sy, sm - 1, sd)) === 1 && O.dayNumber(utc(sy, sm - 1, sd, 23, 59, 59, 999)) === 1, 'day 1 lasts the whole start date, UTC');
ok(O.dayNumber(utc(sy, sm - 1, sd + 1)) === 2 && O.dayNumber(utc(sy, sm - 1, sd + 365)) === 366, 'each UTC midnight starts a new day');
ok(O.dayNumber(utc(sy, sm - 1, sd - 5)) === 1, 'a clock set before the start still gets day 1');
// 23:30 UTC and 00:30 UTC, each written as a local time eight hours behind and nine ahead.
ok(O.dayNumber(new Date(O.DAILY_START + 'T15:30:00-08:00')) === 1 && O.dayNumber(new Date(O.DAILY_START + 'T16:30:00-08:00')) === 2, 'an evening in California straddles the change');
ok(O.dayNumber(new Date(Date.UTC(sy, sm - 1, sd + 1, 8, 30) - 9 * 3600000)) === 1 && O.dayNumber(new Date(Date.UTC(sy, sm - 1, sd + 1, 9, 30) - 9 * 3600000)) === 2, 'so does a morning in Tokyo');

// The pinned schedule is valid and is what the engine serves.
if (D.daily) {
  ok(D.daily.start === O.DAILY_START && D.daily.days.length >= 60, `only ${D.daily.days.length} days pinned`);
  D.daily.days.forEach((line, i) => {
    const ids = line.split(' ');
    ok(ids.length === O.ROUNDS && ids.every((id) => byId.has(id)), `pinned day ${i + 1} names a prompt that does not exist: ${line}`);
    ok(O.promptsForDay(i + 1).map((p) => p.id).join(' ') === line, `day ${i + 1} is not served as pinned`);
  });
}

// ---- the simulated field
const medians = [];
for (let run = 1; run <= 30; run++) {
  const totals = O.simulateField(O.promptsForRun(run), run);
  ok(totals.length === O.FIELD_SIZE && totals.every((t) => t >= 0 && t <= O.MAX_SCORE), `run ${run}: field out of range`);
  const sorted = totals.slice().sort((a, b) => a - b);
  medians.push(sorted[sorted.length >> 1]);
  ok(O.percentile(totals, 0) === 0 && O.percentile(totals, 701) === 100, 'percentile bounds');
  ok(O.percentile(totals, 300) >= O.percentile(totals, 200), 'percentile is monotonic');
}
const meanMedian = medians.reduce((a, b) => a + b, 0) / medians.length;
ok(meanMedian > 200 && meanMedian < 330, `the typical simulated player scores ${meanMedian.toFixed(0)}; expected somewhere in 200–330`);
ok(O.bandFor(0).name === 'The Reading Room' && O.bandFor(450).name === 'The Lantern Room', 'bands');

if (failures.length) {
  console.error(`${failures.length} of ${checks} checks failed:`);
  for (const f of failures.slice(0, 60)) console.error('  ' + f);
  if (failures.length > 60) console.error(`  ...and ${failures.length - 60} more`);
  process.exit(1);
}
console.log(`ok: ${checks} checks, ${all.length} prompts (${deepPrompts} with a deep catalogue), ${catalogueTotal.toLocaleString()} accepted answers, typical field score ${meanMedian.toFixed(0)}`);
