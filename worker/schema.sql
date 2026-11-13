-- Daily climb records. One row per player per day; a later record for the
-- same player and day replaces the earlier one.
CREATE TABLE IF NOT EXISTS climbs (
  key TEXT PRIMARY KEY,          -- player:day
  player TEXT NOT NULL,          -- random id made up by the player's browser
  day INTEGER NOT NULL,          -- daily climb number
  done INTEGER NOT NULL,         -- 1 finished, 0 left unfinished
  score INTEGER NOT NULL,
  started_at INTEGER,            -- ms since 1970, by the player's clock
  finished_at INTEGER,
  received_at INTEGER NOT NULL,  -- ms since 1970, by the server's clock
  v INTEGER NOT NULL,            -- record format version
  rounds TEXT NOT NULL           -- JSON array, one object per prompt
);
CREATE INDEX IF NOT EXISTS climbs_day ON climbs (day);

-- One row per prompt played.
CREATE VIEW IF NOT EXISTS rounds AS
SELECT c.key, c.player, c.day, c.done,
  r.key + 1 AS n,
  json_extract(r.value, '$.id') AS prompt,
  json_extract(r.value, '$.name') AS answer,
  json_extract(r.value, '$.raw') AS typed,
  json_extract(r.value, '$.tier') AS tier,
  json_extract(r.value, '$.score') AS score,
  json_extract(r.value, '$.ms') AS ms,
  json_extract(r.value, '$.near') AS near,
  json_extract(r.value, '$.timeout') AS timeout,
  json_extract(r.value, '$.left') AS left_early,
  json_extract(r.value, '$.misses') AS misses,
  json_extract(r.value, '$.misfits') AS misfits
FROM climbs c, json_each(c.rounds) r;

-- One row per guess that was turned away: 'miss' is not in the catalogue,
-- 'misfit' is a real member of the wider set that does not fit the prompt.
CREATE VIEW IF NOT EXISTS guesses AS
SELECT r.day, r.prompt, r.player, g.value AS guess, 'miss' AS kind FROM rounds r, json_each(r.misses) g
UNION ALL
SELECT r.day, r.prompt, r.player, g.value AS guess, 'misfit' AS kind FROM rounds r, json_each(r.misfits) g;

-- Visits. One row per player per day the game was opened, with how many
-- unlimited climbs that browser started and finished that day. Later records
-- for the same player and day only ever raise the counts.
CREATE TABLE IF NOT EXISTS visits (
  key TEXT PRIMARY KEY,          -- player:day
  player TEXT NOT NULL,          -- the same random id as in climbs
  day INTEGER NOT NULL,          -- counted like the daily climbs: day 1 is 11 November 2026, UTC
  started INTEGER NOT NULL,      -- unlimited climbs begun
  finished INTEGER NOT NULL,     -- unlimited climbs completed
  first_at INTEGER,              -- ms since 1970, by the player's clock: first opened that day
  received_at INTEGER NOT NULL,  -- ms since 1970, by the server's clock: first record
  updated_at INTEGER NOT NULL,   -- ...and the latest
  v INTEGER NOT NULL             -- record format version
);
CREATE INDEX IF NOT EXISTS visits_day ON visits (day);

-- Traffic, one row per day. A visitor is new on the first day their browser
-- shows up in either table. Visits were not counted before 13 November 2026,
-- so earlier days show daily players only.
CREATE VIEW IF NOT EXISTS traffic AS
SELECT d.day,
  date('2026-11-11', '+' || (d.day - 1) || ' days') AS date,
  (SELECT COUNT(*) FROM visits v WHERE v.day = d.day) AS visitors,
  (SELECT COUNT(*) FROM visits v WHERE v.day = d.day AND v.day = (
     SELECT MIN(day) FROM (SELECT day FROM visits f WHERE f.player = v.player UNION ALL SELECT day FROM climbs c WHERE c.player = v.player)
   )) AS new_visitors,
  (SELECT COUNT(*) FROM climbs c WHERE c.day = d.day) AS daily_players,
  (SELECT COALESCE(SUM(c.done), 0) FROM climbs c WHERE c.day = d.day) AS daily_finished,
  (SELECT COUNT(*) FROM visits v WHERE v.day = d.day AND v.started > 0) AS unlimited_players,
  (SELECT COALESCE(SUM(v.started), 0) FROM visits v WHERE v.day = d.day) AS unlimited_started,
  (SELECT COALESCE(SUM(v.finished), 0) FROM visits v WHERE v.day = d.day) AS unlimited_finished
FROM (SELECT day FROM visits UNION SELECT day FROM climbs) d
ORDER BY d.day;
