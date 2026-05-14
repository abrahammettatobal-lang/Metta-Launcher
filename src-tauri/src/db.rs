use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

pub struct Db {
  pub conn: Mutex<Connection>,
}

impl Db {
  pub fn open(path: &Path) -> Result<Self, String> {
    if let Some(parent) = path.parent() {
      std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn
      .execute_batch(
        r#"
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  username TEXT NOT NULL,
  uuid TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS instances (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  minecraft_version TEXT NOT NULL,
  loader_type TEXT NOT NULL,
  loader_version TEXT NOT NULL,
  instance_path TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'default',
  min_ram_mb INTEGER NOT NULL DEFAULT 512,
  max_ram_mb INTEGER NOT NULL DEFAULT 4096,
  java_path TEXT,
  jvm_args TEXT NOT NULL DEFAULT '',
  game_args TEXT NOT NULL DEFAULT '',
  game_resolution TEXT,
  last_played_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS installed_versions (
  id TEXT PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  root_path TEXT NOT NULL,
  json_path TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS loader_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loader_type TEXT NOT NULL,
  minecraft_version TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  UNIQUE(loader_type, minecraft_version)
);
CREATE TABLE IF NOT EXISTS downloads (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  dest_path TEXT NOT NULL,
  sha1 TEXT,
  state TEXT NOT NULL,
  bytes_total INTEGER,
  bytes_done INTEGER,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS launch_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  exit_code INTEGER,
  success INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  instance_id TEXT,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_instances_name ON instances(name);
CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_launch_history_instance ON launch_history(instance_id);
"#,
      )
      .map_err(|e| e.to_string())?;
    Ok(Db {
      conn: Mutex::new(conn),
    })
  }

  pub fn setting_get(&self, key: &str) -> Result<Option<String>, String> {
    let conn = self.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
      .prepare("SELECT value FROM settings WHERE key = ?1")
      .map_err(|e| e.to_string())?;
    stmt
      .query_row(params![key], |r| r.get(0))
      .optional()
      .map_err(|e| e.to_string())
  }

  pub fn setting_set(&self, key: &str, value: &str) -> Result<(), String> {
    let conn = self.conn.lock().map_err(|e| e.to_string())?;
    conn
      .execute(
        "INSERT INTO settings(key, value) VALUES(?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
      )
      .map_err(|e| e.to_string())?;
    Ok(())
  }

  pub fn log_insert(
    &self,
    source: &str,
    instance_id: Option<&str>,
    level: &str,
    message: &str,
  ) -> Result<(), String> {
    let conn = self.conn.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn
      .execute(
        "INSERT INTO logs(source, instance_id, level, message, created_at) VALUES(?1, ?2, ?3, ?4, ?5)",
        params![source, instance_id, level, message, now],
      )
      .map_err(|e| e.to_string())?;
    Ok(())
  }

  pub fn logs_query(
    &self,
    limit: i64,
    level_filter: Option<&str>,
    source_filter: Option<&str>,
  ) -> Result<Vec<LogRow>, String> {
    let conn = self.conn.lock().map_err(|e| e.to_string())?;
    let level = level_filter.filter(|s| !s.is_empty());
    let source = source_filter.filter(|s| !s.is_empty());
    let map_row = |r: &rusqlite::Row| {
      Ok(LogRow {
        id: r.get(0)?,
        source: r.get(1)?,
        instance_id: r.get(2)?,
        level: r.get(3)?,
        message: r.get(4)?,
        created_at: r.get(5)?,
      })
    };
    let mut out = Vec::new();
    match (level, source) {
      (Some(l), Some(s)) => {
        let mut stmt = conn
          .prepare(
            "SELECT id, source, instance_id, level, message, created_at FROM logs
             WHERE level = ?1 AND source = ?2
             ORDER BY id DESC LIMIT ?3",
          )
          .map_err(|e| e.to_string())?;
        let rows = stmt
          .query_map(params![l, s, limit], map_row)
          .map_err(|e| e.to_string())?;
        for row in rows {
          out.push(row.map_err(|e| e.to_string())?);
        }
      }
      (Some(l), None) => {
        let mut stmt = conn
          .prepare(
            "SELECT id, source, instance_id, level, message, created_at FROM logs
             WHERE level = ?1
             ORDER BY id DESC LIMIT ?2",
          )
          .map_err(|e| e.to_string())?;
        let rows = stmt
          .query_map(params![l, limit], map_row)
          .map_err(|e| e.to_string())?;
        for row in rows {
          out.push(row.map_err(|e| e.to_string())?);
        }
      }
      (None, Some(s)) => {
        let mut stmt = conn
          .prepare(
            "SELECT id, source, instance_id, level, message, created_at FROM logs
             WHERE source = ?1
             ORDER BY id DESC LIMIT ?2",
          )
          .map_err(|e| e.to_string())?;
        let rows = stmt
          .query_map(params![s, limit], map_row)
          .map_err(|e| e.to_string())?;
        for row in rows {
          out.push(row.map_err(|e| e.to_string())?);
        }
      }
      (None, None) => {
        let mut stmt = conn
          .prepare(
            "SELECT id, source, instance_id, level, message, created_at FROM logs
             ORDER BY id DESC LIMIT ?1",
          )
          .map_err(|e| e.to_string())?;
        let rows = stmt
          .query_map(params![limit], map_row)
          .map_err(|e| e.to_string())?;
        for row in rows {
          out.push(row.map_err(|e| e.to_string())?);
        }
      }
    }
    Ok(out)
  }

  pub fn logs_clear(&self) -> Result<(), String> {
    let conn = self.conn.lock().map_err(|e| e.to_string())?;
    conn
      .execute("DELETE FROM logs", [])
      .map_err(|e| e.to_string())?;
    Ok(())
  }

  pub fn launch_history_insert_start(&self, instance_id: &str) -> Result<i64, String> {
    let conn = self.conn.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn
      .execute(
        "INSERT INTO launch_history(instance_id, started_at, success) VALUES(?1, ?2, 0)",
        params![instance_id, now],
      )
      .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
  }

  pub fn launch_history_finish(
    &self,
    row_id: i64,
    exit_code: Option<i32>,
    success: bool,
  ) -> Result<(), String> {
    let conn = self.conn.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn
      .execute(
        "UPDATE launch_history SET finished_at = ?1, exit_code = ?2, success = ?3 WHERE id = ?4",
        params![now, exit_code, if success { 1 } else { 0 }, row_id],
      )
      .map_err(|e| e.to_string())?;
    Ok(())
  }

  pub fn instance_touch_last_played(&self, id: &str) -> Result<(), String> {
    let conn = self.conn.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn
      .execute(
        "UPDATE instances SET last_played_at = ?1, updated_at = ?1 WHERE id = ?2",
        params![now, id],
      )
      .map_err(|e| e.to_string())?;
    Ok(())
  }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LogRow {
  pub id: i64,
  pub source: String,
  pub instance_id: Option<String>,
  pub level: String,
  pub message: String,
  pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstanceRow {
  pub id: String,
  pub name: String,
  pub minecraft_version: String,
  pub loader_type: String,
  pub loader_version: String,
  pub instance_path: String,
  pub icon: String,
  pub min_ram_mb: i64,
  pub max_ram_mb: i64,
  pub java_path: Option<String>,
  pub jvm_args: String,
  pub game_args: String,
  pub game_resolution: Option<String>,
  pub last_played_at: Option<String>,
  pub created_at: String,
  pub updated_at: String,
}

pub fn instances_list(db: &Db) -> Result<Vec<InstanceRow>, String> {
  let conn = db.conn.lock().map_err(|e| e.to_string())?;
  let mut stmt = conn
    .prepare(
      "SELECT id, name, minecraft_version, loader_type, loader_version, instance_path, icon,
              min_ram_mb, max_ram_mb, java_path, jvm_args, game_args, game_resolution,
              last_played_at, created_at, updated_at
       FROM instances ORDER BY name COLLATE NOCASE",
    )
    .map_err(|e| e.to_string())?;
  let rows = stmt
    .query_map([], |r| {
      Ok(InstanceRow {
        id: r.get(0)?,
        name: r.get(1)?,
        minecraft_version: r.get(2)?,
        loader_type: r.get(3)?,
        loader_version: r.get(4)?,
        instance_path: r.get(5)?,
        icon: r.get(6)?,
        min_ram_mb: r.get(7)?,
        max_ram_mb: r.get(8)?,
        java_path: r.get(9)?,
        jvm_args: r.get(10)?,
        game_args: r.get(11)?,
        game_resolution: r.get(12)?,
        last_played_at: r.get(13)?,
        created_at: r.get(14)?,
        updated_at: r.get(15)?,
      })
    })
    .map_err(|e| e.to_string())?;
  let mut out = Vec::new();
  for row in rows {
    out.push(row.map_err(|e| e.to_string())?);
  }
  Ok(out)
}

pub fn instance_get(db: &Db, id: &str) -> Result<Option<InstanceRow>, String> {
  let conn = db.conn.lock().map_err(|e| e.to_string())?;
  let mut stmt = conn
    .prepare(
      "SELECT id, name, minecraft_version, loader_type, loader_version, instance_path, icon,
              min_ram_mb, max_ram_mb, java_path, jvm_args, game_args, game_resolution,
              last_played_at, created_at, updated_at
       FROM instances WHERE id = ?1",
    )
    .map_err(|e| e.to_string())?;
  stmt
    .query_row(params![id], |r| {
      Ok(InstanceRow {
        id: r.get(0)?,
        name: r.get(1)?,
        minecraft_version: r.get(2)?,
        loader_type: r.get(3)?,
        loader_version: r.get(4)?,
        instance_path: r.get(5)?,
        icon: r.get(6)?,
        min_ram_mb: r.get(7)?,
        max_ram_mb: r.get(8)?,
        java_path: r.get(9)?,
        jvm_args: r.get(10)?,
        game_args: r.get(11)?,
        game_resolution: r.get(12)?,
        last_played_at: r.get(13)?,
        created_at: r.get(14)?,
        updated_at: r.get(15)?,
      })
    })
    .optional()
    .map_err(|e| e.to_string())
}

pub fn instance_delete(db: &Db, id: &str) -> Result<(), String> {
  let conn = db.conn.lock().map_err(|e| e.to_string())?;
  conn
    .execute("DELETE FROM instances WHERE id = ?1", params![id])
    .map_err(|e| e.to_string())?;
  Ok(())
}

pub fn instance_upsert(db: &Db, row: &InstanceRow) -> Result<(), String> {
  let conn = db.conn.lock().map_err(|e| e.to_string())?;
  conn
    .execute(
      "INSERT INTO instances(
        id, name, minecraft_version, loader_type, loader_version, instance_path, icon,
        min_ram_mb, max_ram_mb, java_path, jvm_args, game_args, game_resolution,
        last_played_at, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        minecraft_version = excluded.minecraft_version,
        loader_type = excluded.loader_type,
        loader_version = excluded.loader_version,
        instance_path = excluded.instance_path,
        icon = excluded.icon,
        min_ram_mb = excluded.min_ram_mb,
        max_ram_mb = excluded.max_ram_mb,
        java_path = excluded.java_path,
        jvm_args = excluded.jvm_args,
        game_args = excluded.game_args,
        game_resolution = excluded.game_resolution,
        last_played_at = excluded.last_played_at,
        updated_at = excluded.updated_at",
      params![
        row.id,
        row.name,
        row.minecraft_version,
        row.loader_type,
        row.loader_version,
        row.instance_path,
        row.icon,
        row.min_ram_mb,
        row.max_ram_mb,
        row.java_path,
        row.jvm_args,
        row.game_args,
        row.game_resolution,
        row.last_played_at,
        row.created_at,
        row.updated_at,
      ],
    )
    .map_err(|e| e.to_string())?;
  Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AccountRow {
  pub id: String,
  pub kind: String,
  pub username: String,
  pub uuid: String,
  pub is_active: bool,
  pub created_at: String,
  pub updated_at: String,
}

pub fn accounts_list(db: &Db) -> Result<Vec<AccountRow>, String> {
  let conn = db.conn.lock().map_err(|e| e.to_string())?;
  let mut stmt = conn
    .prepare(
      "SELECT id, kind, username, uuid, is_active, created_at, updated_at
       FROM accounts ORDER BY username COLLATE NOCASE",
    )
    .map_err(|e| e.to_string())?;
  let rows = stmt
    .query_map([], |r| {
      Ok(AccountRow {
        id: r.get(0)?,
        kind: r.get(1)?,
        username: r.get(2)?,
        uuid: r.get(3)?,
        is_active: r.get::<_, i64>(4)? != 0,
        created_at: r.get(5)?,
        updated_at: r.get(6)?,
      })
    })
    .map_err(|e| e.to_string())?;
  let mut out = Vec::new();
  for row in rows {
    out.push(row.map_err(|e| e.to_string())?);
  }
  Ok(out)
}

pub fn account_set_active(db: &Db, id: &str) -> Result<(), String> {
  let conn = db.conn.lock().map_err(|e| e.to_string())?;
  conn
    .execute("UPDATE accounts SET is_active = 0", [])
    .map_err(|e| e.to_string())?;
  conn
    .execute(
      "UPDATE accounts SET is_active = 1, updated_at = ?1 WHERE id = ?2",
      params![Utc::now().to_rfc3339(), id],
    )
    .map_err(|e| e.to_string())?;
  Ok(())
}

pub fn account_delete(db: &Db, id: &str) -> Result<(), String> {
  let conn = db.conn.lock().map_err(|e| e.to_string())?;
  conn
    .execute("DELETE FROM accounts WHERE id = ?1", params![id])
    .map_err(|e| e.to_string())?;
  Ok(())
}

pub fn account_insert(db: &Db, row: &AccountRow) -> Result<(), String> {
  let conn = db.conn.lock().map_err(|e| e.to_string())?;
  conn
    .execute(
      "INSERT INTO accounts(id, kind, username, uuid, is_active, created_at, updated_at)
       VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)",
      params![
        row.id,
        row.kind,
        row.username,
        row.uuid,
        if row.is_active { 1 } else { 0 },
        row.created_at,
        row.updated_at,
      ],
    )
    .map_err(|e| e.to_string())?;
  Ok(())
}

pub fn downloads_upsert(
  db: &Db,
  id: &str,
  url: &str,
  dest: &str,
  sha1: Option<&str>,
  state: &str,
  bytes_total: Option<i64>,
  bytes_done: Option<i64>,
  error: Option<&str>,
) -> Result<(), String> {
  let conn = db.conn.lock().map_err(|e| e.to_string())?;
  let now = Utc::now().to_rfc3339();
  conn
    .execute(
      "INSERT INTO downloads(id, url, dest_path, sha1, state, bytes_total, bytes_done, error, created_at, updated_at)
       VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
       ON CONFLICT(id) DO UPDATE SET
         state = excluded.state,
         bytes_total = excluded.bytes_total,
         bytes_done = excluded.bytes_done,
         error = excluded.error,
         updated_at = excluded.updated_at",
      params![
        id,
        url,
        dest,
        sha1,
        state,
        bytes_total,
        bytes_done,
        error,
        now
      ],
    )
    .map_err(|e| e.to_string())?;
  Ok(())
}
