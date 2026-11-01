PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS link_stats (
  code TEXT PRIMARY KEY,
  total_visits INTEGER NOT NULL DEFAULT 0 CHECK (total_visits >= 0),
  last_visit TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS daily_visits (
  code TEXT NOT NULL,
  visit_date TEXT NOT NULL,
  visits INTEGER NOT NULL DEFAULT 0 CHECK (visits >= 0),
  PRIMARY KEY (code, visit_date),
  FOREIGN KEY (code) REFERENCES link_stats(code) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_daily_visits_date ON daily_visits(visit_date);
