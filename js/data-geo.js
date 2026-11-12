/*
 * Countries and US states. Both are listed from most- to least-commonly named,
 * which is what rarity is computed from once a prompt filters them down.
 *
 * Country row:  names ; continents ; capital names ; flags
 *   names      first is canonical. "=x" is an alias, "=/x" is an alternative
 *              official name that also counts for spelling-based prompts.
 *   continents AF AS EU NA SA OC, joined with "+" when a country spans two
 *   flags      L landlocked, I island nation, D decoy
 */
(function (root) {
  const D = (root.GAME_DATA = root.GAME_DATA || {});

  D.countries = `
United States=USA=US=America=United States of America=The States;NA;Washington, D.C.=Washington=Washington DC=DC
Canada;NA;Ottawa
France;EU;Paris
China=PRC=People's Republic of China;AS;Beijing=Peking
Japan;AS;Tokyo;I
Germany;EU;Berlin
Mexico;NA;Mexico City
United Kingdom=UK=Great Britain=Britain=GB;EU;London;I
Italy;EU;Rome=Roma
Brazil;SA;Brasília
Spain;EU;Madrid
India;AS;New Delhi=Delhi
Russia=Russian Federation;EU+AS;Moscow
Australia;OC;Canberra
Egypt;AF+AS;Cairo
Argentina;SA;Buenos Aires
South Africa;AF;Pretoria=Cape Town=Bloemfontein
Ireland=Republic of Ireland=Eire;EU;Dublin;I
Greece;EU;Athens
Sweden;EU;Stockholm
Switzerland;EU;Bern=Berne;L
Netherlands=Holland;EU;Amsterdam
Portugal;EU;Lisbon=Lisboa
Turkey=/Türkiye;AS+EU;Ankara
Poland;EU;Warsaw
Norway;EU;Oslo
South Korea=Korea=Republic of Korea;AS;Seoul
Thailand;AS;Bangkok
Vietnam=Viet Nam;AS;Hanoi
Cuba;NA;Havana;I
Iran;AS;Tehran=Teheran
Iraq;AS;Baghdad
Israel;AS;Jerusalem
Saudi Arabia;AS;Riyadh
Ukraine;EU;Kyiv=Kiev
New Zealand=Aotearoa;OC;Wellington;I
Peru;SA;Lima
Chile;SA;Santiago
Colombia;SA;Bogotá
Kenya;AF;Nairobi
Nigeria;AF;Abuja
Denmark;EU;Copenhagen
Finland;EU;Helsinki
Belgium;EU;Brussels
Austria;EU;Vienna=Wien;L
Jamaica;NA;Kingston;I
Pakistan;AS;Islamabad
Afghanistan;AS;Kabul;L
Indonesia;AS;Jakarta=Nusantara;I
Philippines;AS;Manila;I
North Korea=DPRK;AS;Pyongyang
Morocco;AF;Rabat
Iceland;EU;Reykjavik;I
Venezuela;SA;Caracas
Singapore;AS;Singapore=Singapore City;I
Malaysia;AS;Kuala Lumpur
Hungary;EU;Budapest;L
Czechia=/Czech Republic;EU;Prague=Praha;L
Romania;EU;Bucharest
Ethiopia;AF;Addis Ababa;L
Ghana;AF;Accra
Syria;AS;Damascus
Lebanon;AS;Beirut
Jordan;AS;Amman
United Arab Emirates=UAE=Emirates;AS;Abu Dhabi
Qatar;AS;Doha
Nepal;AS;Kathmandu;L
Bangladesh;AS;Dhaka
Sri Lanka;AS;Sri Jayawardenepura Kotte=Kotte=Colombo;I
Mongolia;AS;Ulaanbaatar=Ulan Bator;L
Kazakhstan;AS+EU;Astana=Nur-Sultan;L
Croatia;EU;Zagreb
Serbia;EU;Belgrade;L
Bulgaria;EU;Sofia
Ecuador;SA;Quito
Bolivia;SA;Sucre=La Paz;L
Uruguay;SA;Montevideo
Paraguay;SA;Asunción;L
Costa Rica;NA;San José
Panama;NA;Panama City
Guatemala;NA;Guatemala City
Honduras;NA;Tegucigalpa
Haiti;NA;Port-au-Prince;I
Dominican Republic;NA;Santo Domingo;I
Bahamas;NA;Nassau;I
Fiji;OC;Suva;I
Madagascar;AF;Antananarivo;I
Tanzania;AF;Dodoma=Dar es Salaam
Uganda;AF;Kampala;L
Zimbabwe;AF;Harare;L
Algeria;AF;Algiers
Libya;AF;Tripoli
Tunisia;AF;Tunis
Sudan;AF;Khartoum
Somalia;AF;Mogadishu
Senegal;AF;Dakar
Cameroon;AF;Yaoundé
Angola;AF;Luanda
Mozambique;AF;Maputo
Zambia;AF;Lusaka;L
Democratic Republic of the Congo=DR Congo=DRC=Congo-Kinshasa=Zaire;AF;Kinshasa
Rwanda;AF;Kigali;L
Luxembourg;EU;Luxembourg=Luxembourg City;L
Monaco;EU;Monaco=Monaco-Ville
Vatican City=Vatican=Holy See;EU;Vatican City=Vatican;L
Liechtenstein;EU;Vaduz;LD
Malta;EU;Valletta;I
Cyprus;EU+AS;Nicosia;I
Estonia;EU;Tallinn
Latvia;EU;Riga
Lithuania;EU;Vilnius
Belarus;EU;Minsk;L
Slovakia;EU;Bratislava;L
Slovenia;EU;Ljubljana
Bosnia and Herzegovina=Bosnia=Bosnia-Herzegovina;EU;Sarajevo
Albania;EU;Tirana
North Macedonia=Macedonia;EU;Skopje;L
Montenegro;EU;Podgorica
Kosovo;EU;Pristina=Prishtina;L
Moldova;EU;Chișinău;L
Georgia;AS+EU;Tbilisi
Armenia;AS+EU;Yerevan;L
Azerbaijan;AS+EU;Baku;L
Uzbekistan;AS;Tashkent;L
Turkmenistan;AS;Ashgabat;L
Kyrgyzstan;AS;Bishkek;L
Tajikistan;AS;Dushanbe;L
Myanmar=/Burma;AS;Naypyidaw=Nay Pyi Taw=Naypyitaw
Cambodia;AS;Phnom Penh
Laos;AS;Vientiane;L
Taiwan=Republic of China;AS;Taipei;I
Bhutan;AS;Thimphu;L
Maldives;AS;Malé;I
Brunei;AS;Bandar Seri Begawan
Timor-Leste=/East Timor;AS;Dili;I
Papua New Guinea=PNG;OC;Port Moresby;I
Samoa;OC;Apia;I
Tonga;OC;Nukuʻalofa=Nukualofa;I
Yemen;AS;Sanaa
Oman;AS;Muscat
Kuwait;AS;Kuwait City
Bahrain;AS;Manama;I
Palestine=State of Palestine;AS;Ramallah=East Jerusalem
El Salvador;NA;San Salvador
Nicaragua;NA;Managua
Belize;NA;Belmopan
Guyana;SA;Georgetown
Suriname;SA;Paramaribo
Trinidad and Tobago=Trinidad;NA;Port of Spain;I
Barbados;NA;Bridgetown;I
Grenada;NA;St. George's;I
Saint Lucia;NA;Castries;I
Antigua and Barbuda=Antigua;NA;St. John's;I
Dominica;NA;Roseau;I
Saint Kitts and Nevis=Saint Kitts;NA;Basseterre;I
Saint Vincent and the Grenadines=Saint Vincent;NA;Kingstown;I
Mali;AF;Bamako;L
Niger;AF;Niamey;L
Chad;AF;N'Djamena;L
Côte d'Ivoire=/Ivory Coast;AF;Yamoussoukro=Abidjan
Liberia;AF;Monrovia
Sierra Leone;AF;Freetown
Guinea;AF;Conakry
Togo;AF;Lomé
Benin;AF;Porto-Novo
Burkina Faso;AF;Ouagadougou;L
Gambia;AF;Banjul
Mauritania;AF;Nouakchott
Botswana;AF;Gaborone;L
Namibia;AF;Windhoek
Malawi;AF;Lilongwe;L
Lesotho;AF;Maseru;L
Eswatini=/Swaziland;AF;Mbabane=Lobamba;L
Djibouti;AF;Djibouti=Djibouti City;D
Eritrea;AF;Asmara
South Sudan;AF;Juba;L
Burundi;AF;Gitega=Bujumbura;L
Gabon;AF;Libreville
Republic of the Congo=Congo=Congo-Brazzaville=Congo Republic;AF;Brazzaville
Central African Republic=CAR;AF;Bangui;L
Equatorial Guinea;AF;Malabo
Guinea-Bissau;AF;Bissau
Cabo Verde=/Cape Verde;AF;Praia;I
Seychelles;AF;Victoria;I
Mauritius;AF;Port Louis;I
Comoros;AF;Moroni;I
São Tomé and Príncipe=Sao Tome;AF;São Tomé;I
Andorra;EU;Andorra la Vella;L
San Marino;EU;San Marino=City of San Marino;L
Vanuatu;OC;Port Vila;I
Solomon Islands;OC;Honiara;I
Kiribati;OC;Tarawa=South Tarawa;I
Micronesia=Federated States of Micronesia;OC;Palikir;I
Marshall Islands;OC;Majuro;I
Palau;OC;Ngerulmud;I
Tuvalu;OC;Funafuti;I
Nauru;OC;Yaren;I
`;

  // Country prompts defined by a hand-picked membership list. Names must
  // match a canonical name above; popularity order comes from that list.
  // Sets of countries defined by membership rather than geography: [id, prompt, members].
  // Sets of countries that are not a matter of geography: [id, subject, prompt, names].
  D.countrySets = [
    ['commonwealth', 'law', 'Name a member of the Commonwealth of Nations', 'Antigua and Barbuda|Australia|Bahamas|Bangladesh|Barbados|Belize|Botswana|Brunei|Cameroon|Canada|Cyprus|Dominica|Eswatini|Fiji|Gabon|Gambia|Ghana|Grenada|Guyana|India|Jamaica|Kenya|Kiribati|Lesotho|Malawi|Malaysia|Maldives|Malta|Mauritius|Mozambique|Namibia|Nauru|New Zealand|Nigeria|Pakistan|Papua New Guinea|Rwanda|Saint Kitts and Nevis|Saint Lucia|Saint Vincent and the Grenadines|Samoa|Seychelles|Sierra Leone|Singapore|Solomon Islands|South Africa|Sri Lanka|Tanzania|Togo|Tonga|Trinidad and Tobago|Tuvalu|Uganda|United Kingdom|Vanuatu|Zambia'],
    ['eu', 'law', 'Name a member state of the European Union', 'Austria|Belgium|Bulgaria|Croatia|Cyprus|Czechia|Denmark|Estonia|Finland|France|Germany|Greece|Hungary|Ireland|Italy|Latvia|Lithuania|Luxembourg|Malta|Netherlands|Poland|Portugal|Romania|Slovakia|Slovenia|Spain|Sweden'],
    ['nato', 'law', 'Name a member of NATO', 'Albania|Belgium|Bulgaria|Canada|Croatia|Czechia|Denmark|Estonia|Finland|France|Germany|Greece|Hungary|Iceland|Italy|Latvia|Lithuania|Luxembourg|Montenegro|Netherlands|North Macedonia|Norway|Poland|Portugal|Romania|Slovakia|Slovenia|Spain|Sweden|Turkey|United Kingdom|United States'],
    ['monarchy', 'law', 'Name a country that has a monarch', 'United Kingdom|Canada|Australia|New Zealand|Jamaica|Bahamas|Belize|Grenada|Antigua and Barbuda|Saint Kitts and Nevis|Saint Lucia|Saint Vincent and the Grenadines|Papua New Guinea|Solomon Islands|Tuvalu|Spain|Sweden|Norway|Denmark|Netherlands|Belgium|Luxembourg|Liechtenstein|Monaco|Andorra|Vatican City|Japan|Thailand|Cambodia|Malaysia|Brunei|Bhutan|Saudi Arabia|Jordan|Kuwait|Bahrain|Qatar|United Arab Emirates|Oman|Morocco|Lesotho|Eswatini|Tonga'],
    ['oecd', 'econ', 'Name a member of the OECD', 'Australia|Austria|Belgium|Canada|Chile|Colombia|Costa Rica|Czechia|Denmark|Estonia|Finland|France|Germany|Greece|Hungary|Iceland|Ireland|Israel|Italy|Japan|South Korea|Latvia|Lithuania|Luxembourg|Mexico|Netherlands|New Zealand|Norway|Poland|Portugal|Slovakia|Slovenia|Spain|Sweden|Switzerland|Turkey|United Kingdom|United States'],
  ];

  D.states = `
California;Sacramento;W
Texas;Austin;S
New York;Albany;NE
Florida;Tallahassee;S
Hawaii;Honolulu;W
Alaska;Juneau;W
Washington;Olympia;W
Colorado;Denver;W
Arizona;Phoenix;W
Nevada;Carson City;W
Ohio;Columbus;MW
Illinois;Springfield;MW
Georgia;Atlanta;S
Michigan;Lansing;MW
Oregon;Salem;W
Pennsylvania;Harrisburg;NE
Virginia;Richmond;S
New Jersey;Trenton;NE
Massachusetts;Boston;NE
North Carolina;Raleigh;S
Tennessee;Nashville;S
Utah;Salt Lake City;W
Montana;Helena;W
Louisiana;Baton Rouge;S
Kentucky;Frankfort;S
Minnesota;Saint Paul;MW
Wisconsin;Madison;MW
Maine;Augusta;NE
Alabama;Montgomery;S
Mississippi;Jackson;S
Missouri;Jefferson City;MW
Oklahoma;Oklahoma City;S
Kansas;Topeka;MW
Indiana;Indianapolis;MW
Iowa;Des Moines;MW
Idaho;Boise;W
New Mexico;Santa Fe;W
South Carolina;Columbia;S
Maryland;Annapolis;S
Wyoming;Cheyenne;W
Vermont;Montpelier;NE
Connecticut;Hartford;NE
Arkansas;Little Rock;S
Nebraska;Lincoln;MW
West Virginia;Charleston;S
North Dakota;Bismarck;MW
South Dakota;Pierre;MW
New Hampshire;Concord;NE
Rhode Island;Providence;NE
Delaware;Dover;S
`;

  // How readily each capital comes to mind is not the same as its state, so
  // capitals carry their own order.
  D.stateCapitalOrder = 'Boston|Atlanta|Denver|Phoenix|Honolulu|Sacramento|Austin|Nashville|Salt Lake City|Albany|Oklahoma City|Indianapolis|Columbus|Juneau|Santa Fe|Little Rock|Baton Rouge|Richmond|Raleigh|Tallahassee|Boise|Des Moines|Saint Paul|Madison|Providence|Hartford|Charleston|Columbia|Montgomery|Jackson|Springfield|Lansing|Salem|Olympia|Trenton|Harrisburg|Annapolis|Dover|Helena|Cheyenne|Topeka|Lincoln|Bismarck|Carson City|Jefferson City|Concord|Augusta|Frankfort|Montpelier|Pierre';

})(typeof globalThis !== 'undefined' ? globalThis : this);
