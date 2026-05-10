import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DB_PATH } from "./db-path";

declare global {
  // eslint-disable-next-line no-var
  var __impactaDb: DatabaseSync | undefined;
  // eslint-disable-next-line no-var
  var __impactaDbReady: boolean | undefined;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS consultants (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    email           TEXT,
    role            TEXT,
    seniority       TEXT,
    sector          TEXT,
    location        TEXT,
    years_experience INTEGER,
    languages       TEXT,
    skills          TEXT,
    summary         TEXT,
    cv_file_name    TEXT,
    cv_file_path    TEXT,
    cv_text         TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_consultants_sector    ON consultants(sector);
  CREATE INDEX IF NOT EXISTS idx_consultants_seniority ON consultants(seniority);

  CREATE VIRTUAL TABLE IF NOT EXISTS consultants_fts USING fts5(
    name, role, sector, skills, languages, summary, cv_text,
    content='consultants', content_rowid='id', tokenize='unicode61'
  );

  CREATE TRIGGER IF NOT EXISTS consultants_ai AFTER INSERT ON consultants BEGIN
    INSERT INTO consultants_fts(rowid, name, role, sector, skills, languages, summary, cv_text)
    VALUES (new.id, new.name, new.role, new.sector, new.skills, new.languages, new.summary, new.cv_text);
  END;

  CREATE TRIGGER IF NOT EXISTS consultants_ad AFTER DELETE ON consultants BEGIN
    INSERT INTO consultants_fts(consultants_fts, rowid, name, role, sector, skills, languages, summary, cv_text)
    VALUES ('delete', old.id, old.name, old.role, old.sector, old.skills, old.languages, old.summary, old.cv_text);
  END;

  CREATE TRIGGER IF NOT EXISTS consultants_au AFTER UPDATE ON consultants BEGIN
    INSERT INTO consultants_fts(consultants_fts, rowid, name, role, sector, skills, languages, summary, cv_text)
    VALUES ('delete', old.id, old.name, old.role, old.sector, old.skills, old.languages, old.summary, old.cv_text);
    INSERT INTO consultants_fts(rowid, name, role, sector, skills, languages, summary, cv_text)
    VALUES (new.id, new.name, new.role, new.sector, new.skills, new.languages, new.summary, new.cv_text);
  END;

  CREATE TABLE IF NOT EXISTS projects (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    client          TEXT,
    sector          TEXT,
    description     TEXT,
    required_skills TEXT,
    start_date      TEXT NOT NULL,
    end_date        TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'open',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS project_slots (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    seniority       TEXT NOT NULL,
    allocation_pct  INTEGER NOT NULL,
    label           TEXT,
    position        INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS staffings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_slot_id INTEGER NOT NULL UNIQUE REFERENCES project_slots(id) ON DELETE CASCADE,
    consultant_id   INTEGER NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
    allocation_pct  INTEGER NOT NULL,
    start_date      TEXT NOT NULL,
    end_date        TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_staffings_consultant ON staffings(consultant_id);
  CREATE INDEX IF NOT EXISTS idx_staffings_dates      ON staffings(start_date, end_date);
  CREATE INDEX IF NOT EXISTS idx_project_slots_project ON project_slots(project_id);
`;

function open(): DatabaseSync {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

export function getDb(): DatabaseSync {
  if (!globalThis.__impactaDb) {
    globalThis.__impactaDb = open();
    globalThis.__impactaDbReady = true;
  }
  return globalThis.__impactaDb;
}
