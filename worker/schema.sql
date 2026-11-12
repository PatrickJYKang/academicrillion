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
