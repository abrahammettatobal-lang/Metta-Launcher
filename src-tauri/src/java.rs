use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaCandidate {
  pub path: String,
  pub version: Option<String>,
}

pub fn detect_java_candidates() -> Vec<JavaCandidate> {
  let mut out: Vec<JavaCandidate> = Vec::new();
  #[cfg(windows)]
  {
    if let Ok(entries) = winreg_scan() {
      out.extend(entries);
    }
  }
  if let Ok(path_var) = std::env::var("PATH") {
    for dir in std::env::split_paths(&path_var) {
      let candidate = dir.join("java.exe");
      if candidate.is_file() {
        push_unique(&mut out, candidate);
      }
      let candidate = dir.join("java");
      if candidate.is_file() {
        push_unique(&mut out, candidate);
      }
    }
  }
  out.sort_by(|a, b| a.path.cmp(&b.path));
  out
}

fn push_unique(out: &mut Vec<JavaCandidate>, path: PathBuf) {
  let s = path.to_string_lossy().to_string();
  if out.iter().any(|j| j.path == s) {
    return;
  }
  let version = read_java_version(&path).ok();
  out.push(JavaCandidate { path: s, version });
}

fn read_java_version(java_exe: &Path) -> Result<String, String> {
  let output = std::process::Command::new(java_exe)
    .arg("-version")
    .output()
    .map_err(|e| e.to_string())?;
  let stderr = String::from_utf8_lossy(&output.stderr);
  let first = stderr.lines().next().unwrap_or("").trim().to_string();
  if first.is_empty() {
    Ok("desconocida".into())
  } else {
    Ok(first)
  }
}

#[cfg(windows)]
fn winreg_scan() -> Result<Vec<JavaCandidate>, String> {
  use winreg::enums::HKEY_LOCAL_MACHINE;
  use winreg::RegKey;
  let mut found: Vec<JavaCandidate> = Vec::new();
  let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
  for base in [
    r"SOFTWARE\JavaSoft\JDK",
    r"SOFTWARE\JavaSoft\JRE",
    r"SOFTWARE\Eclipse Adoptium\JDK",
    r"SOFTWARE\Microsoft\JDK",
  ] {
    if let Ok(k) = hklm.open_subkey(base) {
      for name in k.enum_keys().filter_map(|x| x.ok()) {
        if let Ok(ver_key) = k.open_subkey(&name) {
          if let Ok(home) = ver_key.get_value::<String, _>("JavaHome") {
            let base = PathBuf::from(home);
            let exe = base.join("bin").join("java.exe");
            if exe.is_file() {
              push_unique(&mut found, exe);
            }
            let exe = base.join("bin").join("java");
            if exe.is_file() {
              push_unique(&mut found, exe);
            }
          }
        }
      }
    }
  }
  Ok(found)
}
