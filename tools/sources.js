/*
 * Where each category's full answer set comes from.
 *
 * A category in js/data-lists.js with an entry here has its hand-ranked list
 * extended by a deep catalogue fetched from Wikidata. Categories without an
 * entry are complete as written (constellations, books of the Bible).
 *
 * Each entry is [links, pattern]:
 *   pattern  a Wikidata graph pattern binding ?item to the category's members
 *   links    the fewest language editions of Wikipedia an item must appear
 *            in. It separates real, nameable things from noise, and that
 *            same count is the familiarity signal the tiers are built from.
 *
 * Each category is one request; see BATCHES below for why they are not combined.
 */
const EN_ARTICLE = '?enwiki schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .';
const SPECIES_UP = 'VALUES ?rank { wd:Q7432 wd:Q34740 wd:Q35409 }'; // species, genus, family

const a = (qid) => `?item wdt:P31 wd:${qid} .`; // is a ...
const aKindOf = (qid) => `?item wdt:P31/wdt:P279* wd:${qid} .`; // is a ..., or a kind of one
const kind = (qid) => `?item (wdt:P31|wdt:P279)/wdt:P279* wd:${qid} .`; // is, or is a type of
const won = (qid) => `?item wdt:P166 wd:${qid} .`;
const held = (...qids) => qids.map((q) => `{ ?item wdt:P39 wd:${q} . }`).join(' UNION ') + ' ?item wdt:P31 wd:Q5 .'; // real people only
const taxon = (qid) => `?item wdt:P171* wd:${qid} ; wdt:P105 ?rank . ${SPECIES_UP} ${EN_ARTICLE}`;
// People with an occupation born within a span of years.
const bornBetween = (occupation, from, to, extra = '') =>
  `?item wdt:P106 wd:${occupation} ; wdt:P31 wd:Q5 ; wdt:P569 ?born . FILTER(YEAR(?born) >= ${from} && YEAR(?born) < ${to}) ${extra}`;
// A physical quantity above a threshold, in SI units whatever unit it was recorded in.
const over = (property, amount) => `?item p:${property}/psn:${property}/wikibase:quantityAmount ?amount . FILTER(?amount > ${amount})`;

// is a kind of ... (never the class itself, nor a mere instance)
const sub = (qid) => `?item wdt:P279+ wd:${qid} .`;
const any = (...patterns) => patterns.map((p) => `{ ${p} }`).join(' UNION ');
const battleOf = (war) => `?item wdt:P31/wdt:P279* wd:Q178561 ; wdt:P361+ wd:${war} .`;

const PAINTER = 'Q1028181';
const COMPOSER = 'Q36834';
const PHILOSOPHER = 'Q4964182';

const SOURCES = {
  // ---- physics and chemistry
  particle: [8, kind('Q177013')],
  unit: [15, aKindOf('Q47574')],
  alloy: [3, kind('Q37756')],
  nobelphys: [1, won('Q38104')],
  nobelchem: [1, won('Q44585')],
  meter: [8, kind('Q2041172')],
  scilaw: [5, '{ ?item wdt:P31/wdt:P279* wd:Q214070 . } UNION { ?item wdt:P31/wdt:P279* wd:Q408891 . }'],
  // anything filed under "acid" whose name says so
  acid: [12, '?item wdt:P279+ wd:Q11158 ; rdfs:label ?name . FILTER(LANG(?name) = "en" && STRENDS(?name, " acid"))'],
  constant: [3, a('Q173227')],
  physbranch: [3, a('Q4162444')],
  labware: [5, kind('Q834028')],

  // ---- astronomy and space
  moon: [1, aKindOf('Q2537')],
  spacefarer: [1, '?item wdt:P2873 ?time ; wdt:P31 wd:Q5 .'], // has logged time in space
  rocket: [8, kind('Q697175')],
  spacetelescope: [3, aKindOf('Q148578')],
  probe: [5, aKindOf('Q26529')],
  // Catalogue objects have a stub in dozens of bot-written editions, so the floors here are high.
  star: [15, aKindOf('Q523')],
  galaxy: [35, aKindOf('Q318')],
  nebula: [12, aKindOf('Q42372')],
  asteroid: [40, any(aKindOf('Q3863'), aKindOf('Q2199'))], // asteroids of every kind, and dwarf planets
  spaceagency: [3, aKindOf('Q17505024')],
  meteorshower: [3, a('Q105000')],
  observatory: [8, any(aKindOf('Q1254933'), aKindOf('Q62832'))],
  startype: [8, sub('Q523')],

  // ---- earth science
  rock: [5, kind('Q8063')],
  plate: [2, a('Q215680')],
  current: [3, a('Q129558')],
  volcano: [10, aKindOf('Q8072')],
  mineral: [15, a('Q12089225')],
  cloud: [3, '{ ?item wdt:P31 wd:Q1840368 . } UNION { ?item wdt:P279 ?genus . ?genus wdt:P31 wd:Q1840368 . }'],
  impact: [3, '?item wdt:P31 wd:Q55818 ; wdt:P17 ?country .'], // craters with a country are the ones on Earth
  landform: [15, '?item wdt:P279+ wd:Q271669 .'],
  wind: [3, kind('Q8094')],
  glacier: [10, aKindOf('Q35666')],
  biome: [8, any(a('Q101998'), sub('Q101998'))],
  trench: [3, a('Q119253')],
  cave: [10, aKindOf('Q35509')],

  // ---- life science
  // fossil genera under Dinosauria (which, awkwardly, includes the birds)
  dinosaur: [1, `?item wdt:P171* wd:Q430 ; wdt:P105 wd:Q34740 ; wdt:P31 wd:Q23038290 . ${EN_ARTICLE}`],
  shark: [1, taxon('Q7372')],
  primate: [1, taxon('Q7380')],
  marsupial: [1, taxon('Q25336')],
  cetacean: [1, taxon('Q160')],
  wildcat: [1, `?item wdt:P171* wd:Q25265 ; wdt:P105 wd:Q7432 . ${EN_ARTICLE} FILTER NOT EXISTS { ?item wdt:P31 wd:Q23038290 }`],
  conifer: [2, `?item wdt:P171* wd:Q132825 ; wdt:P105 ?rank . VALUES ?rank { wd:Q7432 wd:Q34740 } ${EN_ARTICLE}`],
  raptor: [5, `?item wdt:P171* ?order ; wdt:P105 ?rank . VALUES ?order { wd:Q21736 wd:Q25370 wd:Q25222 wd:Q20639356 } ${SPECIES_UP} ${EN_ARTICLE}`],
  snake: [20, taxon('Q25537662')], // every snake has a stub in a few bot-written editions; 20 keeps the ones people write about
  cellpart: [5, kind('Q45948')], // organelles
  rodent: [30, taxon('Q10850')],
  parrot: [25, taxon('Q31431')],
  deer: [3, taxon('Q23390')],
  turtle: [15, taxon('Q223044')],
  cephalopod: [10, taxon('Q128257')],
  pterosaur: [3, `?item wdt:P171* wd:Q179204 ; wdt:P105 wd:Q34740 . ${EN_ARTICLE}`], // genera
  canid: [5, `?item wdt:P171* wd:Q25324 ; wdt:P105 wd:Q7432 . ${EN_ARTICLE}`], // species
  waterfowl: [15, taxon('Q7556')],
  phylum: [3, '?item wdt:P105 wd:Q38348 ; wdt:P171* wd:Q729 .'], // of the animal kingdom

  // ---- mathematics
  theorem: [3, a('Q65943')],
  fields: [1, won('Q28835')],
  mathbranch: [5, a('Q1936384')],
  conjecture: [2, a('Q319141')],
  curve: [5, '?item (wdt:P31|wdt:P279)/wdt:P279* wd:Q161973 .'],
  greekmath: [3, '?item wdt:P106 wd:Q170790 ; wdt:P1412 wd:Q35497 ; wdt:P31 wd:Q5 .'], // mathematicians who wrote in Ancient Greek
  mathconstant: [3, a('Q186509')],
  distribution: [3, kind('Q200726')],
  numeral: [3, aKindOf('Q122653')],
  numbertype: [5, sub('Q11563')],
  equation: [5, aKindOf('Q11345')],

  // ---- medicine and psychology
  nobelmed: [1, won('Q80061')],
  bone: [3, kind('Q265868')],
  muscle: [5, kind('Q7365')],
  hormone: [8, kind('Q11364')],
  specialty: [3, a('Q930752')],
  bias: [2, a('Q1127759')],
  infection: [20, kind('Q18123741')],
  phobia: [3, kind('Q175854')],
  disorder: [15, kind('Q12135')],
  brain: [8, '{ ?item wdt:P31 wd:Q103843052 . } UNION { ?item wdt:P279+ wd:Q1620186 . } UNION { ?item wdt:P361+ wd:Q1073 . }'], // a kind of brain region, or part of the brain
  antibiotic: [5, any(kind('Q12187'), '?item wdt:P2868 wd:Q12187 .')], // filed as an antibiotic, or given that role
  cancer: [8, sub('Q12078')],
  artery: [5, kind('Q9655')],
  nerve: [5, kind('Q9620')],

  // ---- technology and engineering
  proglang: [1, aKindOf('Q9143')],
  os: [5, aKindOf('Q9135')],
  turing: [1, won('Q185667')],
  cipher: [2, kind('Q4681865')],
  algorithm: [10, kind('Q8366')],
  datastructure: [5, kind('Q175263')],
  bridge: [20, aKindOf('Q12280')],
  npp: [5, a('Q134447')],
  dam: [10, aKindOf('Q12323')],
  canal: [8, aKindOf('Q12284')],
  protocol: [8, aKindOf('Q15836568')], // computer network protocols; the wider "communication protocol" class holds products and services
  shiptype: [5, a('Q2235308')],
  component: [10, sub('Q11653')], // kinds of component only: its instances are particular masts, chips and products

  // ---- history
  emperor: [3, held('Q842606', 'Q18577504')], // Roman and Byzantine
  japan: [1, held('Q208233')],
  pharaoh: [3, held('Q37110')],
  pope: [3, held('Q19546')],
  // classed as an empire, or a former state whose name says it was one
  empire: [6, `{ ${aKindOf('Q48349')} } UNION { ?item wdt:P31/wdt:P279* wd:Q3024240 ; rdfs:label ?name . FILTER(LANG(?name) = "en" && STRENDS(?name, " Empire")) }`],
  treaty: [8, aKindOf('Q131569')],
  ww2battle: [5, '?item wdt:P31/wdt:P279* wd:Q178561 ; wdt:P361+ wd:Q362 .'],
  napoleonbattle: [3, '?item wdt:P31/wdt:P279* wd:Q178561 ; wdt:P361+ wd:Q78994 .'],
  romanprovince: [2, a('Q182547')],
  nobelpeace: [1, won('Q35637')],
  war: [25, aKindOf('Q198')],
  revolution: [10, aKindOf('Q10931')],
  period: [10, a('Q11514315')],
  explorer: [15, '?item wdt:P106 wd:Q11900058 ; wdt:P31 wd:Q5 .'],
  ww1battle: [5, '?item wdt:P31/wdt:P279* wd:Q178561 ; wdt:P361+ wd:Q361 .'],
  uscwbattle: [3, '?item wdt:P31/wdt:P279* wd:Q178561 ; wdt:P361+ wd:Q8676 .'],
  polis: [5, a('Q148837')],
  siege: [10, aKindOf('Q188055')],
  navalbattle: [8, aKindOf('Q1261499')],
  ancientcity: [10, a('Q15661340')],
  pirate: [5, '?item wdt:P106 ?occupation ; wdt:P31 wd:Q5 . VALUES ?occupation { wd:Q201559 wd:Q10729326 }'],
  operation: [5, '?item wdt:P31/wdt:P279* wd:Q645883 ; wdt:P361+ wd:Q362 .'],
  rebellion: [12, aKindOf('Q124734')],
  archsite: [25, a('Q839954')],
  calendar: [5, aKindOf('Q12132')],
  revwarbattle: [3, battleOf('Q40949')],
  civilization: [5, any(aKindOf('Q8432'), a('Q28171280'))],
  formercountry: [45, aKindOf('Q3024240')],

  // ---- geography
  frdept: [1, a('Q6465')],
  rusubject: [1, aKindOf('Q43263')],
  longriver: [5, `?item wdt:P31 wd:Q4022 . ${over('P2043', 1000000)}`], // metres
  biglake: [5, `?item wdt:P31/wdt:P279* wd:Q23397 . ${over('P2046', 1000000000)}`], // square metres
  range: [10, aKindOf('Q46831')],
  desert: [2, aKindOf('Q8514')],
  sea: [3, aKindOf('Q165')],
  strait: [8, a('Q37901')],
  peninsula: [10, a('Q34763')],
  greekisland: [8, '?item wdt:P31/wdt:P279* wd:Q23442 ; wdt:P17 wd:Q41 .'],
  archipelago: [15, aKindOf('Q33837')],
  waterfall: [10, aKindOf('Q34038')],
  gulf: [12, '{ ?item wdt:P31 wd:Q39594 . } UNION { ?item wdt:P31 wd:Q1322134 . }'],
  highpoint: [1, '?state wdt:P31 wd:Q3624078 ; wdt:P610 ?item .'], // the highest point of a sovereign state
  uscity: [3, '?item wdt:P31/wdt:P279* wd:Q515 ; wdt:P17 wd:Q30 ; wdt:P1082 ?people . FILTER(?people > 100000)'],
  cape: [10, a('Q185113')],
  pass: [12, aKindOf('Q133056')],
  scotisland: [5, '?item wdt:P31/wdt:P279* wd:Q23442 ; wdt:P131* wd:Q22 .'],

  // ---- language
  officiallang: [1, '?state wdt:P31 wd:Q3624078 ; wdt:P37 ?item .'],
  script: [8, aKindOf('Q8192')],
  langfamily: [8, a('Q25295')],
  figure: [2, '{ ?item wdt:P31|wdt:P279 wd:Q10690215 . } UNION { ?item wdt:P31|wdt:P279 wd:Q1762471 . } UNION { ?item wdt:P31|wdt:P279 wd:Q182545 . }'],
  deadlang: [15, '{ ?item wdt:P31 wd:Q45762 . } UNION { ?item wdt:P31 wd:Q436240 . } UNION { ?item wdt:P31 wd:Q38058796 . }'],
  gramcase: [3, a('Q128234')],
  romance: [8, sub('Q19814')],
  germanic: [8, sub('Q21200')],
  latinphrase: [3, any(a('Q3062294'), '?item wdt:P31 wd:Q187931 ; wdt:P407 wd:Q397 .')], // a Latin phrase, or a phrase whose language is Latin
  signlang: [3, a('Q34228')],

  // ---- literature
  shakeschar: [1, '?item wdt:P1441 ?work . ?work wdt:P50 wd:Q692 .'],
  homerchar: [1, '?item wdt:P1441 ?work . VALUES ?work { wd:Q8275 wd:Q35160 }'],
  nobellit: [1, won('Q37922')],
  epic: [3, aKindOf('Q37484')],
  aesop: [2, '?item wdt:P50 wd:Q43423 .'], // one link is a single translation or edition
  litmovement: [2, a('Q3326717')],
  genre: [10, a('Q223393')],
  dickens: [1, '{ ?item wdt:P1441 ?work . ?work wdt:P50 wd:Q5686 . } UNION { ?item wdt:P170 wd:Q5686 ; wdt:P31 ?fiction . VALUES ?fiction { wd:Q15632617 wd:Q3658341 } }'],
  // knights of the Round Table, and anyone in Le Morte d'Arthur or filed under the Matter of Britain
  arthur: [1, '{ ?item wdt:P463 wd:Q1644266 . } UNION { ?item wdt:P1441 wd:Q1136104 . } UNION { ?item wdt:P1080 wd:Q507738 . } UNION { ?item wdt:P1441 wd:Q507738 . }'],
  grimm: [3, '?item wdt:P50 wd:Q2793 .'],
  andersen: [3, '?item wdt:P50 wd:Q5673 .'],
  poe: [3, '?item wdt:P50 wd:Q16867 .'],
  novel19: [12, `${any('?item wdt:P7937 wd:Q8261 .', '?item wdt:P136 wd:Q8261 .', '?item wdt:P31 wd:Q8261 .')} ?item wdt:P577 ?date . FILTER(YEAR(?date) >= 1800 && YEAR(?date) < 1900)`],
  // wrote in Latin, born before 500
  latinwriter: [15, '?item wdt:P106 ?occupation ; wdt:P1412 wd:Q397 ; wdt:P31 wd:Q5 ; wdt:P569 ?born . FILTER(YEAR(?born) < 500) VALUES ?occupation { wd:Q36180 wd:Q49757 wd:Q201788 wd:Q214917 }'],

  // ---- art and architecture
  artmovement: [3, a('Q968159')],
  renpainter: [8, bornBetween(PAINTER, 1250, 1550, '?item wdt:P19 ?birthplace . ?birthplace wdt:P17 wd:Q38 .')], // born in what is now Italy
  // the generation that made the two movements, not everyone later filed under them
  impressionist: [5, `?item wdt:P106 wd:${PAINTER} ; wdt:P135 ?movement ; wdt:P569 ?born . VALUES ?movement { wd:Q40415 wd:Q166713 } FILTER(YEAR(?born) >= 1820 && YEAR(?born) < 1880)`],
  dutchpainter: [8, bornBetween(PAINTER, 1570, 1680, '{ ?item wdt:P27 wd:Q170072 . } UNION { ?item wdt:P19 ?birthplace . ?birthplace wdt:P17 wd:Q55 . }')],
  pritzker: [1, won('Q133160')],
  archstyle: [3, a('Q32880')],
  museum: [20, aKindOf('Q207694')],
  painting: [20, a('Q3305213')],
  cathedral: [8, '?item wdt:P31/wdt:P279* wd:Q2977 ; wdt:P149/wdt:P279* wd:Q176483 .'],
  sculpture: [12, any(a('Q860861'), a('Q179700'))], // sculptures and statues
  vangogh: [3, '?item wdt:P170 wd:Q5582 ; wdt:P31 wd:Q3305213 .'],
  flemish: [8, bornBetween(PAINTER, 1370, 1680, '?item wdt:P19 ?birthplace . ?birthplace wdt:P17 wd:Q31 .')], // born in what is now Belgium
  castle: [20, aKindOf('Q23413')],
  palace: [25, aKindOf('Q16560')],
  pyramid: [8, aKindOf('Q12516')],

  // ---- music and theatre
  // Composers have no reliable "era" in Wikidata, so each era is a span of birth years.
  baroque: [10, bornBetween(COMPOSER, 1560, 1700)],
  classical: [10, bornBetween(COMPOSER, 1700, 1775)],
  romantic: [10, bornBetween(COMPOSER, 1775, 1870)],
  opera: [5, '?item wdt:P136 wd:Q1344 ; wdt:P31 wd:Q58483083 .'], // a stage work whose genre is opera
  instrument: [2, '?item wdt:P279+ wd:Q34379 .'],
  ballet: [2, '{ ?item wdt:P31 wd:Q15079786 . } UNION { ?item wdt:P31 wd:Q41425 . } UNION { ?item wdt:P136 wd:Q41425 ; wdt:P31 ?work . VALUES ?work { wd:Q105543609 wd:Q58483083 wd:Q57980469 wd:Q43099869 } }'],
  operahouse: [8, aKindOf('Q153562')],
  anthem: [1, '?state wdt:P31 wd:Q3624078 ; wdt:P85 ?item .'],
  percussion: [3, sub('Q133163')],
  orchestra: [8, aKindOf('Q42998')],
  renaissance: [8, bornBetween(COMPOSER, 1000, 1560)],

  // ---- philosophy
  // two levels down at most: the class tree below "fallacy" wanders off into unrelated things
  fallacy: [2, '{ ?item wdt:P31|wdt:P279 wd:Q186150 . } UNION { ?item wdt:P31|wdt:P279 ?kind . ?kind wdt:P279 wd:Q186150 . }'],
  greekphilosopher: [5, '?item wdt:P106 wd:Q4964182 ; wdt:P1412 wd:Q35497 .'], // philosophers who wrote in Ancient Greek
  philmovement: [5, '{ ?item wdt:P31 wd:Q2915955 . } UNION { ?item wdt:P31 wd:Q1387659 . }'],
  paradox: [3, a('Q483372')],
  thoughtexp: [2, a('Q147027')],
  // Philosophers by era, again as spans of birth years.
  medphil: [10, bornBetween(PHILOSOPHER, 400, 1450)],
  earlyphil: [15, bornBetween(PHILOSOPHER, 1550, 1770)],
  phil19: [15, bornBetween(PHILOSOPHER, 1770, 1870)],
  philbranch: [5, a('Q22811234')],

  // ---- religion and mythology
  greekgod: [2, aKindOf('Q22989102')],
  romangod: [1, aKindOf('Q11688446')],
  egyptgod: [1, aKindOf('Q146083')],
  norse: [1, aKindOf('Q16513881')],
  religion: [20, aKindOf('Q9174')],
  scripture: [15, aKindOf('Q179461')],
  hindu: [3, aKindOf('Q979507')],
  greekmyth: [15, a('Q22988604')],
  bibleperson: [12, a('Q20643955')],
  creature: [10, any(sub('Q2239243'), a('Q2239243'))], // kinds of creature, not every named giant, demon and titan
  aztec: [2, aKindOf('Q32066628')],
  parable: [1, a('Q51632')],
  holyday: [15, any(aKindOf('Q375011'), aKindOf('Q60075825'))],
  mahabharata: [3, '?item wdt:P1441 wd:Q8276 .'],

  // ---- politics and law
  ukpm: [1, held('Q14211')],
  scotus: [1, held('Q11144', 'Q11147')],
  igo: [15, aKindOf('Q245065')],
  government: [10, kind('Q1307214')],
  scotuscase: [3, a('Q19692072')],
  ideology: [15, kind('Q12909644')],
  legislature: [15, aKindOf('Q11204')],

  // ---- economics
  currency: [1, '?state wdt:P31 wd:Q3624078 ; wdt:P38 ?item .'], // the currency of a sovereign state
  nobelecon: [1, won('Q47170')],
  sp500: [1, '?item wdt:P361 wd:Q242345 .'],
  exchange: [8, a('Q11691')],
  centralbank: [3, a('Q66344')],
  tax: [5, '?item wdt:P279+ wd:Q8161 .'],
  index: [3, aKindOf('Q223371')],
  crisis: [8, '{ ?item wdt:P31/wdt:P279* wd:Q114380 . } UNION { ?item wdt:P31/wdt:P279* wd:Q1020018 . } UNION { ?item wdt:P31/wdt:P279* wd:Q207781 . }'],
  econschool: [3, a('Q3048444')],
  bank: [12, a('Q22687')],
  coin: [5, any(sub('Q41207'), a('Q113813711'))],

  // ---- academia
  ology: [5, '{ ?item wdt:P31/wdt:P279* wd:Q11862829 . } UNION { ?item wdt:P31/wdt:P279* wd:Q2465832 . } ?item rdfs:label ?name . FILTER(LANG(?name) = "en" && STRENDS(LCASE(?name), "ology"))'],
  olduni: [3, '?item wdt:P31/wdt:P279* wd:Q3918 ; wdt:P571 ?founded . FILTER(YEAR(?founded) < 1500)'],
  journal: [6, '{ ?item wdt:P31 wd:Q5633421 . } UNION { ?item wdt:P31 wd:Q737498 . }'], // scientific or academic journal
  ukuni: [8, '?item wdt:P31/wdt:P279* wd:Q3918 ; wdt:P17 wd:Q145 .'],
  prize: [10, aKindOf('Q11448906')],
  library: [20, aKindOf('Q7075')],
  society: [15, any(aKindOf('Q955824'), aKindOf('Q414147'))],
};

// Queries that can share one request. Empty for now: combining even light
// queries made the service time out, so every category is fetched alone.
const BATCHES = {};

const SELECT = '?item ?label ?links ?title ?desc (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts)';
const DETAILS = `?item wikibase:sitelinks ?links .
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title . }
  OPTIONAL { ?item rdfs:label ?label . FILTER(LANG(?label) = "en") }
  OPTIONAL { ?item schema:description ?desc . FILTER(LANG(?desc) = "en") }
  OPTIONAL { ?item skos:altLabel ?alt . FILTER(LANG(?alt) = "en") }`;
const members = (id) => {
  const [links, pattern] = SOURCES[id];
  return `SELECT DISTINCT ?item WHERE { ${pattern} ?item wikibase:sitelinks ?n . FILTER(?n >= ${links}) }`;
};

// Members first, then their names, aliases, description and link count.
function query(id) {
  return `SELECT ${SELECT} WHERE {
  { ${members(id)} }
  ${DETAILS}
} GROUP BY ?item ?label ?links ?title ?desc`;
}

function batchQuery(name) {
  const parts = BATCHES[name].map((id) => `{ { ${members(id)} } BIND("${id}" AS ?cat) }`);
  return `SELECT ?cat ${SELECT} WHERE {
  ${parts.join('\n  UNION\n  ')}
  ${DETAILS}
} GROUP BY ?cat ?item ?label ?links ?title ?desc`;
}

const batched = new Set(Object.values(BATCHES).flat());
const SINGLES = Object.keys(SOURCES).filter((id) => !batched.has(id));

module.exports = { SOURCES, BATCHES, SINGLES, query, batchQuery };
