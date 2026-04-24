-- D1 engagement index + audit log. Mirrors SPEC v3.0 §5.3.
-- All timestamps are ISO-8601 UTC strings ('2026-04-24T09:12:33.456Z') so
-- Workers can round-trip them via JSON without a Date-serialisation dance.

CREATE TABLE IF NOT EXISTS engagements (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  client_name        TEXT,
  region_profile     TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  created_by         TEXT NOT NULL,
  last_modified_at   TEXT NOT NULL,
  last_modified_by   TEXT NOT NULL,
  etag               TEXT NOT NULL DEFAULT '',
  lock_holder        TEXT,
  lock_acquired_at   TEXT,
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  sku_count          INTEGER NOT NULL DEFAULT 0,
  scenario_count     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_engagements_region
  ON engagements(region_profile);

CREATE INDEX IF NOT EXISTS idx_engagements_last_modified
  ON engagements(last_modified_at DESC);

CREATE INDEX IF NOT EXISTS idx_engagements_status
  ON engagements(status);

CREATE TABLE IF NOT EXISTS audit_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  engagement_id  TEXT NOT NULL,
  user_email     TEXT NOT NULL,
  action         TEXT NOT NULL,
  timestamp      TEXT NOT NULL,
  details        TEXT,
  FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_audit_engagement_time
  ON audit_log(engagement_id, timestamp DESC);
