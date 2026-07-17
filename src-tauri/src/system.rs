use crate::db::Db;
use crate::java;
use crate::paths;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

fn launcher_root(db: &Db) -> PathBuf {
  db
    .setting_get("launcherRoot")
    .ok()
    .flatten()
    .filter(|s| !s.trim().is_empty())
    .map(PathBuf::from)
    .unwrap_or_else(paths::default_launcher_root)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemDiagnostic {
  pub os: String,
  pub arch: String,
  pub java_candidates: Vec<java::JavaCandidate>,
  pub launcher_root: String,
  pub app_data_dir: String,
  pub tauri_version: String,
  pub launcher_version: String,
}

pub fn collect_diagnostics(db: &Db, app_data: &Path) -> SystemDiagnostic {
  let root = launcher_root(db);
  SystemDiagnostic {
    os: std::env::consts::OS.to_string(),
    arch: std::env::consts::ARCH.to_string(),
    java_candidates: java::detect_java_candidates(),
    launcher_root: root.to_string_lossy().to_string(),
    app_data_dir: app_data.to_string_lossy().to_string(),
    tauri_version: tauri::VERSION.to_string(),
    launcher_version: env!("CARGO_PKG_VERSION").to_string(),
  }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkEndpoint {
  pub name: String,
  pub url: String,
  pub ok: bool,
  pub latency_ms: Option<u64>,
  pub error: Option<String>,
}

pub async fn check_network(client: &Client) -> Vec<NetworkEndpoint> {
  let endpoints = [
    ("Mojang manifest", "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json"),
    ("Fabric Meta", "https://meta.fabricmc.net/v2/versions/loader"),
    ("Forge metadata", "https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml"),
    ("NeoForge metadata", "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml"),
    ("GitHub Releases", "https://api.github.com/repos/abrahammettatobal-lang/Metta-Launcher/releases/latest"),
  ];
  let mut out = Vec::new();
  for (name, url) in endpoints {
    let start = Instant::now();
    match client
      .get(url)
      .timeout(Duration::from_secs(12))
      .header("User-Agent", "MettaLauncher/0.4")
      .send()
      .await
    {
      Ok(r) if r.status().is_success() => out.push(NetworkEndpoint {
        name: name.into(),
        url: url.into(),
        ok: true,
        latency_ms: Some(start.elapsed().as_millis() as u64),
        error: None,
      }),
      Ok(r) => out.push(NetworkEndpoint {
        name: name.into(),
        url: url.into(),
        ok: false,
        latency_ms: Some(start.elapsed().as_millis() as u64),
        error: Some(format!("HTTP {}", r.status())),
      }),
      Err(e) => out.push(NetworkEndpoint {
        name: name.into(),
        url: url.into(),
        ok: false,
        latency_ms: None,
        error: Some(e.to_string()),
      }),
    }
  }
  out
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheClearResult {
  pub removed_files: u64,
  pub freed_bytes: u64,
  pub paths: Vec<String>,
}

pub fn clear_cache(db: &Db, include_old_logs: bool) -> Result<CacheClearResult, String> {
  let root = launcher_root(db);
  let mut removed = 0u64;
  let mut freed = 0u64;
  let mut paths = Vec::new();

  for rel in ["shared/logs/temp", "shared/downloads/failed"] {
    let p = root.join(rel);
    if p.exists() {
      let (r, f) = remove_dir_contents(&p)?;
      removed += r;
      freed += f;
      paths.push(p.to_string_lossy().to_string());
    }
  }

  if include_old_logs {
    let logs = root.join("shared/logs");
    if logs.exists() {
      let cutoff = chrono::Utc::now() - chrono::Duration::days(30);
      if let Ok(entries) = std::fs::read_dir(&logs) {
        for entry in entries.flatten() {
          let path = entry.path();
          if path.is_file() {
            if let Ok(meta) = entry.metadata() {
              if let Ok(modified) = meta.modified() {
                let ts: chrono::DateTime<chrono::Utc> = modified.into();
                if ts < cutoff {
                  let size = meta.len();
                  if std::fs::remove_file(&path).is_ok() {
                    removed += 1;
                    freed += size;
                    paths.push(path.to_string_lossy().to_string());
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  Ok(CacheClearResult {
    removed_files: removed,
    freed_bytes: freed,
    paths,
  })
}

fn remove_dir_contents(dir: &Path) -> Result<(u64, u64), String> {
  let mut removed = 0u64;
  let mut freed = 0u64;
  if !dir.exists() {
    return Ok((0, 0));
  }
  for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
    let entry = entry.map_err(|e| e.to_string())?;
    let path = entry.path();
    let meta = entry.metadata().map_err(|e| e.to_string())?;
    if meta.is_dir() {
      let (r, f) = remove_dir_contents(&path)?;
      removed += r;
      freed += f;
      let _ = std::fs::remove_dir_all(&path);
    } else {
      let size = meta.len();
      std::fs::remove_file(&path).map_err(|e| e.to_string())?;
      removed += 1;
      freed += size;
    }
  }
  Ok((removed, freed))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairReport {
  pub checks: Vec<RepairCheck>,
  pub fixed: u64,
  pub errors: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairCheck {
  pub name: String,
  pub ok: bool,
  pub detail: String,
}

pub fn repair_instance(db: &Db, instance_path: &str, mc_version: &str) -> RepairReport {
  let root = launcher_root(db);
  let inst = root.join(instance_path);
  let mut checks = Vec::new();
  let mut fixed = 0u64;
  let mut errors = Vec::new();

  let version_json = root.join(format!("shared/versions/{mc_version}/{mc_version}.json"));
  let v_ok = version_json.is_file();
  checks.push(RepairCheck {
    name: "version.json".into(),
    ok: v_ok,
    detail: if v_ok {
      "Presente".into()
    } else {
      "Falta — relanza para reinstalar".into()
    },
  });

  let client_jar = root.join(format!("shared/versions/{mc_version}/{mc_version}.jar"));
  let j_ok = client_jar.is_file();
  checks.push(RepairCheck {
    name: "client.jar".into(),
    ok: j_ok,
    detail: if j_ok {
      format!("{} bytes", client_jar.metadata().map(|m| m.len()).unwrap_or(0))
    } else {
      "Falta — relanza para reinstalar".into()
    },
  });

  for sub in ["mods", "config", "saves"] {
    let p = inst.join(sub);
    if !p.exists() {
      if std::fs::create_dir_all(&p).is_ok() {
        fixed += 1;
        checks.push(RepairCheck {
          name: sub.to_string(),
          ok: true,
          detail: "Carpeta recreada".into(),
        });
      } else {
        errors.push(format!("No se pudo crear {sub}"));
        checks.push(RepairCheck {
          name: sub.to_string(),
          ok: false,
          detail: "Error al crear".into(),
        });
      }
    } else {
      checks.push(RepairCheck {
        name: sub.to_string(),
        ok: true,
        detail: "OK".into(),
      });
    }
  }

  let assets_index = root.join("shared/assets/indexes");
  checks.push(RepairCheck {
    name: "assets".into(),
    ok: assets_index.is_dir(),
    detail: if assets_index.is_dir() {
      "Índice presente".into()
    } else {
      "Faltan assets — relanza para descargar".into()
    },
  });

  RepairReport {
    checks,
    fixed,
    errors,
  }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
  pub path: String,
  pub size_bytes: u64,
  pub created_at: String,
}

pub fn create_instance_backup(db: &Db, instance_path: &str, name: &str) -> Result<BackupInfo, String> {
  let root = launcher_root(db);
  let src = root.join(instance_path);
  if !src.is_dir() {
    return Err("La instancia no existe.".into());
  }
  let backups = root.join("backups");
  std::fs::create_dir_all(&backups).map_err(|e| e.to_string())?;
  let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
  let safe = name.replace(['/', '\\', ':'], "_");
  let zip_path = backups.join(format!("{safe}-{stamp}.zip"));

  let file = std::fs::File::create(&zip_path).map_err(|e| e.to_string())?;
  let mut zip = zip::ZipWriter::new(std::io::BufWriter::new(file));
  let options = zip::write::SimpleFileOptions::default()
    .compression_method(zip::CompressionMethod::Deflated);

  for sub in ["mods", "config", "saves", "resourcepacks", "shaderpacks", "options.txt"] {
    let p = src.join(sub);
    if p.is_dir() {
      add_dir_to_zip(&mut zip, &p, &format!("{sub}/"), options)?;
    } else if p.is_file() {
      zip.start_file(sub, options).map_err(|e| e.to_string())?;
      let data = std::fs::read(&p).map_err(|e| e.to_string())?;
      std::io::Write::write_all(&mut zip, &data).map_err(|e| e.to_string())?;
    }
  }
  for extra in backup_extra_dirs(&src) {
    if ["mods", "config", "saves", "resourcepacks", "shaderpacks"].contains(&extra.as_str()) {
      continue;
    }
    let p = src.join(&extra);
    if p.is_dir() {
      add_dir_to_zip(&mut zip, &p, &format!("{extra}/"), options)?;
    }
  }
  zip.finish().map_err(|e| e.to_string())?;
  let size = zip_path.metadata().map(|m| m.len()).unwrap_or(0);
  Ok(BackupInfo {
    path: zip_path.to_string_lossy().to_string(),
    size_bytes: size,
    created_at: chrono::Utc::now().to_rfc3339(),
  })
}

fn add_dir_to_zip(
  zip: &mut zip::ZipWriter<std::io::BufWriter<std::fs::File>>,
  dir: &Path,
  prefix: &str,
  options: zip::write::SimpleFileOptions,
) -> Result<(), String> {
  for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
    let entry = entry.map_err(|e| e.to_string())?;
    let path = entry.path();
    let name = entry.file_name().to_string_lossy().to_string();
    let rel = format!("{prefix}{name}");
    if path.is_dir() {
      add_dir_to_zip(zip, &path, &format!("{rel}/"), options)?;
    } else {
      zip.start_file(&rel, options).map_err(|e| e.to_string())?;
      let data = std::fs::read(&path).map_err(|e| e.to_string())?;
      std::io::Write::write_all(zip, &data).map_err(|e| e.to_string())?;
    }
  }
  Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherUpdateInfo {
  pub current_version: String,
  pub latest_version: Option<String>,
  pub release_url: Option<String>,
  pub changelog: Option<String>,
  pub update_available: bool,
}

pub async fn check_launcher_update(client: &Client) -> LauncherUpdateInfo {
  let current = env!("CARGO_PKG_VERSION").to_string();
  let url = "https://api.github.com/repos/abrahammettatobal-lang/Metta-Launcher/releases/latest";
  match client
    .get(url)
    .header("User-Agent", "MettaLauncher/0.4")
    .timeout(Duration::from_secs(15))
    .send()
    .await
  {
    Ok(res) if res.status().is_success() => {
      if let Ok(json) = res.json::<serde_json::Value>().await {
        let tag = json
          .get("tag_name")
          .and_then(|v| v.as_str())
          .map(|s| s.trim_start_matches('v').to_string());
        let html = json
          .get("html_url")
          .and_then(|v| v.as_str())
          .map(|s| s.to_string());
        let body = json
          .get("body")
          .and_then(|v| v.as_str())
          .map(|s| s.to_string());
        let update = tag.as_ref().map(|t| t != &current).unwrap_or(false);
        return LauncherUpdateInfo {
          current_version: current,
          latest_version: tag,
          release_url: html,
          changelog: body,
          update_available: update,
        };
      }
    }
    _ => {}
  }
  LauncherUpdateInfo {
    current_version: current,
    latest_version: None,
    release_url: None,
    changelog: None,
    update_available: false,
  }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchHistoryRow {
  pub id: i64,
  pub instance_id: String,
  pub instance_name: Option<String>,
  pub started_at: String,
  pub finished_at: Option<String>,
  pub exit_code: Option<i32>,
  pub success: bool,
}

pub fn launch_history_list(db: &Db, limit: i64) -> Result<Vec<LaunchHistoryRow>, String> {
  let conn = db.conn.lock().map_err(|e| e.to_string())?;
  let mut stmt = conn
    .prepare(
      "SELECT h.id, h.instance_id, i.name, h.started_at, h.finished_at, h.exit_code, h.success
       FROM launch_history h
       LEFT JOIN instances i ON i.id = h.instance_id
       ORDER BY h.id DESC LIMIT ?1",
    )
    .map_err(|e| e.to_string())?;
  let rows = stmt
    .query_map([limit], |r| {
      Ok(LaunchHistoryRow {
        id: r.get(0)?,
        instance_id: r.get(1)?,
        instance_name: r.get(2)?,
        started_at: r.get(3)?,
        finished_at: r.get(4)?,
        exit_code: r.get(5)?,
        success: r.get::<_, i64>(6)? != 0,
      })
    })
    .map_err(|e| e.to_string())?;
  let mut out = Vec::new();
  for row in rows {
    out.push(row.map_err(|e| e.to_string())?);
  }
  Ok(out)
}

pub fn recommended_java_major(mc_version: &str) -> u8 {
  let trimmed = mc_version.trim();
  if trimmed.starts_with("rd-") {
    return 8;
  }
  if trimmed.starts_with('a') || trimmed.contains("alpha") {
    return 8;
  }
  if trimmed.starts_with('b') && !trimmed.starts_with("build") {
    return 8;
  }

  let parts: Vec<u32> = trimmed
    .split('.')
    .filter_map(|p| {
      p.chars()
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>()
        .parse()
        .ok()
    })
    .collect();
  if parts.is_empty() {
    return 8;
  }
  // Minecraft 26+ (class file 69) requires Java 25.
  if parts[0] >= 26 {
    return 25;
  }
  // Other post-1.x versioning (future-proof).
  if parts[0] > 1 {
    return 21;
  }
  // Classic 1.x scheme.
  if parts.len() >= 2 {
    let minor = parts[1];
    if minor >= 21 || (parts.len() >= 3 && parts[1] == 20 && parts[2] >= 5) {
      return 21;
    }
    if minor >= 18 {
      return 17;
    }
    if minor == 17 {
      return 16;
    }
  }
  8
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModMetadata {
  pub mod_id: Option<String>,
  pub name: Option<String>,
  pub version: Option<String>,
  pub loader: Option<String>,
}

pub fn parse_mod_jar(jar_path: &Path) -> ModMetadata {
  let file = match std::fs::File::open(jar_path) {
    Ok(f) => f,
    Err(_) => return empty_mod_meta(),
  };
  let mut archive = match zip::ZipArchive::new(std::io::BufReader::new(file)) {
    Ok(a) => a,
    Err(_) => return empty_mod_meta(),
  };
  if let Ok(mut f) = archive.by_name("fabric.mod.json") {
    if let Ok(text) = read_zip_entry(&mut f) {
      if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
        return ModMetadata {
          mod_id: v.get("id").and_then(|x| x.as_str()).map(String::from),
          name: v
            .get("name")
            .and_then(|x| x.as_str())
            .map(String::from)
            .or_else(|| v.get("id").and_then(|x| x.as_str()).map(String::from)),
          version: v.get("version").and_then(|x| x.as_str()).map(String::from),
          loader: Some("fabric".into()),
        };
      }
    }
  }
  for entry in ["META-INF/mods.toml", "META-INF/neoforge.mods.toml"] {
    if let Ok(mut f) = archive.by_name(entry) {
      if let Ok(text) = read_zip_entry(&mut f) {
        let loader = if entry.contains("neoforge") {
          "neoforge"
        } else {
          "forge"
        };
        let mod_id = parse_toml_field(&text, "modId");
        let name = parse_toml_field(&text, "displayName").or_else(|| mod_id.clone());
        let version = parse_toml_field(&text, "version");
        return ModMetadata {
          mod_id,
          name,
          version,
          loader: Some(loader.into()),
        };
      }
    }
  }
  empty_mod_meta()
}

fn empty_mod_meta() -> ModMetadata {
  ModMetadata {
    mod_id: None,
    name: None,
    version: None,
    loader: None,
  }
}

fn read_zip_entry(f: &mut zip::read::ZipFile<'_>) -> Result<String, String> {
  let mut buf = String::new();
  std::io::Read::read_to_string(f, &mut buf).map_err(|e| e.to_string())?;
  Ok(buf)
}

fn parse_toml_field(text: &str, key: &str) -> Option<String> {
  for line in text.lines() {
    let t = line.trim();
    if t.starts_with('#') || !t.contains('=') {
      continue;
    }
    let (k, v) = t.split_once('=')?;
    if k.trim() != key {
      continue;
    }
    let val = v.trim().trim_matches('"').trim_matches('\'');
    if !val.is_empty() {
      return Some(val.to_string());
    }
  }
  None
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupListItem {
  pub path: String,
  pub name: String,
  pub size_bytes: u64,
  pub modified_at: String,
}

pub fn list_backups(db: &Db) -> Result<Vec<BackupListItem>, String> {
  let root = launcher_root(db);
  let dir = root.join("backups");
  if !dir.is_dir() {
    return Ok(Vec::new());
  }
  let mut out = Vec::new();
  for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
    let entry = entry.map_err(|e| e.to_string())?;
    let path = entry.path();
    if !path.is_file() {
      continue;
    }
    if path.extension().and_then(|e| e.to_str()) != Some("zip") {
      continue;
    }
    let meta = entry.metadata().map_err(|e| e.to_string())?;
    let modified: chrono::DateTime<chrono::Utc> = meta.modified().map_err(|e| e.to_string())?.into();
    out.push(BackupListItem {
      path: path.to_string_lossy().to_string(),
      name: entry.file_name().to_string_lossy().to_string(),
      size_bytes: meta.len(),
      modified_at: modified.to_rfc3339(),
    });
  }
  out.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
  Ok(out)
}

pub fn restore_instance_backup(db: &Db, zip_path: &str, instance_path: &str) -> Result<(), String> {
  let root = launcher_root(db);
  let zip_p = PathBuf::from(zip_path);
  if !zip_p.is_file() {
    return Err("El archivo ZIP no existe.".into());
  }
  let dest = root.join(instance_path);
  std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
  extract_zip_file(&zip_p, &dest)
}

fn backup_extra_dirs(instance_root: &Path) -> Vec<String> {
  const KNOWN: &[&str] = &[
    "defaultconfigs",
    "kubejs",
    "scripts",
    "datapacks",
    "ftbquests",
    "patchouli_books",
    "global_data_packs",
    "global_packs",
    "blueprints",
    "schematics",
    "journeymap",
    "local",
    "modernfix",
    "serverconfig",
    "essential",
    "fancymenu_data",
    "patchouli",
    "emotes",
  ];
  let mut out: Vec<String> = KNOWN.iter().map(|s| (*s).to_string()).collect();
  if let Ok(entries) = std::fs::read_dir(instance_root) {
    for entry in entries.flatten() {
      let name = entry.file_name().to_string_lossy().to_string();
      if name.starts_with('.') {
        continue;
      }
      if entry.path().is_dir() && !out.iter().any(|x| x == &name) {
        out.push(name);
      }
    }
  }
  out
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModpackDetectResult {
  pub pack_root: String,
  pub manifest_path: Option<String>,
  pub kind: String,
  pub minecraft_version: Option<String>,
  pub loader_type: Option<String>,
  pub loader_version: Option<String>,
  pub mod_count: u32,
  pub suggested_name: Option<String>,
}

fn looks_like_mc_version(name: &str) -> bool {
  let parts: Vec<&str> = name.split('.').collect();
  if parts.len() < 2 || parts.len() > 3 {
    return false;
  }
  parts.iter().all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()))
}

fn count_mod_jars(mods_dir: &Path) -> u32 {
  if !mods_dir.is_dir() {
    return 0;
  }
  let mut count = 0u32;
  let Ok(entries) = std::fs::read_dir(mods_dir) else {
    return 0;
  };
  for entry in entries.flatten() {
    let path = entry.path();
    if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("jar") {
      count += 1;
    } else if path.is_dir() {
      count += count_mod_jars(&path);
    }
  }
  count
}

fn infer_loader_from_mods_dir(mods_dir: &Path) -> Option<String> {
  if !mods_dir.is_dir() {
    return None;
  }
  let Ok(entries) = std::fs::read_dir(mods_dir) else {
    return None;
  };
  for entry in entries.flatten() {
    let path = entry.path();
    if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("jar") {
      let meta = parse_mod_jar(&path);
      if let Some(loader) = meta.loader {
        return Some(loader);
      }
    } else if path.is_dir() {
      if let Some(loader) = infer_loader_from_mods_dir(&path) {
        return Some(loader);
      }
    }
  }
  None
}

fn infer_mc_from_mods_dir(mods_dir: &Path) -> Option<String> {
  if !mods_dir.is_dir() {
    return None;
  }
  let Ok(entries) = std::fs::read_dir(mods_dir) else {
    return None;
  };
  for entry in entries.flatten() {
    let name = entry.file_name().to_string_lossy().to_string();
    if entry.path().is_dir() && looks_like_mc_version(&name) {
      return Some(name);
    }
  }
  None
}

fn detect_bundled_meta(pack_root: &Path) -> ModpackDetectResult {
  let mut minecraft_version = None;
  let mut loader_type = None;
  let mut loader_version = None;

  if let Ok(entries) = std::fs::read_dir(pack_root) {
    for entry in entries.flatten() {
      let name = entry.file_name().to_string_lossy().to_string();
      let lower = name.to_lowercase();
      if lower.starts_with("minecraft_server.") && lower.ends_with(".jar") {
        let ver = name
          .strip_prefix("minecraft_server.")
          .and_then(|s| s.strip_suffix(".jar"));
        minecraft_version = ver.map(String::from);
        if loader_type.is_none() {
          loader_type = Some("forge".into());
        }
      }
      if lower.starts_with("fabric-loader") && lower.ends_with(".jar") {
        loader_type = Some("fabric".into());
        if let Some(rest) = lower.strip_prefix("fabric-loader-") {
          loader_version = rest.strip_suffix(".jar").map(String::from);
        }
      }
      if lower.starts_with("neoforge-") && lower.ends_with("-installer.jar") {
        loader_type = Some("neoforge".into());
      }
    }
  }

  let mods_dir = pack_root.join("mods");
  let mod_count = count_mod_jars(&mods_dir);

  if pack_root.join("config").join("forge.cfg").is_file() {
    loader_type.get_or_insert_with(|| "forge".into());
  }

  if loader_type.is_none() {
    loader_type = infer_loader_from_mods_dir(&mods_dir);
  }
  if loader_type.is_none() && mod_count > 0 {
    loader_type = Some("forge".into());
  }

  if minecraft_version.is_none() {
    minecraft_version = infer_mc_from_mods_dir(&mods_dir);
  }

  let suggested_name = pack_root
    .file_name()
    .map(|s| s.to_string_lossy().into_owned());

  ModpackDetectResult {
    pack_root: pack_root.to_string_lossy().into_owned(),
    manifest_path: None,
    kind: "bundled".into(),
    minecraft_version,
    loader_type,
    loader_version,
    mod_count,
    suggested_name,
  }
}

fn curseforge_detect_result(pack_root: &Path, manifest_path: &Path) -> ModpackDetectResult {
  ModpackDetectResult {
    pack_root: pack_root.to_string_lossy().into_owned(),
    manifest_path: Some(manifest_path.to_string_lossy().into_owned()),
    kind: "curseforge".into(),
    minecraft_version: None,
    loader_type: None,
    loader_version: None,
    mod_count: 0,
    suggested_name: None,
  }
}

fn detect_zip_content_prefix(entries: &[String]) -> String {
  let mut roots: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
  for entry in entries {
    if entry.ends_with('/') {
      continue;
    }
    if let Some((root, _)) = entry.split_once('/') {
      if !root.is_empty() {
        roots.insert(format!("{root}/"));
      }
    }
  }
  if roots.len() == 1 {
    if let Some(root) = roots.iter().next() {
      let has_nested_pack = entries.iter().any(|e| {
        e.starts_with(root)
          && (e.contains("/mods/") || e.ends_with("manifest.json"))
      });
      if has_nested_pack {
        return root.clone();
      }
    }
  }
  String::new()
}

fn zip_entry_matches(entries: &[String], prefix: &str, suffix: &str) -> bool {
  entries
    .iter()
    .any(|e| e == suffix || e == &format!("{prefix}{suffix}") || e.ends_with(suffix))
}

fn detect_bundled_from_zip_entries(entries: &[String], prefix: &str) -> ModpackDetectResult {
  let mut minecraft_version = None;
  let mut loader_type = None;
  let mut loader_version = None;
  let mut mod_count = 0u32;

  for entry in entries {
    if entry.contains("__MACOSX") {
      continue;
    }
    let entry_lower = entry.to_lowercase();
    let file_name = entry.rsplit('/').next().unwrap_or(entry);
    let lower = file_name.to_lowercase();
    if lower.starts_with("minecraft_server.") && lower.ends_with(".jar") {
      minecraft_version = file_name
        .strip_prefix("minecraft_server.")
        .and_then(|s| s.strip_suffix(".jar"))
        .map(String::from);
      loader_type.get_or_insert_with(|| "forge".into());
    }
    if lower.starts_with("fabric-loader") && lower.ends_with(".jar") {
      loader_type = Some("fabric".into());
      if let Some(rest) = lower.strip_prefix("fabric-loader-") {
        loader_version = rest.strip_suffix(".jar").map(String::from);
      }
    }
    if (entry_lower.starts_with("mods/") || entry_lower.contains("/mods/"))
      && entry_lower.ends_with(".jar")
      && !entry_lower.contains("/meta-inf/")
    {
      mod_count += 1;
    }
    if entry_lower.ends_with("config/forge.cfg") || entry_lower == "config/forge.cfg" {
      loader_type.get_or_insert_with(|| "forge".into());
    }
    if entry_lower.contains("/mods/") || entry_lower.starts_with("mods/") {
      let mods_tail = entry_lower
        .strip_prefix("mods/")
        .or_else(|| entry_lower.split("/mods/").nth(1))
        .unwrap_or("");
      if let Some(sub) = mods_tail.split('/').next() {
        if looks_like_mc_version(sub) {
          minecraft_version.get_or_insert_with(|| sub.to_string());
        }
      }
    }
  }

  if loader_type.is_none() && mod_count > 0 {
    loader_type = Some("forge".into());
  }

  ModpackDetectResult {
    pack_root: prefix.trim_end_matches('/').to_string(),
    manifest_path: None,
    kind: "bundled".into(),
    minecraft_version,
    loader_type,
    loader_version,
    mod_count,
    suggested_name: None,
  }
}

pub fn modpack_detect_root(path: &str) -> Result<ModpackDetectResult, String> {
  let base = PathBuf::from(path);
  if !base.is_dir() {
    return Err("La ruta no es una carpeta válida.".into());
  }

  let direct = base.join("manifest.json");
  if direct.is_file() {
    return Ok(curseforge_detect_result(&base, &direct));
  }

  if base.join("mods").is_dir() && count_mod_jars(&base.join("mods")) > 0 {
    return Ok(detect_bundled_meta(&base));
  }

  let entries = std::fs::read_dir(&base).map_err(|e| e.to_string())?;
  for entry in entries.flatten() {
    let child = entry.path();
    if !child.is_dir() {
      continue;
    }
    let manifest = child.join("manifest.json");
    if manifest.is_file() {
      return Ok(curseforge_detect_result(&child, &manifest));
    }
    if child.join("mods").is_dir() && count_mod_jars(&child.join("mods")) > 0 {
      return Ok(detect_bundled_meta(&child));
    }
  }

  Err(
    "No se reconoció el modpack: falta manifest.json (CurseForge) o una carpeta mods/ con archivos .jar.".into(),
  )
}

pub fn modpack_inspect_zip(zip_path: &str) -> Result<ModpackDetectResult, String> {
  let zip_p = PathBuf::from(zip_path);
  if !zip_p.is_file() {
    return Err("El archivo ZIP no existe.".into());
  }
  let file = std::fs::File::open(&zip_p).map_err(|e| e.to_string())?;
  let mut archive =
    zip::ZipArchive::new(std::io::BufReader::new(file)).map_err(|e| e.to_string())?;
  let mut entries: Vec<String> = Vec::with_capacity(archive.len());
  for i in 0..archive.len() {
    let f = archive.by_index(i).map_err(|e| e.to_string())?;
    entries.push(f.name().to_string());
  }

  let prefix = detect_zip_content_prefix(&entries);
  if zip_entry_matches(&entries, &prefix, "manifest.json") {
    let pack_root = if prefix.is_empty() {
      ".".into()
    } else {
      prefix.trim_end_matches('/').to_string()
    };
    return Ok(ModpackDetectResult {
      pack_root,
      manifest_path: Some(if prefix.is_empty() {
        "manifest.json".into()
      } else {
        format!("{prefix}manifest.json")
      }),
      kind: "curseforge".into(),
      minecraft_version: None,
      loader_type: None,
      loader_version: None,
      mod_count: 0,
      suggested_name: zip_p
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned()),
    });
  }

  let has_mods = entries.iter().any(|e| {
    !e.contains("__MACOSX")
      && e.ends_with(".jar")
      && (e.contains("/mods/") || e.starts_with("mods/"))
  });
  if !has_mods {
    return Err(
      "El ZIP no contiene manifest.json (CurseForge) ni mods/ con archivos .jar.".into(),
    );
  }

  let mut result = detect_bundled_from_zip_entries(&entries, &prefix);
  if result.suggested_name.is_none() {
    result.suggested_name = zip_p
      .file_stem()
      .map(|s| s.to_string_lossy().into_owned());
  }
  Ok(result)
}

pub fn modpack_read_manifest(pack_root: &str) -> Result<String, String> {
  let manifest = PathBuf::from(pack_root).join("manifest.json");
  if !manifest.is_file() {
    return Err("manifest.json no encontrado en la raíz del modpack.".into());
  }
  std::fs::read_to_string(&manifest).map_err(|e| e.to_string())
}

pub fn modpack_copy_overrides(pack_root: &str, instance_rel: &str, db: &Db) -> Result<(), String> {
  let root = launcher_root(db);
  let pack = PathBuf::from(pack_root);
  let overrides = pack.join("overrides");
  if !overrides.is_dir() {
    return Ok(());
  }
  let dest = root.join(instance_rel);
  std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
  copy_dir_merge(&overrides, &dest)
}

fn postprocess_bundled_instance(instance_root: &Path, launcher_data_root: &Path) -> Result<(), String> {
  for sub in ["mods", "config", "saves", "resourcepacks", "shaderpacks"] {
    let p = instance_root.join(sub);
    if !p.exists() {
      std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    }
  }

  let bundled_libraries = instance_root.join("libraries");
  if bundled_libraries.is_dir() {
    let shared_libraries = launcher_data_root.join("shared/libraries");
    std::fs::create_dir_all(&shared_libraries).map_err(|e| e.to_string())?;
    copy_dir_merge(&bundled_libraries, &shared_libraries)?;
  }

  let world = instance_root.join("world");
  let saves = instance_root.join("saves");
  if world.is_dir() {
    std::fs::create_dir_all(&saves).map_err(|e| e.to_string())?;
    let target = saves.join("World");
    if !target.exists() {
      copy_dir_merge(&world, &target)?;
    }
  }
  Ok(())
}

pub fn modpack_count_mod_jars(instance_rel: &str, db: &Db) -> Result<u32, String> {
  let root = launcher_root(db);
  let mods_dir = root.join(instance_rel).join("mods");
  Ok(count_mod_jars(&mods_dir))
}

pub fn modpack_postprocess_instance(instance_rel: &str, db: &Db) -> Result<(), String> {
  let root = launcher_root(db);
  let dest = root.join(instance_rel);
  postprocess_bundled_instance(&dest, &root)
}

pub fn modpack_copy_tree(pack_root: &str, instance_rel: &str, db: &Db) -> Result<(), String> {
  let root = launcher_root(db);
  let pack = PathBuf::from(pack_root);
  if !pack.is_dir() {
    return Err("La carpeta del modpack no existe.".into());
  }
  let dest = root.join(instance_rel);
  std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
  copy_dir_merge(&pack, &dest)?;
  postprocess_bundled_instance(&dest, &root)
}

fn copy_dir_merge(src: &Path, dest: &Path) -> Result<(), String> {
  for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
    let entry = entry.map_err(|e| e.to_string())?;
    let from = entry.path();
    let to = dest.join(entry.file_name());
    if from.is_dir() {
      std::fs::create_dir_all(&to).map_err(|e| e.to_string())?;
      copy_dir_merge(&from, &to)?;
    } else if from.is_file() {
      if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
      }
      std::fs::copy(&from, &to).map_err(|e| format!("No se pudo copiar {:?}: {e}", from))?;
    }
  }
  Ok(())
}

pub fn import_instance_zip(db: &Db, zip_path: &str, folder_name: &str) -> Result<String, String> {
  let root = launcher_root(db);
  let zip_p = PathBuf::from(zip_path);
  if !zip_p.is_file() {
    return Err("El archivo ZIP no existe.".into());
  }
  let _safe = folder_name
    .chars()
    .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
    .collect::<String>();
  let id = uuid::Uuid::new_v4().to_string();
  let rel = format!("instances/{id}");
  let dest = root.join(&rel);
  std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
  extract_zip_file(&zip_p, &dest)?;
  postprocess_bundled_instance(&dest, &root)?;
  Ok(rel)
}

fn extract_zip_file(zip_path: &Path, out_dir: &Path) -> Result<(), String> {
  let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
  let mut archive =
    zip::ZipArchive::new(std::io::BufReader::new(file)).map_err(|e| e.to_string())?;
  for i in 0..archive.len() {
    let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
    let outpath = match file.enclosed_name() {
      Some(p) => out_dir.join(p),
      None => continue,
    };
    if file.name().ends_with('/') {
      std::fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
    } else {
      if let Some(parent) = outpath.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
      }
      let mut outfile = std::fs::File::create(&outpath).map_err(|e| e.to_string())?;
      std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
    }
  }
  Ok(())
}

#[cfg(test)]
mod modpack_probe_tests {
  use super::*;

  #[test]
  fn blightfall_zip_is_bundled_forge_1710() {
    let path = r"c:\Users\USER\Downloads\Blightfall_Server_3.1.1-CE.zip";
    if !Path::new(path).is_file() {
      return;
    }
    let result = modpack_inspect_zip(path).expect("inspect zip");
    assert_eq!(result.kind, "bundled");
    assert_eq!(result.minecraft_version.as_deref(), Some("1.7.10"));
    assert_eq!(result.loader_type.as_deref(), Some("forge"));
    assert!(result.mod_count > 50);
  }
}
