/*
 * Turn the raw sets in tools/cache/ into js/data-tails.js, the deep
 * catalogues that sit behind each hand-ranked list.
 *
 *   node tools/build-tails.js            build and print a summary
 *   node tools/build-tails.js --sample   also print sample answers per category
 *   node tools/build-tails.js --missing  also print listed answers Wikidata lacks
 *
 * For every category:
 *   1. clean each Wikidata item into a display name plus aliases
 *   2. fold anything the hand-ranked list already has into that list
 *      (keeping its extra names: "Dnipro" for the Dnieper)
 *   3. order the rest by how many language editions of Wikipedia cover it,
 *      which stands in for how familiar it is
 *   4. split it: items at least as widely covered as the lower end of the
 *      hand-ranked list are "rare" (60 points), the long remainder is "deep"
 *      (85), and the least-covered item with an article of its own is the
 *      "gem" (100) unless the list marks one itself
 */
const fs = require('fs');
const path = require('path');
const { CACHE } = require('./wdqs.js');
const { SOURCES } = require('./sources.js');

// The engine is loaded without data-tails.js, so every list is seen bare.
for (const f of ['data-lists', 'data-geo', 'data-elements', 'engine']) require(`../js/${f}.js`);
const O = globalThis.GAME;

const OUT = path.join(__dirname, '..', 'js', 'data-tails.js');
const RARE_CAP = 300; // most a category may have in the 60-point tier
const RARE_FLOOR = 0.06; // ...and the least, as a share of the deep catalogue
const MIN_TAIL = 10; // fewer further answers than this and the list is complete as written
const MAX_ALIASES = 5;
const MAX_ALSO = 6; // extra names added to a hand-ranked answer

/*
 * Wikidata's classes are broader than the questions. Frederick the Great is
 * a "composer" (he composed), a microphone is filed under musical
 * instruments, a currency class holds every token and trading company. Each
 * set is trimmed back to what its prompt means:
 *   want      the item's one-line description must match
 *   drop      ...and must not match this
 *   dropName  nor may its name match this
 *   name      its name must match
 *   either    [name, description]: one of the two must match
 *   strip     taken off every name ("433 Eros" -> "Eros", "Tampa, Florida" -> "Tampa")
 */
const PAINTER = { want: /painter|artist|fresco|miniaturist|illuminator|draughtsman|engraver|printmaker/i };
const COMPOSER = { want: /compos/i };
const PHILOSOPHER = { want: /philosoph/i };
// "Ancient Greek" is also the language of Byzantine and modern scholars, so the description has to place the person.
const NOT_ANCIENT = /\b1[0-9]{3}\b|german|english|french|italian|dutch|british|american|russian|spanish|polish|danish|swedish|byzantine|modern|christian|bishop|saint|theologian|church father|jewish|arab|persian|muslim|renaissance|humanist/i;
const GOD = { want: /\bgods?\b|goddess|deity|deities|titan|personification|spirit|muse\b|primordial|divinit|daimon|numen|æsir|aesir|vanir|ásynj/i, drop: /hero\b|king of|queen of|prince|princess|mortal|pharaoh|vizier|architect|priest/i };
const NOT_A_LIST = /^(list|lists|outline|index|timeline|history|glossary|category|template) of\b/i;
// Nothing invented counts, except where the category is itself fiction.
const FICTION = /fictional|fictitious|character (in|from|of)|video game|comic|manga|anime|television|tv series|film series/i;
const FICTION_IS_FINE = new Set(['shakeschar', 'homerchar', 'epic', 'aesop', 'opera', 'ballet', 'greekgod', 'romangod', 'egyptgod', 'norse', 'dickens', 'arthur', 'greekmyth', 'hindu', 'genre', 'painting', 'thoughtexp', 'paradox', 'grimm', 'andersen', 'poe', 'novel19', 'creature', 'aztec', 'mahabharata', 'sculpture', 'vangogh']);
const FILTERS = {
  // ---- sciences
  particle: { want: /particle|boson|fermion|quark|lepton|meson|baryon|hadron|neutrino|electron|nucleon/i },
  unit: { want: /\bunit\b|\bunits\b|measure/i, drop: /military|army|regiment|organi[sz]ation|currency|coin|numismatic|administrative|territorial|period|era\b/i, dropName: /^(unit|units) of|\bunits?$|^(SI|metric|imperial) /i },
  alloy: { want: /alloy|steel|bronze|brass|\biron\b|amalgam|solder/i, drop: /phase|microstructure|structure|company|brand name of a company/i },
  moon: { want: /moon|satellite/i, dropName: /^(S|R)\/\d|moons? of|satellites? of|^natural satellite|^moon$|^irregular|^regular|^inner|^outer|group$|moonlet/i, drop: /hypothetical|list|group of|category|crater|artificial/i },
  rock: { want: /rock|stone|lava|sediment|igneous|metamorphic|volcanic|coal|tuff|clay|shale/i, drop: /concrete|artificial|building material|meteorite|gemstone|formation in|rock formation|sculpture|monument|band|music/i },
  plate: { want: /plate/i },
  current: { want: /current|drift|gyre/i },
  bone: { want: /bone|vertebra|ossicle|skull|cranium/i, drop: /fossil|specimen|food|material|tissue|ivory|disease|fracture|tumou?r/i, dropName: / as food$/i },
  muscle: { want: /muscle/i, drop: /disease|disorder|tissue|group of|fib(er|re)/i },
  hormone: { drop: /medication|drug|analog|brand|pharmaceutical|class of|group of|therapy|receptor|gene\b|disease|disorder/i, dropName: /^insulin ./i },
  specialty: { want: /special|medicine|medical|branch|field|study|disciplin|surgery|science/i, drop: /procedure|journal|organi[sz]ation|society|hospital/i },
  dinosaur: { want: /dinosaur|sauropod|theropod|ornithopod|ornithischian|saurischian|ceratops|ankylosaur|stegosaur|hadrosaur|reptile/i, drop: /oogenus|ootaxon|ichno|\begg|footprint|\bbird|aves/i },
  primate: { dropName: /^homo\b|neanderthal|denisovan|^human/i, drop: /hoax|monkey named|individual/i },
  conifer: { dropName: /^(welwitschia|ephedra|gnetum|ginkgo|cycas|zamia|encephalartos|macrozamia|dioon|ceratozamia|stangeria|bowenia|lepidozamia|microcycas|cycad)/i, drop: /cycad|gnetophyte|ginkgo/i },
  theorem: { drop: /film|episode|novel|album/i },
  fallacy: { want: /fallac|argument|reasoning|rhetoric|logic|error|bias|tactic|infer|propaganda/i, drop: /sex|erotic|porn|race\b|ethnic|people/i },
  ology: { dropName: /technology$|^(ideology|mythology|terminology|methodology|chronology|anthology|trilogy|apology|analogy|tautology|phraseology|doxology|eulogy|genealogy)$/i },
  // ---- technology
  proglang: { want: /language/i, drop: /company|markup|style ?sheet|file format|query language for|natural language|spoken/i },
  os: { want: /operating system|distribution|distro|linux|unix|kernel|firmware|\bos\b|platform|bsd/i, drop: /company|video game|magazine/i },
  rocket: { want: /rocket|launch vehicle|launcher|launch system|booster|carrier/i, dropName: /^space shuttle ./i, drop: /orbiter|company|engine|missile system/i },
  spacetelescope: { want: /telescope|observatory|satellite|mission|explorer|spacecraft|probe/i },
  cipher: { want: /cipher|encryption|cryptograph|cryptosystem|algorithm|code|machine/i, drop: /protocol|company|film|novel/i },
  // ---- history
  empire: { want: /empire|state|country|kingdom|monarchy|realm|caliphate|sultanate|dynasty|polity/i, drop: /video game|film|novel|star wars|star trek|company|album|band/i, dropName: /^(colonial|british|french) (empire|colonies)$/i },
  treaty: { want: /treaty|agreement|convention|pact|accord|protocol|peace|charter|concordat|armistice|covenant|truce/i, drop: /conference|summit|organi[sz]ation|film|novel|episode/i },
  romanprovince: { want: /province/i },
  greekphilosopher: {
    want: /philosoph|sophist|stoic|cynic|platonist|pythagorean|epicurean|peripatetic|scepti|skepti/i,
    drop: /roman (emperor|statesman|senator|orator|consul)|statesman|\b1[0-9]{3}\b|german|english|french|italian|dutch|british|american|russian|spanish|byzantine|modern|christian|bishop|saint|theologian|church father|jewish|arab|persian|muslim/i,
  },
  greekgod: GOD,
  romangod: GOD,
  egyptgod: GOD,
  norse: GOD,
  // ---- geography
  frdept: { want: /department/i, drop: /former|ancien|defunct|abolished|historical|\b1[789]\d\d\b/i },
  rusubject: { want: /federal subject|oblast|republic|krai|okrug|federal city|region of russia/i, dropName: /donetsk|luhansk|lugansk|crimea|sevastopol|kherson|zaporizh|zaporozh/i, drop: /former|until|abolished|defunct|merged|kazakhstan/i },
  longriver: { want: /river|tributary|stream/i },
  biglake: { want: /lake|lagoon|reservoir|\bsea\b/i, dropName: /^dead sea$/i, drop: /salt flat|salt pan|subglacial|dry lake|former lake|prehistoric|ancient lake/i },
  range: { want: /range|mountains|massif|chain|cordillera|sierra|highlands|\bhills\b/i, drop: /underwater|submarine|ridge on|on mars|on the moon|lunar|on venus/i },
  desert: { want: /desert|\berg\b|dune/i },
  sea: { want: /\bsea\b|\bseas\b/i, dropName: /^(?!.*\bsea\b)/i },
  strait: { want: /strait|channel|passage|sound\b/i },
  peninsula: { want: /peninsula|headland|\bcape\b|\bspit\b|promontory/i },
  officiallang: { want: /language|creole/i, drop: /sign language|language family|group of|dialect continuum|writing system|script|family of/i, dropName: /languages$|sign language/i },
  script: { want: /script|alphabet|writing system|abjad|abugida|syllabary|logograph|hieroglyph/i, drop: /numeral|radical|code|phonetic|shorthand|unicode|romani[sz]ation|notation|typeface|font|keyboard|encoding|transliteration|orthography|spelling|braille pattern|letter of/i, dropName: /^radical \d+|numerals?$|unicode|keyboard|^iso |romani[sz]ation|notation|transcription|transliteration|^leet$|^writing system$/i },
  langfamily: { want: /language family|family of|languages|branch|group of|subgroup|subfamily|language group/i, drop: /proposed|hypothetical|fictional|constructed|sign language/i, dropName: /language$|^(sign|constructed|unclassified|mixed|creole|pidgin|isolate)/i },
  // ---- literature
  shakeschar: { want: /character|protagonist|role\b|fairy|personage/i, drop: /film|actor|actress|play by/i },
  homerchar: { drop: /poem|epic by|film|novel|book of/i },
  epic: { want: /poem|epic|epos|poetry|saga|\bsong\b|ballad/i, drop: /\bpoet\b|writer|film|album|video game|television|opera|comic|manga|novel|\bband\b|genre|type of/i },
  aesop: { dropName: /^aesop|fables?$/i, drop: /collection|edition|translation|version|book|film|album|anthology/i },
  figure: { drop: /film|album|novel|journal|debat/i, dropName: /^(figure of speech|rhetorical device|stylistic device|literary device|trope|scheme|dilemma|ambiguity)$/i },
  litmovement: { drop: /film|album|magazine|journal|publisher|award|festival/i },
  // ---- arts
  artmovement: { want: /movement|\bstyle\b|school|group of|network of|avant-garde/i, drop: /genre|music|literary|literature|poetry|hip.hop|dance|comedy|film|theat(er|re)|humou?r|satire|vocal|lifestyle|tendency|pop culture|fashion|political|religio/i },
  renpainter: PAINTER,
  impressionist: PAINTER,
  dutchpainter: PAINTER,
  baroque: COMPOSER,
  classical: COMPOSER,
  romantic: COMPOSER,
  opera: { want: /opera|singspiel|operetta|music drama|dramma|zarzuela/i, drop: /film|album|company|house|singer|festival|television|production of|recording/i },
  ballet: { want: /ballet/i, drop: /film|album|company|school|dancer|television|production of|opera by|competition|festival/i },
  instrument: {
    want: /instrument|drum|flute|lute\b|harp|guitar|violin|fiddle|\bhorn\b|zither|bagpipe|gong|xylophone|piano|\borgan\b|trumpet|rattle|whistle|\bbell\b|cymbal|accordion|harmonica|clarinet|oboe|saxophone|trombone|tuba|banjo|mandolin/i,
    drop: /voice|singer|vocal|loudspeaker|microphone|amplifier|software|company|brand|manufacturer|model of|guitar model|toy\b|recording|playback|device that|type of musical instruments|class of|family of|classification|category|part of|component/i,
    dropName: /\binstruments?$|\bfamily$|phones?$|^string$|^(fender|gibson|yamaha|roland|korg|moog|ibanez|epiphone|rickenbacker) |\d{2,}/i,
  },
  archstyle: { want: /architectural style|style of architecture|\bstyle\b|\border\b|architecture (of|in|from|that)|architectural (movement|tradition)/i, drop: /architect \(|firm|company|award|magazine|building type|type of (building|church|house)|construction (method|technique)|prison|method of/i },
  // ---- economics and society
  currency: { drop: /cryptocurrenc|digital|token|commemorative|company|subdivision|subunit/i },
  exchange: { want: /exchange|bourse|börse|bolsa|borsa/i, drop: /commodit|futures|cryptocurrenc|bank\b|index/i },
  centralbank: { want: /central bank|monetary authority|reserve bank|national bank|bank of issue/i, drop: /commercial bank|former|defunct|building|headquarters/i },
  tax: { want: /\btax|duty|levy|tariff|\btoll\b|tribute|tithe/i, dropName: /bracket|cut\b|rate\b|haven|evasion|avoidance|return|law|policy|reform|credit|deduction|exemption|incidence|revenue|stamp$|franking|taxation|^tax$|^duty$|^(direct|indirect) tax$/i, drop: /form\b|document|agency|office|authority/i },
  igo: { dropName: /^european (commission|council|parliament)|of the european union|free trade agreement$/i, want: /organi[sz]ation|union|alliance|\bbloc\b|community|forum|agency|\bbank\b|\bfund\b|\bcourt\b|council|league|commonwealth|association|group of/i, drop: /non-governmental|sport|of the european union|institution|parliament|political party|military unit|fictional|executive|agency of/i },
  government: {
    want: /form of government|system of government|political system|rule by|government (in|by|where|with)|type of (state|government|monarchy|republic|democracy|regime)|political regime|form of state|system in which|form of (democracy|monarchy|republic|rule)/i,
    drop: /\b\d{4}\b|sovereign state|country in|former country|territory|colony of|protectorate of/i,
  },
  philmovement: { want: /philosoph/i, drop: /journal|book|society|association|martial|karate|religious movement|sect\b|denomination/i },
  // ---- physics and chemistry
  meter: {
    either: [/(meter|metre|gauge|graph)$/i, /measur/i],
    drop: /telescope|smartwatch|watch model|fitness|activity tracker|brand|series of|manufactur|company|satellite|mission|observatory|clock tower|located in|software|\bapp\b|video game|toy\b/i,
    dropName: /telescope|band \d|\bgear\b|watch\b|big ben|^sensor$|^calculator$|^microphone$|^radar$|spinning top|antikythera|^measuring instrument$|measurement of|\btest$|alpha magnetic/i,
  },
  scilaw: { name: /\blaws?\b|principle|\brule\b/i, drop: /film|album|novel|legislation|statute|act of (parliament|congress)/i },
  probe: { drop: /conceptual|proposal|proposed|cancell?ed|design study|fictional/i },
  // ---- earth science
  cloud: { dropName: /waves?$|^cloud$|\bsky$|^mushroom/i },
  impact: { want: /impact|crater|astrobleme|meteor/i, drop: /lunar|\bmoon\b|\bmars\b|martian|mercury|venus/i },
  landform: {
    drop: /country|sovereign|artificial|man-made|human-made|constructed|infrastructure|structure built|facility|settlement|runoff|administrative|region in|area in|ice floating/i,
    dropName: /^(port|island country|ring of fire|reservoir|seawall|urban runoff|polder|drainage basin|drift ice|roji|mittelgebirge|landform|moat|backyard|sea ice|ditch)$|martian|islands$/i,
  },
  // ---- life science
  cellpart: { dropName: /^chromosome \d|^seminal|^(x|y|sex|b|homologous|circular) chromosome|artificial chromosome|^organelle$/i, drop: /gland|artificial|synthetic|drug delivery/i },
  // ---- mathematics
  mathbranch: { drop: /journal|book|society|conference|award/i },
  conjecture: { name: /conjecture|hypothesis|problem|question/i },
  curve: {
    name: /\b(curve|spiral|conic|helix|lemniscate|conchoid|cissoid|folium|quadratrix|trisectrix|oval)\b|oid$|cycle$|trix$/i,
    drop: /meridian|parallel|latitude|longitude|geograph|chemi|polygon|album|film|song|road|railway|company|econom|financ|h(a)?emoglobin|cryptograph|physiolog|pharmac|statistic/i,
    dropName: /^(curve|plane curve|space curve|algebraic curve)$|\d{3}|trapezoid|light curve|rotation curve|timelike|cooling|^j curve|indicatrix|laffer|demand|supply|lorenz|engel|beveridge|phillips|yield|learning|growth|kuznets|indifference/i,
  },
  // ---- medicine and psychology
  infection: {
    want: /infect|virus|viral|bacteri|parasit|fung|contagious|plague|fever|pox|worm|protozoa|mycosis|zoono|pandemic|epidemic|transmitted|caused by|pathogen|helminth/i,
    dropName: /^(zoonosis|sepsis|sexually transmitted infection|infection|opportunistic infection|infectious disease|viral disease|bacterial disease)$|noble rot|mildew/i,
  },
  phobia: { name: /phobia$|^fear of/i },
  disorder: {
    want: /disorder|illness|syndrome|psychiatric|mental (condition|health condition|disease)|delusion|addiction|phobia|psychosis|paraphilia|dependence|personality/i,
    drop: /symptom|sign of|\borgan\b|anatom|emotion|feeling|reflex|phenomenon|sensation|muscular|genetic|chromosom|neurodegenerative|inherited|hereditary|neuromuscular|neurological disorder|speech disorder|sleep disorder|film|album/i,
    dropName: /^(mental disorder|insanity|neurosis|hysteria|melancholia|madness)$/i,
  },
  brain: { dropName: /^(nucleus|gyrus|sulcus|lobe|brain|human brain)$|plaques|sinus$|^lobes of|bodies$/i, drop: /disease|disorder|tumou?r|syndrome|fictional|artery|vein|nerve\b|bone|skull|meninges|membrane/i },
  // ---- technology and engineering
  algorithm: {
    want: /algorithm|method (for|of|to)|sorting|search|procedure|heuristic|technique (for|used)|scheme for|primality|compression|transform/i,
    drop: /cryptocurrenc|currency|file format|audio format|blockchain|company|website|language model|software|protocol|standard for|literary|rhetoric|figure of speech|philosoph|cipher|encryption|cryptograph|data structure|profiles/i,
    dropName: /^(mp3|regular expression|sorting algorithm|digital signature|cipher|interpolation|algorithm)$|tree$|parser$/i,
  },
  datastructure: {
    want: /data structure|data type|tree\b|heap|queue|list\b|array|hash|container|trie|graph\b|buffer|table/i,
    drop: /cryptocurrenc|file format|image format|linear algebra|mathemat|matrix (in|with|whose|of|that)|protocol|\bweb\b|standard|distributed ledger/i,
    dropName: /matrix$|matrices$|^(bitcoin|blockchain)|flag$|block$|latin square|cayley table|random number table|system image|kademlia|pythagorean/i,
  },
  bridge: { either: [/bridge|viaduct|aqueduct|causeway|\bpont\b|\bponte\b|\bmost\b|brücke|puente/i, /bridge|viaduct|aqueduct|causeway/i], drop: /power station|hydroelectric|\bdam\b|film|novel|card game/i },
  npp: { drop: /proposed|cancell?ed|planned|unbuilt|never built/i },
  // ---- history
  war: { drop: /hypothetical|fictional|future|theat(er|re) of|front of|air ?strikes?|protest/i, dropName: /^world war iii|front$|arab spring|strikes? on|theat(er|re)|\boperation\b/i },
  revolution: { name: /revolution|spring\b/i, drop: /film|album|novel|political party|organi[sz]ation|newspaper|video game/i },
  period: {
    name: /\b(period|era|age|ages|epoch|restoration|renaissance|antiquity|enlightenment|reformation|interregnum|regency|prehistory|\w+lithic|pax|belle|thaw|years|decade|twenties|sixties|times|transition)\b/i,
    drop: /film|album|novel|video game|\bband\b/i,
    dropName: /^\d|century|millennium/i,
  },
  explorer: {
    want: /explor|navigat|conquistador|voyag|discover|mountaineer|seafarer|circumnavig|cartograph|travell?er|adventurer|mariner|sailor/i,
    drop: /astronaut|cosmonaut|film director|filmmaker|president of|fictional/i,
    dropName: /autobiography|^the /i,
  },
  ww1battle: { drop: /film|video game/i },
  uscwbattle: { dropName: /cowpens/i, drop: /film|video game/i },
  // ---- geography
  archipelago: {
    drop: /sovereign state|country in|island country|republic|kingdom in|artificial|national park|nature reserve|subregion|municipality|province of|\bstate of|department of|territory of|collectivity|commune/i,
    dropName: /^(caribbean|polynesia|micronesia|melanesia|oceania|west indies|archipelago|jamaica|rügen|ring of fire)$|national park/i,
  },
  waterfall: { dropName: /river$|rapids?$|^waterfall$/i, drop: /\bdam\b|power station/i },
  gulf: { name: /\b(bay|gulf|bight|baie|golfo|bahía|baía|bucht|golfe)\b/i, drop: /city|town|village|suburb|neighbou?rhood|municipality|census|district|county/i },
  // ---- language
  deadlang: { want: /language|dialect|tongue/i, drop: /language family|family of|script|writing system|group of/i, dropName: /languages$/i },
  // ---- literature
  genre: {
    want: /genre|literary|literature|poetry|poem|fiction|narrative|novel|prose|verse|drama|story|stories|tale|writing/i,
    dropName: /^(theology|atlas|criticism|literary criticism|religious text|textbook|comics|cookbook|letter|joke|encyclopedia|dictionary|manga|anime|light novel|visual novel|literary genre|literature)$/i,
    drop: /journal|magazine|award|publisher|video game|film genre|television|music genre/i,
  },
  dickens: { want: /character|fictional|protagonist|villain|antagonist|personage/i },
  arthur: {
    want: /character|knight|king|queen|figure|legend|wizard|sorcer|fairy|giant|lady|squire|person|hero|maiden|enchantress/i,
    drop: /place|castle|kingdom of|land in|\btable\b|sword|location|realm|\bcity\b|forest|island|film|series|comic/i,
    dropName: /round table|^logres|joyous gard|bedegraine|^benoic|faerie knight|shining knight/i,
  },
  // ---- art and architecture
  museum: {
    name: /museum|gallery|galleria|museo|musée|pinacot|kunst|collection|glyptot|institute|foundation|academy|museu|muzeum|galerie|muzej|art cent(er|re)|cloisters/i,
    drop: /library|archaeological site|palace of|\btomb\b/i,
  },
  painting: { drop: /series of|fresco cycle|photograph|sculpture|film|album/i },
  cathedral: { either: [/cathedral|minster|duomo|\bdom\b/i, /cathedral/i], dropName: /mosque|abbey|monastery|holy sepulchre/i },
  // ---- music and theatre
  operahouse: { drop: /company|troupe|festival|film/i },
  anthem: { dropName: /^preamble$|stanza|toque de bandera|^national anthem$/i },
  // ---- philosophy
  paradox: { drop: /film|album|novel|episode|video game|\bband\b/i, dropName: /^paradox$/i },
  thoughtexp: { drop: /film|album|novel|megastructure|proposed dam/i, dropName: /^(social contract|dyson sphere|alderson disk|northern european enclosure dam|spoon theory|thought experiment)$/i },
  // ---- religion and mythology
  religion: {
    want: /religion|religious (movement|tradition|group|denomination|community)|faith|denomination|\bsect\b|branch of|school of|belief system|spiritual (movement|tradition)|new religious movement|church\b|christian (movement|tradition)/i,
    drop: /church (building|in)|apparition|\bbook\b|\btext\b|concept|doctrine|practice|ritual|state of|festival|title|temple|shrine|cathedral|mythology|religion in|religion of the|history of/i,
    dropName: /^our lady|^church of saint|religions$|^religion( in| of|$)|cross$/i,
  },
  scripture: {
    drop: /hymn|carol|parable|\bsong\b|prayer|canticle|verse|chapter|passage|pericope|christmas|miracle|sermon|commandment|creed|translation of|edition|manuscript|codex|film|album/i,
    dropName: /^parable of|commandments|^gospel$|^religious text$/i,
  },
  hindu: { want: /deity|\bgods?\b|goddess|avatar|form of|incarnation|\bdevi\b|\bdeva\b|aspect|consort|manifestation|divine|personification/i, drop: /demon|asura|\bsage\b|rishi|king of|temple|festival|film|television|weapon/i, dropName: /forms of|chakra$/i },
  greekmyth: { drop: /\bgods?\b|goddess|\bmuses?\b|deity|\btitan\b|titaness|nymph|personification|oceanid|nereid|naiad|primordial|film|video game|comic/i },
  bibleperson: { drop: /film|television|novel/i },
  // ---- politics and law
  ideology: { name: /ism\b|democracy$|politics$|third way/i, drop: /political party|organi[sz]ation|militant group|album|film|\bband\b/i },
  // ---- economics
  crisis: { name: /crisis|crash|bubble|panic|mania|squeeze|depression|recession|turbulence|collapse|hyperinflation/i },
  econschool: { dropName: /^cambridge circus$/i },
  // ---- academia
  olduni: { dropName: /abbey|gunma|lorestan|isfahan|medical sciences|cathedral school|georgianum|hunan/i, drop: /abbey|monastery/i },
  journal: {
    want: /journal|periodical|proceedings|review|transactions|letters|annals|bulletin|scientific|academic|peer/i,
    drop: /newspaper|magazine|trade|daily|gazette|database|abstracting|indexing|government|predatory|encyclopedia|popular science|amateur/i,
    dropName: /^(the wall street journal|national geographic|the world factbook|federal register|music week|mathematical reviews|zbmath)|encyclopedia|sky & telescope/i,
  },

  // ======================================================== added for the 300
  // ---- physics and chemistry
  constant: { dropName: /^(light-year|electronvolt|standard atmosphere|astronomical unit|parsec|avogadro number)$/i },
  physbranch: { drop: /journal|book|society|conference|award/i },
  labware: { drop: /company|brand|manufactur|kitchen|household|appliance|surgical|cooking|agar|growth medium|culture medium|sewage|waste|compost|space station|experiment on/i, dropName: /^(laboratory equipment|laboratory glassware|hair dryer|refrigerator|freezer|oven|glassware|suribachi)$/i },
  // ---- astronomy and space
  star: { drop: /supernova|planetary system|asterism|quasar|black hole|gamma-ray burst|star cluster|hypothetical|biblical|tradition|legend|astrolog/i, dropName: /^(NGC|IC|PGC|UGC|SN|3C|GRB|M) ?\d|bethlehem/i },
  galaxy: { drop: /cluster of galaxies|galaxy cluster|galaxy group|group of galaxies|supercluster/i, dropName: /cluster$|group$|supercluster/i },
  nebula: { dropName: /^(heliosphere|nebula|interstellar cloud)$/i },
  asteroid: { strip: /^\d+ (?=\p{L}[^0-9]*$)/u, dropName: /^\d{4} [A-Z]{1,2}\d*$|meteor/i },
  spaceagency: { drop: /company|mission|military unit|launch site|spaceport|rocket/i },
  meteorshower: { dropName: /^(meteor|radiant|meteor shower|meteoroid)$|procession|event$/i },
  observatory: { either: [/observator|telescope|\barray\b|sternwarte|interferometer|jantar mantar|uraniborg|stjerneborg/i, /observatory/i], drop: /space probe|research station|polar station|university in|academy in|tower in/i, dropName: /probe$|station$|tower$|academy$/i },
  startype: { dropName: /black hole|supernova|^nova$|hypernova|kilonova|^star$|^(north|south|pole) star$|collapsar|gamma-ray burst|track$|stellar classification|^stars$|stellar population|compact object|magnificent seven|pulsation|kugelblitz/i, drop: /black hole|explosion|region of|diagram/i },
  // ---- earth science
  wind: {
    dropName: /typhoon|hurricane|cyclone|storm|tornado|\b\d{4}\b|depression|derecho|blizzard|circulation|el niño|la niña|^winds?$|oscillation|vortex|front$|^(wind power|wind turbine|wind direction|wind speed|wind chill)|^(thermal|cold drop|atmospheric river|convergence|vertical draft|headwind|tailwind|crosswind|wind gust|downburst|squall line|rear-inflow jet)$|cell$|compass winds/i,
    drop: /tropical cyclone|typhoon|hurricane|pacific typhoon season|atlantic hurricane|weather event|film|album|novel|company/i,
  },
  glacier: { name: /glacier|jökull|ice (shelf|sheet|cap|field|stream|tongue|rumples)|icefield|breen|gletscher|ferner|\bkees\b|fonna|svartisen|glaciar|ghiacciaio|mer de glace/i },
  biome: { dropName: /^(biome|ecosystem|vegetation|windbreak|microbiome)$|microbio|park$|farm$|^state forest$/i, drop: /association|alliance|phytosociolog|syntaxon|plant community in|protected area|park in|microb|microorganism|plantation|planted|managed|root/i },
  cave: { drop: /film|album|novel/i },
  // ---- life science
  pterosaur: { drop: /ichno|footprint/i },
  deer: { dropName: /^deer$/i },
  turtle: { dropName: /^(tortoise|turtle)$/i },
  phylum: { drop: /obsolete|rejected|nomen/i },
  // ---- mathematics
  greekmath: { want: /mathematic|geomet|astronom|philosoph|engineer|scientist|polymath|inventor|geograph/i, drop: NOT_ANCIENT },
  distribution: { name: /distribution|law$/i, dropName: /^(probability distribution|.*family of.*)$/i },
  numeral: { dropName: /^(numeral system|positional notation|scientific notation|notation|numerical digit|engineering notation)$/i },
  numbertype: {
    name: /numbers?$|integers?$|primes?$|^fraction$|quaternion|octonion|^(integer|decimal)$/i,
    drop: /physical quantity|quantity|chemi|unit of|identifier|code\b|statistic|econom|demograph|telephone|financ|account|fluid|dimensionless|physics|nuclear|atom|spectroscop|sport|music|song|film|album|ratio of|optic|engineering|registration|postal/i,
    dropName: /^(number|numbers|serial number|house number|page number|track number|opus number|telephone number|.* quantum number|quantum number|wavenumber|wave number|largest known prime number|large numbers|baryon number|lepton number|skewes's number)$/i,
  },
  equation: { name: /equations?$|formula$|law$|identity$|relation$/i, dropName: /^equation$/i },
  // ---- medicine
  antibiotic: { dropName: /antibiotics?$|^(antiviral drug|antifungal|antimicrobial)|inhibitors?$|^draco$|^management of/i, drop: /antiviral|antifungal|antineoplastic|chemotherap|anticancer|cancer/i },
  cancer: { name: /cancer|carcinoma|sarcoma|oma$|omas$|leuk(a)?emia|tumou?r|neoplasm|lymphoma|myeloma/i, dropName: /^(cancer|neoplasm|tumou?r|malignant neoplasm)$|^alcohol and|^(haematoma|hematoma|glaucoma|trachoma|coma|stoma|granuloma|atheroma|xanthoma|keloid)/i },
  artery: { name: /arter|aort|trunk|circle of willis|\barch\b|branch/i, dropName: /^(artery|arteriole|metarteriole)$/i },
  nerve: { name: /nerv|plexus|chorda|ganglion/i, dropName: /^(nerve|peripheral nerve|nervous system|.* nervous system)$/i },
  // ---- technology and engineering
  dam: { either: [/\bdam\b|barrage|dike|dijk|weir/i, /\bdam\b|barrage/i], drop: /causeway|bridge|town\b|village|municipality|windmills/i },
  canal: { either: [/canal|kanal|seaway|waterway|naviglio|gracht/i, /canal|waterway/i], drop: /river in|street|neighbou?rhood|district|aqueduct in/i },
  protocol: { drop: /cryptocurrenc|blockchain|company|video game|web browser|operating system|digital currency|payment system|social network|messaging (service|app)|website|web service|video ?(tele)?conferenc|database|connector|graphics|display interface|audio\/video interface|currency|ledger/i, dropName: /^google |^microsoft |^apple |^(bitcoin|samba)$|ledger|autonomous organization/i },
  shiptype: { dropName: /^(ship|boat|watercraft|vessel|ship type)$/i },
  component: {
    want: /component|diode|transistor|capacitor|resistor|inductor|semiconductor device|switch|sensor|\btube\b|circuit|transducer|relay|oscillator|amplifier|filter|rectifier|electrode|thyristor|electronic device|electrical device/i,
    drop: /computer|standard|interface|\bbus\b|storage|\bdisk\b|platform|ethernet|network|lamp|light source|headphone|plug|socket|cable|microprocessor|chipset|system on a chip|graphics|brand|manufactur|company|product line|series of|family of|microarchitecture|codename|radar|tower|mast/i,
    dropName: /^(intel|amd|apple|pentium|geforce|radeon|socket|qualcomm|snapdragon|exynos|core |ryzen|athlon|celeron|xeon|power\d|mips |arm |motorola|zilog|usb|arduino|electronic component)|\d{3,}|\blake$/i,
  },
  // ---- history
  siege: { drop: /film|video game|novel|album/i },
  navalbattle: { drop: /film|video game|novel/i, dropName: /evacuation/i },
  operation: { name: /^(operation|case|unternehmen) /i, drop: /film|video game/i },
  rebellion: {
    name: /rebellion|revolt|uprising|rising|mutiny|insurrection|putsch|commune|riots?$|jacquerie|fronde|peasants' war/i,
    drop: /film|album|novel|video game/i,
    dropName: /^(rebellion|revolt|uprising|mutiny|insurrection)$/i,
  },
  calendar: {
    name: /calendar|^(haab|tzolk)/i,
    dropName: /^calendar$|calendar (year|date|era|reform|day|month)$|^(advent|wall|desk|perpetual|pin-up|economic|liturgical) calendar|^calendar of saints/i,
    drop: /software|application|\bapp\b|company|album|film|calendar of saints/i,
  },
  revwarbattle: { drop: /film|video game/i },
  civilization: { drop: /video game|film|novel|album/i, dropName: /^(civilization|ancient civilization|cradle of civilization)$/i },
  formercountry: {
    drop: /city in|capital (city )?of|municipality|town in|port city|video game|film|fictional|historical period|period (of|in)|era (of|in)|\bcounty\b|commune|comune|cultural region|region (of|in)|province (of|in)/i,
    dropName: /^(venice|hamburg|milan|bremen|lübeck|frankfurt|cologne|genoa|florence|ancient egypt|ancient rome|ancient greece|mesopotamia|gaul|thrace)$/i,
  },
  // ---- geography
  uscity: { strip: /, [^,]+$/, drop: /\bcounty\b in|metropolitan area|census-designated|borough of new york|municipality (of|in) puerto rico|puerto rico/i },
  cape: { name: /cape|cabo|\bcap\b|\bkap\b|head\b|point\b|punta|pointe|\bras\b|land's end|nordkapp|hague|mull of/i },
  scotisland: { strip: /, [^,]+$/, drop: /archipelago|group of islands|island group|council area|castle/i },
  // ---- language
  romance: { want: /language|dialect|variety|lect\b/i, dropName: /languages$|\/|language in|^(romance|vulgar latin|latin)$|^langues| as a |^(?!old |middle )\S+( \S+)? (spanish|portuguese|french|italian|romanian|catalan)$/i, drop: /language family|group of|subgroup|branch of|family of|pidgin|creole/i },
  germanic: { want: /language|dialect|variety|lect\b/i, dropName: /languages$|\/|language in|^germanic$| as a |^(?!old |middle |early modern )\S+( \S+)* english$|standard german$|^cockney$/i, drop: /language family|group of|subgroup|branch of|family of|pidgin|creole/i },
  latinphrase: { drop: /film|album|song|novel|\bband\b|company|organi[sz]ation|journal|magazine|episode|video game|encyclical|papal bull|hymn|book|treatise|manuscript|opera|painting|sculpture/i },
  signlang: { name: /sign|auslan|libras|makaton/i, dropName: /^(sign language|signing)$|literature|grammar|interpret/i },
  // ---- literature
  grimm: { drop: /film|opera|ballet|album|collection|edition|book series|television|dictionary|grammar|scholarly/i, dropName: /^(grimms?'? fairy tales|children's and household tales|deutsche sagen|german dictionary|deutsches wörterbuch|german legends|german grammar|deutsche mythologie|german mythology)/i },
  andersen: { drop: /film|opera|ballet|album|collection|autobiograph|\bnovel\b|travelogue|\bplay\b|poem|television|libretto/i, dropName: /bibliography/i },
  poe: { drop: /film|album|collection|magazine|edition/i },
  novel19: { drop: /film|television|series of|trilogy|tetralogy|cycle of|collection|novel sequence/i, dropName: /^(dream of the red chamber|water margin|journey to the west|romance of the three kingdoms)$/i },
  latinwriter: {
    drop: /apostle|\bgreek\b|jewish|rabbi|\bpope\b|emperor|patriarch|archbishop of constantinople|desert father|hermit|monastic|neoplaton/i,
    // Greek authors and churchmen whom Wikidata also credits with Latin
    dropName: /^pope |basil of caesarea|origen|gregory of (nyssa|nazianzus)|nestorius|cassius dio|appian|john chrysostom|athanasius|plotinus|pachomius|evagrius|nicolaus of damascus|eusebius|cyril|irenaeus|clement of alexandria|justin martyr|polybius|plutarch|galen|ptolemy|strabo|josephus|epictetus|lucian|pausanias|arrian|diodorus|dionysius|porphyry|iamblichus|proclus/i,
  },
  // ---- art and architecture
  sculpture: { drop: /film|album|award|prize|trophy/i },
  flemish: PAINTER,
  castle: { drop: /film|video game|novel|city in|town in|municipality|legend|mythical/i },
  palace: { drop: /film|video game|novel|hotel|casino/i },
  pyramid: { drop: /scheme|film|album|game show|video game|geometr|polyhedr/i, dropName: /^pyramid$/i },
  // ---- music
  percussion: { drop: /company|brand|manufacturer|model of|toy\b|software|class of|family of|classification|category|mobile phone|technique|keyboard instrument|signal|device (that|for|used)|playing/i, dropName: /\binstruments?$|phones?$|\d{2,}|^(vibrating alert|tuning fork|percussion|doorbell|drum stick|clavichord|ship's bell|bones|sea organ|baby rattle)$|alarm/i },
  orchestra: { drop: /film|album|\bband\b|big band|jazz|dance orchestra|pop\b/i, dropName: /^(orchestra|symphony orchestra|chamber orchestra)$/i },
  renaissance: COMPOSER,
  // ---- philosophy
  medphil: { want: /philosoph|theologian|scholastic|logician|thinker/i },
  earlyphil: PHILOSOPHER,
  phil19: PHILOSOPHER,
  // ---- religion and mythology
  creature: {
    drop: /\bgods?\b|goddess|deity|archangel|\bangel\b|saint|king of|queen of|\bhero\b|prophet|personification|\btitan\b|olympian|nymph in|naiad|oceanid|nereid|biblical figure|species of|genus of|taxon|constellation|video game|film|comic|franchise/i,
    dropName: /^(angel|devil|satan|god|deity|monster|mythical creature|legendary creature|spirit|demon|ghost|lucifer|gabriel|michael|raphael)$/i,
  },
  aztec: { drop: /king\b|ruler|emperor|priest|tlatoani|calendar|festival/i },
  parable: { dropName: /^(matthew|mark|luke|john) \d/i },
  holyday: { dropName: /^\w+ \d{1,2}, \d{4}$|^(solemnity|holiday|religious holiday|feast day|liturgical year|octave|holy day of obligation|vigil|queen of heaven|sports day|midnight mass)$|^portal:|games$|mitzvah|holidays$/i, drop: /calendar day|day of the year/i },
  mahabharata: { drop: /weapon|\bbow\b|\bcity\b|kingdom|\briver\b|book of|parva|film|television|group of/i, dropName: /^(pāṇḍava|pandava|kaurava|pandavas|kauravas)$/i },
  // ---- politics and law
  legislature: { want: /legislat|parliament|assembly|congress|chamber|house of|senate|council|\bdiet\b|duma/i, drop: /\bcity\b|town|municipality|capital of|village|building|palace|political party|election/i },
  // ---- economics
  bank: { drop: /central bank|investment fund|stock exchange|building|type of bank|banking activity/i, dropName: /^(investment banking|x\.com|bank|fannie mae|freddie mac)$/i },
  coin: { want: /coin/i, drop: /cryptocurrenc|commemorative|collector|series of|euro coins|video game|token/i, dropName: /^(coin|coins|gold coin|silver coin|bullion coin|small change)$|\beuro\b|commemorative|\d{4}/i },
  // ---- academia
  ukuni: { name: /universit|college|school|institute|academy|conservatoire/i, drop: /students' union|student union|press\b|library|museum|constituent college|college of the university|hospital|business school|faculty|department|hall of residence/i },
  prize: { name: /prize|medal|award|lecture/i, drop: /film|music|literary|literature|sport|journalism|photograph|peace prize|television|theat(er|re)/i },
  library: { name: /librar|biblioth|bibliotek|biblioteca|bücherei/i, dropName: /wikimedia|wikisource|^library$|digital library/i, drop: /software|website|online|digital library|programming|code library/i },
  society: {
    name: /society|academy|académie|akademie|accademia|academia|institution|institut\b|association|\bunion\b/i,
    dropName: /military academy|naval academy|motion picture|air force academy|police academy/i,
    drop: /art school|film|football|sports|military academy|naval academy|police academy|music school|conservatory|museum|secondary school|high school|drama school|ballet|air force|school in|trade union|political/i,
  },
};

// Names must be writable in the data format and typeable by a player.
const TYPEABLE = /^[\p{Script=Latin}\p{M}0-9\s'’ʻ.,&!?+:×\/\-–]+$/u;
function clean(text) {
  if (!text) return null;
  let s = text.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
  if (s.length < 2 || s.length > 60 || !TYPEABLE.test(s) || NOT_A_LIST.test(s)) return null;
  if (!/\p{L}/u.test(s) || /^Q\d+$/.test(s)) return null;
  s = s.replace(/×\s*/g, '').replace(/\s+/g, ' ').trim(); // hybrid marks in plant names
  s = s.replace(/^!+/, '').replace(/\*+$/, ''); // the data format's own marks
  return s ? s[0].toUpperCase() + s.slice(1) : null;
}

// Species are filed under their scientific name; show a common one if there
// is a trustworthy one. Wikidata's aliases include regional oddities, so an
// alias is only promoted if it names the kind of thing it is ("Scots pine")
// or is a word the hand-written lists already use.
const TAXA = new Set(['shark', 'primate', 'marsupial', 'cetacean', 'wildcat', 'conifer', 'raptor', 'snake', 'rodent', 'parrot', 'deer', 'turtle', 'cephalopod', 'canid', 'waterfowl']);
const isBinomial = (s) => /^[A-Z][a-z]+ [a-z-]+( [a-z-]+)?$/.test(s);
const KIND_WORDS = /\b(tree|pine|fir|spruce|cedar|cypress|juniper|larch|yew|hemlock|redwood|podocarp|kauri|shark|dogfish|catshark|wobbegong|monkey|lemur|macaque|gibbon|langur|baboon|tamarin|marmoset|loris|galago|tarsier|kangaroo|wallaby|possum|opossum|bandicoot|dunnart|glider|whale|dolphin|porpoise|cat|lynx|eagle|hawk|falcon|owl|owlet|vulture|kite|harrier|buzzard|kestrel|caracara|osprey|condor|goshawk|sparrowhawk|hobby|snake|python|boa|cobra|viper|rattlesnake|mamba|adder|krait|racer|kingsnake|pitviper|keelback|whipsnake|rat|mouse|squirrel|vole|hamster|gerbil|porcupine|marmot|beaver|chipmunk|gopher|lemming|dormouse|jerboa|agouti|parrot|macaw|cockatoo|parakeet|lorikeet|lory|conure|lovebird|parrotlet|deer|muntjac|brocket|turtle|tortoise|terrapin|slider|octopus|squid|cuttlefish|nautilus|fox|wolf|jackal|duck|goose|swan|teal|merganser|scoter|eider|shelduck|wigeon|pintail|pochard|scaup)s?\b/i;
const KNOWN_WORDS = new Set(O.prompts.flatMap((p) => p.answers.map((a) => O.normalize(a.name))));
const commonName = (name, aliases) => {
  // "Sand cat" is shaped like a binomial but is already a common name.
  if (KNOWN_WORDS.has(O.normalize(name)) || KIND_WORDS.test(name)) return null;
  const usable = aliases.filter((a) => !isBinomial(a) && a.length >= 4 && !name.toLowerCase().includes(a.toLowerCase()));
  return usable.find((a) => KNOWN_WORDS.has(O.normalize(a))) || usable.find((a) => KIND_WORDS.test(a)) || null;
};

// A peer is filed as "Arthur Wellesley, 1st Duke of Wellington" and spoken
// of as Arthur Wellesley, the Duke of Wellington, or plain Wellington.
function titled(name) {
  const m = name.match(/^([^,]+), (?:\d+(?:st|nd|rd|th) )?((?:Duke|Earl|Marquess|Viscount|Baron|Count|Prince) (?:of )?(.+))$/);
  return m ? [m[1], m[2], m[3]] : [];
}

// A Wikidata description as a sentence to show with the 100-point answer.
function asFact(desc) {
  const s = desc.replace(/[|~=]/g, ' ').replace(/\s+/g, ' ').trim();
  return s[0].toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? '' : '.');
}

function build(id) {
  // A source fetched in several parts is cached as set-<id>.1.json, .2.json...
  const files = fs.existsSync(CACHE) ? fs.readdirSync(CACHE).filter((f) => f === `set-${id}.json` || (f.startsWith(`set-${id}.`) && /\.\d+\.json$/.test(f))) : [];
  if (!files.length) return null;
  const head = O.prompts.find((p) => p.id === id);
  if (!head) throw new Error(`no hand-ranked list called "${id}"`);
  const byItem = new Map(); // the parts can overlap
  for (const f of files) for (const r of JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8'))) byItem.set(r.item, r);
  const rows = [...byItem.values()];

  // 1. filter and clean
  const filter = FILTERS[id] || {};
  const items = [];
  for (const r of rows) {
    const about = r.desc || '';
    if (filter.want && !filter.want.test(about)) continue;
    if (filter.drop && filter.drop.test(about)) continue;
    if (!FICTION_IS_FINE.has(id) && FICTION.test(about)) continue;
    if (/wikimedia (list|disambiguation|category|template)|\bdisambiguation page\b/i.test(about)) continue;
    const bare = (text) => {
      const t = clean(text);
      if (!t || !filter.strip) return t;
      const u = t.replace(filter.strip, '');
      return u ? u[0].toUpperCase() + u.slice(1) : t;
    };
    const name = bare(r.title) || bare(r.label);
    if (!name) continue;
    if (filter.dropName && filter.dropName.test(name)) continue;
    if (filter.name && !filter.name.test(name)) continue;
    if (filter.either && !filter.either[0].test(name) && !filter.either[1].test(about)) continue;
    const key = O.normalize(name);
    if (!key) continue;
    const aliases = [];
    const keys = new Set([key]);
    for (const raw of [r.label, ...(r.alts ? r.alts.split('|') : [])]) {
      const alias = bare(raw);
      if (!alias || alias.length < 3) continue;
      const k = O.normalize(alias);
      if (!k || keys.has(k)) continue;
      keys.add(k);
      aliases.push(alias);
      if (aliases.length === MAX_ALIASES) break;
    }
    for (const short of titled(name).slice(0, 2)) if (!keys.has(O.normalize(short))) aliases.unshift(short);
    const item = { name, key, aliases, links: Number(r.links) || 0, article: !!r.title, desc: about };
    if (TAXA.has(id) && isBinomial(name)) {
      const common = commonName(name, aliases);
      if (common) {
        item.name = common;
        item.key = O.normalize(common);
        item.aliases = [name, ...aliases.filter((a) => a !== common)];
      }
    }
    items.push(item);
  }
  items.sort((a, b) => b.links - a.links || a.name.localeCompare(b.name));

  // 2. fold what the hand-ranked list already has into it
  const listed = (text) => O.find(head, text, false); // never by surname alone
  const numbered = (key) => /\b([ivx]+|\d+)$/.test(key); // "Pius XI" is not a misspelt "Pius XII"
  const headLinks = new Map(); // answer -> best link count seen
  const also = new Map(); // answer -> extra names
  const given = new Set(); // extra names already handed out
  const tail = [];
  const claimed = new Set(); // keys owned by an earlier (better-known) answer
  for (const it of items) {
    let same = listed(it.name);
    if (!same) {
      // A one-letter difference in a long name is the same thing spelled
      // another way ("Dobermann"), as long as nothing has claimed that answer.
      const near = O.match(head, it.name);
      if (near.type === 'near' && it.key.length >= 7 && !numbered(it.key) && !headLinks.has(near.answer)) same = near.answer;
    }
    if (!same) {
      // The list says "Duke of Wellington"; Wikidata says "Arthur Wellesley,
      // 1st Duke of Wellington", perhaps with the short form as another name.
      // The best-known item answering to a listed name is that answer.
      for (const other of [...titled(it.name), ...it.aliases]) {
        const a = listed(other);
        if (a && !headLinks.has(a)) {
          same = a;
          break;
        }
      }
    }
    if (same) {
      const a = same;
      if (!headLinks.has(a)) headLinks.set(a, it.links);
      const extra = also.get(a) || [];
      for (const alias of [it.name, ...it.aliases]) {
        if (extra.length >= MAX_ALSO) break;
        const k = O.normalize(alias);
        // One extra name belongs to one answer: the best-known item to offer it.
        if (listed(alias) || given.has(k)) continue;
        given.add(k);
        extra.push(alias);
      }
      if (extra.length) also.set(a, extra);
      continue;
    }
    if (claimed.has(it.key)) continue; // a duplicate of a better-known item
    claimed.add(it.key);
    tail.push(it);
  }
  // An extra name for a hand-ranked answer must not hide a deep answer that
  // goes by that name in its own right.
  const tailNames = new Set(tail.flatMap((it) => O.variants(it.key)));
  for (const [a, names] of also) {
    const kept = names.filter((n) => !O.variants(O.normalize(n)).some((v) => tailNames.has(v)));
    if (kept.length) also.set(a, kept);
    else also.delete(a);
  }
  // Aliases are settled after every name has been claimed, so a name always
  // beats an alias, and nothing may point at a hand-ranked answer.
  for (const it of tail) {
    it.aliases = it.aliases.filter((alias) => {
      const k = O.normalize(alias);
      if (claimed.has(k) || listed(alias)) return false;
      claimed.add(k);
      return true;
    });
  }

  // 4. split by familiarity, calibrated against the hand-ranked list's own
  // lower end: its last third are the answers that will score 60, and "rare"
  // is anything at least as widely covered as the lower quarter of those.
  const found = head.answers.filter((a) => headLinks.has(a));
  const lower = found.slice(Math.floor((found.length * 2) / 3)).map((a) => headLinks.get(a)).sort((x, y) => x - y);
  let threshold = lower.length >= 4 ? lower[lower.length >> 2] : Infinity;
  const floor = Math.min(tail.length, Math.ceil(tail.length * RARE_FLOOR));
  const count = Math.min(RARE_CAP, Math.max(floor, tail.filter((it) => it.links >= threshold).length));
  const rare = tail.slice(0, count);
  let deep = tail.slice(count);
  if (rare.length) threshold = rare[rare.length - 1].links;

  // The 100-point answer: the least-covered thing that still has an English
  // article and a usable description, if the list has not picked its own.
  let gem = null;
  if (!MARKED.has(id)) {
    const eligible = deep.filter((it) => it.article && it.desc && it.desc.length >= 12 && it.desc.length <= 110 && it.name.length <= 40);
    gem = eligible.sort((a, b) => a.links - b.links || a.name.localeCompare(b.name))[0] || null;
    if (gem) deep = deep.filter((it) => it !== gem);
  }

  const write = (list) => list.map((it) => [it.name, ...it.aliases].join('=')).join('|');
  const complete = rare.length + deep.length < MIN_TAIL;
  return {
    id,
    rows: rows.length,
    matched: headLinks.size,
    missing: head.answers.filter((a) => !headLinks.has(a)).map((a) => a.name),
    headSize: head.answers.length,
    threshold,
    calibrated: lower.length >= 4,
    rare,
    deep,
    gem,
    complete,
    data: {
      rare: complete ? '' : write(rare),
      deep: complete ? '' : write(deep),
      gem: complete || !gem ? '' : `${write([gem])}~${asFact(gem.desc)}`,
      also: [...also].map(([a, names]) => [a.name, ...names].join('=')).join('|'),
    },
  };
}

// Lists that pick their own 100-point answer with a leading "!".
const MARKED = new Set(globalThis.GAME_DATA.lists.filter(([, , , , items]) => items.split('|').some((seg) => seg.trim().startsWith('!'))).map(([id]) => id));
const results = Object.keys(SOURCES).map(build).filter(Boolean);
const quote = (s) => '`' + s.replace(/[`\\$]/g, '') + '`';
const body = results
  .map((r) => `    ${r.id}: {\n      rare: ${quote(r.data.rare)},\n      deep: ${quote(r.data.deep)},\n      gem: ${quote(r.data.gem)},\n      also: ${quote(r.data.also)},\n    },`)
  .join('\n');
fs.writeFileSync(OUT, `/*
 * GENERATED by tools/build-tails.js from Wikidata. Do not edit by hand.
 *
 * The deep catalogue behind each hand-ranked list in data-lists.js: every
 * further member of the category that Wikidata knows, best-known first.
 *   rare  familiar enough to sit with the list's lower end (60 points)
 *   deep  everything else (85 points)
 *   gem   the single 100-point answer, with a fact, when the list has none
 *   also  extra names for answers that are already hand-ranked
 * Items are "Name=alias=alias", separated by "|".
 */
(function (root) {
  const D = (root.GAME_DATA = root.GAME_DATA || {});
  D.tails = {
${body}
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
`);

const sample = process.argv.includes('--sample');
const showMissing = process.argv.includes('--missing');
let total = 0;
for (const r of results) {
  const size = r.complete ? 0 : r.rare.length + r.deep.length + (r.gem ? 1 : 0);
  total += size;
  console.log(
    `${r.id.padEnd(16)} ${String(r.rows).padStart(5)} rows -> ${String(r.rare.length).padStart(4)} rare + ${String(r.deep.length).padStart(5)} deep | ${r.matched}/${r.headSize} listed found | rare ≥ ${r.threshold} links${r.calibrated ? '' : ' (uncalibrated)'}${r.complete ? ' | TOO SMALL, list left complete' : ''}`
  );
  if (sample) {
    const show = (list, n) => list.slice(0, n).map((it) => `${it.name}(${it.links})`).join(', ');
    console.log(`    rare: ${show(r.rare, 14)}`);
    console.log(`    deep: ${show(r.deep, 8)} … ${show(r.deep.slice(Math.floor(r.deep.length / 2)), 6)} … ${show(r.deep.slice(-5), 5)}`);
    if (r.gem) console.log(`    gem:  ${r.gem.name} — ${r.gem.desc}`);
  }
  if ((sample || showMissing) && r.missing.length) console.log(`    not in Wikidata's set: ${r.missing.join(', ')}`);
}
const missing = Object.keys(SOURCES).filter((id) => !results.some((r) => r.id === id));
console.log(`\n${results.length} categories, ${total.toLocaleString()} deep-catalogue answers, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
if (missing.length) console.log(`not downloaded yet: ${missing.join(' ')}`);
