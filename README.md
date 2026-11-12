# Academicrillion

A trivia game set in a library tower. Each prompt has hundreds of right answers, and the rarer the one you give, the higher you climb.

**Play it: https://patrickjykang.github.io/academicrillion/**

![An answered prompt: "Name a river more than 1,000 km long". The answer Irtysh is a Back Shelf answer worth 60 points, and the climber goes up six floors of the tower.](docs/screenshot.png)

## How it plays

- A climb is seven prompts, such as "Name a tectonic plate" or "Name a paradox".
- You see each prompt for 3 seconds, then have 25 seconds to type one answer.
- A guess that isn't in the catalogue costs nothing. Keep trying until the clock runs out.
- A near-miss spelling is offered back ("Did you mean…?") and counts if you confirm it or the clock runs out first.
- The fewer people who would give your answer, the more it scores:

  | Shelf | Points | |
  |---|---|---|
  | Lost Manuscript | 100 | the single rarest answer in the catalogue |
  | Dusty Tome | 85 | hardly anyone names it |
  | Back Shelf | 60 | off the main aisle |
  | Well-Thumbed | 30 | solid, but common |
  | Book Club Pick | 15 | feels obscure, but everyone reaches for it |
  | Bestseller | 10 | the first answer on everyone's tongue |

- Ten points is one floor. A perfect climb is 700 points, the lantern room on floor 70.
- Climbs are numbered and never run out. A given climb number always has the same seven prompts, and no prompt comes back until the others have had a turn.
- There are no other players. The "other climbers" you are ranked against are 2,000 simulated ones.
- Your history is kept in your browser only.

## What it asks about

199 prompts and about 50,000 accepted answers, across 18 subjects. A climb takes at most two prompts from any one subject.

| | | |
|---|---|---|
| Physics & Chemistry (9) | Astronomy & Space (6) | Earth Science (9) |
| Life Science (10) | Mathematics (6) | Medicine & Psychology (11) |
| Technology & Engineering (8) | History (22) | Geography (33) |
| Language (8) | Literature (14) | Art & Architecture (9) |
| Music & Theatre (11) | Philosophy (6) | Religion & Mythology (10) |
| Politics & Law (13) | Economics (10) | Academia (4) |

Popular culture, sport and food are left out on purpose.

## Run it locally

There is no build step and nothing to install. Serve the folder with any static server:

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173/.

To run the tests (Node 18 or newer):

```bash
node test/engine.test.js
```

## Where the answers come from

A category is one of two kinds.

- **Complete.** The whole set is written out by hand in `js/data-lists.js`: the 88 constellations, the books of the Bible, the colleges of Oxford and Cambridge.
- **Deep.** The best-known answers are ranked by hand, and the rest of the category comes from [Wikidata](https://www.wikidata.org/). An answer's familiarity is taken from how many language editions of Wikipedia have an article on it.

The deep catalogues are built in three steps:

1. `tools/sources.js` holds one Wikidata query per category.
2. `node tools/fetch-tails.js` downloads each set into `tools/cache/`. Sets already there are skipped.
3. `node tools/build-tails.js` filters out what doesn't belong, merges each set with its hand-ranked list and writes `js/data-tails.js`. That file is generated; don't edit it by hand.

The downloaded sets are checked in, so step 3 works without a network connection.

## Adding a category

1. Add an entry to `js/data-lists.js`. The comment at the top of the file explains the format.
2. For a deep category, add its query to `tools/sources.js` under the same id, then run the fetch and build steps. Run the build with `--sample` to see what came back, and add a filter in `tools/build-tails.js` if the set is noisy.
3. Run the tests.
4. Bump the `?v=` number on the files in `index.html` so browsers pick up the change.

## Layout

```
index.html, style.css   the page
js/data-lists.js        hand-ranked lists, one per category
js/data-geo.js          countries, capitals, US states
js/data-elements.js     chemical elements
js/data-tails.js        deep catalogues (generated)
js/engine.js            matching, scoring, scheduling, simulated players
js/app.js               the game screens
js/scene.js             the tower drawn behind them
tools/                  the Wikidata download and build scripts, and their cache
test/engine.test.js     data and engine checks
```

## Things to know

- The percentages shown with an answer ("about 2% of readers would say this") are worked out from its rank in the list. They are not measured from real players.
- The fact shown with each 100-point answer was written by hand and has not been independently checked.
- Wikidata's categories are noisy. The filters remove the worst of it, but some odd answers will remain in the deep catalogues.
- The data is Wikidata as it stood in November 2026, downloaded through [QLever](https://qlever.dev/), a public mirror run by the University of Freiburg. Wikidata's content is CC0.
- The format is inspired by the daily dive at [krillion.io](https://krillion.io/). This is an independent project and is not affiliated with it.

## Licence

Academicrillion is free software, released under the [GNU General Public License, version 3](LICENSE).
