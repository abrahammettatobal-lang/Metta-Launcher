use crate::db::{Db, InstanceRow};
use chrono::Utc;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub const META_FILE: &str = ".metta-instance.json";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LaunchCacheFile {
  mc_version: Option<String>,
  loader_type: Option<String>,
  loader_version: Option<String>,
}

fn launcher_root(db: &Db) -> PathBuf {
  db.setting_get("launcherRoot")
    .ok()
    .flatten()
    .filter(|s| !s.trim().is_empty())
    .map(|s| crate::paths::strip_extended_path_prefix(&s))
    .map(PathBuf::from)
    .map(|p| crate::paths::normalize_launcher_root(&p))
    .unwrap_or_else(crate::paths::default_launcher_root)
}

fn instance_dir(root: &Path, instance_path: &str) -> PathBuf {
  let rel = instance_path.trim().replace('\\', "/");
  if Path::new(&rel).is_absolute() {
    PathBuf::from(rel)
  } else {
    root.join(rel)
  }
}

fn meta_path(dir: &Path) -> PathBuf {
  dir.join(META_FILE)
}

pub fn write_instance_meta(db: &Db, row: &InstanceRow) -> Result<(), String> {
  let root = launcher_root(db);
  let dir = instance_dir(&root, &row.instance_path);
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  let json = serde_json::to_string_pretty(row).map_err(|e| e.to_string())?;
  fs::write(meta_path(&dir), json).map_err(|e| e.to_string())
}

/// Publish the new directory only after its worlds and metadata have been copied.
pub fn duplicate_instance(db: &Db, id: &str) -> Result<(), String> {
  let mut row = crate::db::instance_get(db, id)?.ok_or("Instancia no encontrada")?;
  let root = launcher_root(db);
  let source = dunce::canonicalize(instance_dir(&root, &row.instance_path)).map_err(|e| e.to_string())?;
  let parent = dunce::canonicalize(root.join("instances")).map_err(|e| e.to_string())?;
  if source.parent() != Some(parent.as_path()) {
    return Err("La carpeta de origen debe estar dentro de instances.".into());
  }
  let new_id = Uuid::new_v4().to_string();
  let staging = parent.join(format!(".copy-{new_id}"));
  let dest = parent.join(&new_id);
  fs::create_dir(&staging).map_err(|e| e.to_string())?;
  let publish = (|| -> Result<(), String> {
    copy_instance_contents(&source, &staging, true).map_err(|e| e.to_string())?;
    let relative = format!("instances/{new_id}");
    if let Some(jar) = &row.custom_client_jar {
      let absolute = instance_dir(&root, jar);
      if let Ok(suffix) = absolute.strip_prefix(&source) {
        row.custom_client_jar = Some(Path::new(&relative).join(suffix).to_string_lossy().into_owned());
      }
    }
    row.id = new_id;
    row.instance_path = relative;
    row.name = format!("{} (copia)", row.name);
    row.last_played_at = None;
    row.created_at = Utc::now().to_rfc3339();
    row.updated_at = row.created_at.clone();
    fs::write(meta_path(&staging), serde_json::to_vec_pretty(&row).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    fs::rename(&staging, &dest).map_err(|e| e.to_string())
  })();
  if let Err(err) = publish {
    let _ = fs::remove_dir_all(&staging);
    return Err(err);
  }
  // Disk sync can recover a published copy if writing SQLite is interrupted.
  crate::db::instance_upsert(db, &row)
}

fn copy_instance_contents(src: &Path, dest: &Path, top: bool) -> std::io::Result<()> {
  for entry in fs::read_dir(src)? {
    let entry = entry?;
    let name = entry.file_name();
    if top && matches!(name.to_str(), Some(META_FILE | ".launch-cache.json" | ".metta-java-args.txt")) { continue; }
    let kind = entry.file_type()?;
    let target = dest.join(name);
    if kind.is_dir() {
      fs::create_dir(&target)?;
      copy_instance_contents(&entry.path(), &target, false)?;
    } else if kind.is_file() {
      fs::copy(entry.path(), target)?;
    } else {
      return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, format!("No se pudo copiar el enlace {:?}", entry.path())));
    }
  }
  Ok(())
}

fn read_instance_meta(dir: &Path) -> Option<InstanceRow> {
  let raw = fs::read_to_string(meta_path(dir)).ok()?;
  serde_json::from_str(&raw).ok()
}

fn read_launch_cache(dir: &Path) -> Option<LaunchCacheFile> {
  let raw = fs::read_to_string(dir.join(".launch-cache.json")).ok()?;
  serde_json::from_str(&raw).ok()
}

fn looks_like_instance_id(name: &str) -> bool {
  Uuid::parse_str(name).is_ok()
}

fn recovered_instance_row(id: &str, instance_path: &str) -> InstanceRow {
  let now = Utc::now().to_rfc3339();
  InstanceRow {
    id: id.to_string(),
    name: format!("Instancia {}", &id[..8.min(id.len())]),
    minecraft_version: "1.21.1".to_string(),
    loader_type: "vanilla".to_string(),
    loader_version: "1.21.1".to_string(),
    instance_path: instance_path.to_string(),
    icon: "default".to_string(),
    min_ram_mb: 1024,
    max_ram_mb: 4096,
    java_path: None,
    jvm_args: String::new(),
    game_args: String::new(),
    game_resolution: None,
    custom_client_jar: None,
    last_played_at: None,
    created_at: now.clone(),
    updated_at: now,
  }
}

fn enrich_from_launch_cache(mut row: InstanceRow, dir: &Path) -> InstanceRow {
  let Some(cache) = read_launch_cache(dir) else {
    return row;
  };
  if let Some(v) = cache.mc_version.filter(|s| !s.trim().is_empty()) {
    row.minecraft_version = v;
    if row.loader_type == "vanilla" {
      row.loader_version = row.minecraft_version.clone();
    }
  }
  if let Some(t) = cache.loader_type.filter(|s| !s.trim().is_empty()) {
    row.loader_type = t;
  }
  if let Some(v) = cache.loader_version.filter(|s| !s.trim().is_empty()) {
    row.loader_version = v;
  }
  row
}

pub fn remove_instance_files(db: &Db, row: &InstanceRow) -> Result<(), String> {
  let root = launcher_root(db);
  let dir = instance_dir(&root, &row.instance_path);
  if dir.exists() {
    fs::remove_dir_all(&dir).map_err(|e| format!("No se pudo borrar la carpeta de la instancia: {e}"))?;
  }
  Ok(())
}

/// Import instance folders from disk into SQLite and drop stale DB rows.
pub fn sync_instances_from_disk(db: &Db) -> Result<u32, String> {
  let root = launcher_root(db);
  let instances_root = root.join("instances");
  fs::create_dir_all(&instances_root).map_err(|e| e.to_string())?;

  let existing = crate::db::instances_list(db)?;
  let mut known_ids: std::collections::HashSet<String> =
    existing.iter().map(|r| r.id.clone()).collect();

  // Drop DB rows whose folder was removed manually.
  for row in &existing {
    let dir = instance_dir(&root, &row.instance_path);
    if !dir.is_dir() {
      crate::db::instance_delete(db, &row.id)?;
      known_ids.remove(&row.id);
    }
  }

  let mut imported = 0u32;
  for entry in fs::read_dir(&instances_root).map_err(|e| e.to_string())? {
    let entry = entry.map_err(|e| e.to_string())?;
    let file_type = entry.file_type().map_err(|e| e.to_string())?;
    if !file_type.is_dir() {
      continue;
    }
    let id = entry.file_name().to_string_lossy().to_string();
    if !looks_like_instance_id(&id) {
      continue;
    }
    if known_ids.contains(&id) {
      if let Some(row) = crate::db::instance_get(db, &id)? {
        let dir = entry.path();
        if !meta_path(&dir).exists() {
          write_instance_meta(db, &row)?;
        }
      }
      continue;
    }

    let rel = format!("instances/{id}");
    let dir = entry.path();
    let mut row = read_instance_meta(&dir).unwrap_or_else(|| recovered_instance_row(&id, &rel));
    row.id = id.clone();
    row.instance_path = rel;
    row = enrich_from_launch_cache(row, &dir);
    crate::db::instance_upsert(db, &row)?;
    write_instance_meta(db, &row)?;
    known_ids.insert(id);
    imported += 1;
  }

  Ok(imported)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn duplicate_copies_worlds_and_rewrites_metadata() {
    let root = std::env::temp_dir().join(format!("metta-copy-test-{}", Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    let db = Db::open(&root.join("test.db")).unwrap();
    db.setting_set("launcherRoot", root.to_str().unwrap()).unwrap();
    let id = Uuid::new_v4().to_string();
    let rel = format!("instances/{id}");
    let mut row = recovered_instance_row(&id, &rel);
    row.name = "Supervivencia".into();
    row.last_played_at = Some(Utc::now().to_rfc3339());
    crate::db::instance_upsert(&db, &row).unwrap();
    write_instance_meta(&db, &row).unwrap();
    let src = root.join(&rel);
    fs::create_dir_all(src.join("saves/mundo")).unwrap();
    fs::write(src.join("saves/mundo/level.dat"), b"world").unwrap();
    fs::write(src.join(".metta-java-args.txt"), b"session").unwrap();
    duplicate_instance(&db, &id).unwrap();
    let copy = crate::db::instances_list(&db).unwrap().into_iter().find(|r| r.id != id).unwrap();
    let dest = root.join(&copy.instance_path);
    assert_eq!(fs::read(dest.join("saves/mundo/level.dat")).unwrap(), b"world");
    assert_eq!(read_instance_meta(&dest).unwrap().id, copy.id);
    assert_eq!(copy.name, "Supervivencia (copia)");
    assert!(copy.last_played_at.is_none());
    assert!(!dest.join(".metta-java-args.txt").exists());
    drop(db);
    fs::remove_dir_all(root).unwrap();
  }
}
