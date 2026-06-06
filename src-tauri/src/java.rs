use serde::Serialize;
use std::io;
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
  out.sort_by(|a, b| {
    let ma = parse_major_from_version(a.version.as_deref());
    let mb = parse_major_from_version(b.version.as_deref());
    score_java_major(mb).cmp(&score_java_major(ma)).then(a.path.cmp(&b.path))
  });
  out
}

fn parse_major_from_version(version: Option<&str>) -> Option<u32> {
  let v = version?;
  v.split('"').nth(1)?.parse().ok()
}

fn score_java_major(major: Option<u32>) -> i32 {
  match major {
    Some(25) => 100,
    Some(21) => 95,
    Some(17) => 90,
    Some(8) => 50,
    Some(m) if (18..=26).contains(&m) => 40,
    Some(_) => 20,
    None => 10,
  }
}

fn push_unique(out: &mut Vec<JavaCandidate>, path: PathBuf) {
  let s = path.to_string_lossy().to_string();
  if out.iter().any(|j| j.path == s) {
    return;
  }
  if !path.is_file() {
    return;
  }
  // Omitir instalaciones a las que no podemos ejecutar java -version (permisos, ruta rota).
  let Ok(version) = read_java_version(&path) else {
    return;
  };
  out.push(JavaCandidate {
    path: s,
    version: Some(version),
  });
}

/// Resuelve una ruta de Java (absoluta o relativa al launcher) y valida que exista.
pub fn resolve_java_executable(launcher_root: &Path, raw: &str) -> Result<PathBuf, String> {
  let trimmed = raw.trim();
  if trimmed.is_empty() {
    return Err("No se especificó la ruta de Java.".into());
  }

  let candidate = Path::new(trimmed);
  let resolved = if candidate.is_absolute() {
    candidate.to_path_buf()
  } else {
    launcher_root.join(candidate)
  };

  if !resolved.exists() {
    return Err(format!(
      "No se encontró Java en:\n{}\n\nComprueba Ajustes → Java, pulsa «Detectar Java» o deja la ruta vacía para descargarlo automáticamente.",
      resolved.display()
    ));
  }

  let canonical =
    dunce::canonicalize(&resolved).map_err(|e| map_java_access_error(&resolved, e))?;

  if !canonical.is_file() {
    return Err(format!(
      "La ruta de Java no es un ejecutable:\n{}",
      canonical.display()
    ));
  }

  Ok(dunce::simplified(&canonical).to_path_buf())
}

pub fn map_java_access_error(path: &Path, err: io::Error) -> String {
  let display = path.display();
  if err.kind() == io::ErrorKind::PermissionDenied {
    return format!(
      "Sin permiso para acceder a Java en:\n{display}\n\nPrueba ejecutar Metta Launcher como administrador, revisa el antivirus o elige otra instalación en Ajustes → Java."
    );
  }
  format!("No se pudo acceder a Java ({display}): {err}")
}

pub fn map_java_spawn_error(java: &str, err: io::Error) -> String {
  let msg = err.to_string();
  let lower = msg.to_lowercase();
  if err.kind() == io::ErrorKind::PermissionDenied
    || lower.contains("acceso denegado")
    || lower.contains("access is denied")
    || lower.contains("permission denied")
  {
    return format!(
      "Sin permiso para ejecutar Java:\n{java}\n\nPrueba ejecutar Metta Launcher como administrador, revisa el antivirus o cambia la ruta de Java en Ajustes."
    );
  }
  format!("No se pudo iniciar Java ({java}): {msg}")
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
