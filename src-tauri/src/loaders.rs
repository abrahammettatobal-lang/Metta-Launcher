use crate::AppState;
use serde::Deserialize;
use tauri::State;

#[derive(Deserialize)]
struct NeoForgeVersionsResponse {
  versions: Vec<String>,
}

fn cmp_version_desc(a: &str, b: &str) -> std::cmp::Ordering {
  let pa: Vec<u32> = a
    .split(|c: char| !c.is_ascii_digit())
    .filter(|s| !s.is_empty())
    .filter_map(|s| s.parse().ok())
    .collect();
  let pb: Vec<u32> = b
    .split(|c: char| !c.is_ascii_digit())
    .filter(|s| !s.is_empty())
    .filter_map(|s| s.parse().ok())
    .collect();
  let n = pa.len().max(pb.len());
  for i in 0..n {
    let av = *pa.get(i).unwrap_or(&0);
    let bv = *pb.get(i).unwrap_or(&0);
    if av != bv {
      return bv.cmp(&av);
    }
  }
  std::cmp::Ordering::Equal
}

fn neo_series_prefix(mc_version: &str) -> Option<String> {
  if let Some(rest) = mc_version.strip_prefix("1.") {
    let parts: Vec<&str> = rest.split('.').collect();
    if parts.is_empty() {
      return None;
    }
    let minor = parts[0];
    let patch = parts.get(1).copied().unwrap_or("0");
    return Some(format!("{minor}.{patch}."));
  }
  // New Minecraft versioning (26.1.2, 26.2, 26.2-rc-1, …) — NeoForge shares the base prefix.
  let base = mc_version.split('-').next()?.trim();
  if base.contains('.') {
    return Some(format!("{base}."));
  }
  None
}

fn neoforge_for_mc(stable: &[String], all: &[String], mc_version: &str) -> Vec<String> {
  let Some(prefix) = neo_series_prefix(mc_version) else {
    return Vec::new();
  };

  let stable_filtered: Vec<String> = stable
    .iter()
    .filter(|v| v.starts_with(&prefix))
    .cloned()
    .collect();
  if !stable_filtered.is_empty() {
    return stable_filtered;
  }

  // No stable NeoForge builds for this MC line yet (e.g. 26.2 only has betas).
  all.iter()
    .filter(|v| v.starts_with(&prefix))
    .cloned()
    .collect()
}

fn is_stable_loader_version(v: &str) -> bool {
  let lower = v.to_lowercase();
  !lower.contains("beta") && !lower.contains("-rc") && !lower.contains("-pre")
}

#[tauri::command]
pub async fn forge_list_versions(
  state: State<'_, AppState>,
  mc_version: String,
) -> Result<Vec<String>, String> {
  let url = "https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml";
  let text = state
    .http
    .get(url)
    .send()
    .await
    .map_err(|e| format!("Red Forge: {e}"))?
    .text()
    .await
    .map_err(|e| format!("Forge metadata: {e}"))?;

  let prefix = format!("{mc_version}-");
  let mut out: Vec<String> = Vec::new();
  for line in text.lines() {
    let line = line.trim();
    if let Some(inner) = line.strip_prefix("<version>").and_then(|s| s.strip_suffix("</version>")) {
      let v = inner.trim();
      if v.starts_with(&prefix) {
        out.push(v.to_string());
      }
    }
  }
  out.sort_by(|a, b| cmp_version_desc(a, b));
  Ok(out)
}

#[tauri::command]
pub async fn neoforge_list_versions(
  state: State<'_, AppState>,
  mc_version: Option<String>,
) -> Result<Vec<String>, String> {
  let url = "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge";
  let resp = state
    .http
    .get(url)
    .send()
    .await
    .map_err(|e| format!("Red NeoForge: {e}"))?
    .json::<NeoForgeVersionsResponse>()
    .await
    .map_err(|e| format!("NeoForge metadata: {e}"))?;

  let mut all_versions = resp.versions;
  all_versions.sort_by(|a, b| cmp_version_desc(a, b));

  let stable: Vec<String> = all_versions
    .iter()
    .filter(|v| is_stable_loader_version(v))
    .cloned()
    .collect();

  if let Some(mc) = mc_version {
    let filtered = neoforge_for_mc(&stable, &all_versions, &mc);
    if !filtered.is_empty() {
      return Ok(filtered);
    }
  }

  Ok(stable.into_iter().take(200).collect())
}
