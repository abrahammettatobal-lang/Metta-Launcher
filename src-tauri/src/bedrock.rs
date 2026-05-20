//! Minecraft Bedrock Edition (UWP) integration.
//!
//! Detection, launching and folder discovery for `Microsoft.MinecraftUWP`.
//! Strictly read-only over Microsoft Store / Xbox App installations.

use serde::Serialize;
use std::path::PathBuf;
#[cfg(windows)]
use std::process::Command;

pub const PACKAGE_FAMILY: &str = "Microsoft.MinecraftUWP_8wekyb3d8bbwe";
pub const PACKAGE_NAME: &str = "Microsoft.MinecraftUWP";
pub const STORE_PDP_URL: &str = "ms-windows-store://pdp/?productid=9NBLGGH2JHXJ";

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BedrockInstallation {
  pub installed: bool,
  pub platform_supported: bool,
  pub package_family: Option<String>,
  pub package_full_name: Option<String>,
  pub install_path: Option<String>,
  pub executable_alias: Option<String>,
  pub version: Option<String>,
  pub publisher: Option<String>,
  pub architecture: Option<String>,
  pub user_data_path: Option<String>,
  pub worlds_path: Option<String>,
  pub resource_packs_path: Option<String>,
  pub behavior_packs_path: Option<String>,
  pub skin_packs_path: Option<String>,
  pub screenshots_path: Option<String>,
  pub diagnostic: Option<String>,
}

impl BedrockInstallation {
  fn empty(diagnostic: Option<String>, platform_supported: bool) -> Self {
    Self {
      installed: false,
      platform_supported,
      package_family: None,
      package_full_name: None,
      install_path: None,
      executable_alias: None,
      version: None,
      publisher: None,
      architecture: None,
      user_data_path: None,
      worlds_path: None,
      resource_packs_path: None,
      behavior_packs_path: None,
      skin_packs_path: None,
      screenshots_path: None,
      diagnostic,
    }
  }
}

#[cfg(windows)]
fn user_data_root() -> Option<PathBuf> {
  let local = std::env::var("LOCALAPPDATA").ok()?;
  let p = PathBuf::from(local).join("Packages").join(PACKAGE_FAMILY);
  if p.exists() {
    Some(p)
  } else {
    None
  }
}

#[cfg(not(windows))]
fn user_data_root() -> Option<PathBuf> {
  None
}

#[cfg(windows)]
fn run_powershell(script: &str) -> Result<String, String> {
  let output = Command::new("powershell.exe")
    .args([
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ])
    .output()
    .map_err(|e| format!("No se pudo ejecutar PowerShell: {e}"))?;
  if !output.status.success() {
    return Err(format!(
      "PowerShell devolvió error ({}): {}",
      output.status,
      String::from_utf8_lossy(&output.stderr).trim()
    ));
  }
  Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Detect Bedrock UWP install. Always returns; check `installed` to branch.
#[cfg(windows)]
pub fn detect() -> BedrockInstallation {
  let script = "$ErrorActionPreference = 'SilentlyContinue'; \
    $p = Get-AppxPackage -Name 'Microsoft.MinecraftUWP' | Select-Object -First 1; \
    if ($null -eq $p) { return '' }; \
    $p | Select-Object Name, PackageFullName, PackageFamilyName, Version, Publisher, Architecture, InstallLocation \
      | ConvertTo-Json -Depth 3 -Compress";
  let stdout = match run_powershell(script) {
    Ok(s) => s,
    Err(e) => return BedrockInstallation::empty(Some(e), true),
  };
  if stdout.is_empty() {
    let mut info = BedrockInstallation::empty(
      Some(
        "Minecraft for Windows (Bedrock) no está instalado desde Microsoft Store/Xbox App."
          .to_string(),
      ),
      true,
    );
    info.package_family = Some(PACKAGE_FAMILY.to_string());
    if let Some(root) = user_data_root() {
      info.user_data_path = Some(root.to_string_lossy().into_owned());
    }
    return info;
  }
  let value: serde_json::Value = match serde_json::from_str(&stdout) {
    Ok(v) => v,
    Err(e) => {
      return BedrockInstallation::empty(
        Some(format!("No se pudo interpretar la respuesta de AppX: {e}")),
        true,
      )
    }
  };
  let entry = if value.is_array() {
    value
      .as_array()
      .and_then(|a| a.first())
      .cloned()
      .unwrap_or(serde_json::Value::Null)
  } else {
    value
  };

  let get_str = |k: &str| -> Option<String> {
    entry.get(k).and_then(|v| v.as_str()).map(|s| s.to_string())
  };

  let version = entry
    .get("Version")
    .and_then(|v| {
      // ConvertTo-Json may serialize Version as either string ("1.21.0.3") or
      // an object {Major,Minor,Build,Revision}; handle both.
      if let Some(s) = v.as_str() {
        Some(s.to_string())
      } else if v.is_object() {
        let major = v.get("Major").and_then(|x| x.as_i64()).unwrap_or(0);
        let minor = v.get("Minor").and_then(|x| x.as_i64()).unwrap_or(0);
        let build = v.get("Build").and_then(|x| x.as_i64()).unwrap_or(0);
        let rev = v.get("Revision").and_then(|x| x.as_i64()).unwrap_or(0);
        Some(format!("{major}.{minor}.{build}.{rev}"))
      } else {
        None
      }
    });

  let pfn = get_str("PackageFamilyName").or_else(|| Some(PACKAGE_FAMILY.to_string()));
  // Prefer the AUMID exposed by the Start menu (authoritative); fall back to
  // "<PFN>!App" if Get-StartApps doesn't return anything for diagnostics.
  let alias = match find_minecraft_aumid() {
    Ok(aumid) => Some(format!("shell:AppsFolder\\{aumid}")),
    Err(_) => pfn.as_ref().map(|n| format!("shell:AppsFolder\\{n}!App")),
  };
  let install_path = get_str("InstallLocation");
  let publisher = get_str("Publisher");
  let architecture = get_str("Architecture");
  let pkg_full = get_str("PackageFullName");

  let user_root = user_data_root();
  let worlds = user_root
    .as_ref()
    .map(|r| r.join("LocalState/games/com.mojang/minecraftWorlds"));
  let resource_packs = user_root
    .as_ref()
    .map(|r| r.join("LocalState/games/com.mojang/resource_packs"));
  let behavior_packs = user_root
    .as_ref()
    .map(|r| r.join("LocalState/games/com.mojang/behavior_packs"));
  let skin_packs = user_root
    .as_ref()
    .map(|r| r.join("LocalState/games/com.mojang/skin_packs"));
  let screenshots = user_root
    .as_ref()
    .map(|r| r.join("LocalState/games/com.mojang/screenshots"));

  let pb_str = |p: Option<PathBuf>| p.map(|p| p.to_string_lossy().into_owned());

  BedrockInstallation {
    installed: true,
    platform_supported: true,
    package_family: pfn,
    package_full_name: pkg_full,
    install_path,
    executable_alias: alias,
    version,
    publisher,
    architecture,
    user_data_path: pb_str(user_root),
    worlds_path: pb_str(worlds),
    resource_packs_path: pb_str(resource_packs),
    behavior_packs_path: pb_str(behavior_packs),
    skin_packs_path: pb_str(skin_packs),
    screenshots_path: pb_str(screenshots),
    diagnostic: None,
  }
}

#[cfg(not(windows))]
pub fn detect() -> BedrockInstallation {
  BedrockInstallation::empty(
    Some("Minecraft Bedrock solo está disponible en Windows.".to_string()),
    false,
  )
}

#[cfg(windows)]
pub fn launch() -> Result<(), String> {
  // Why we don't use simpler approaches:
  //   * `cmd /C start "" shell:AppsFolder\...!App` → cmd's delayed expansion
  //     eats the `!` and the AUMID becomes "...8wekyb3d8bbweApp".
  //   * `explorer.exe shell:AppsFolder\...!App`    → explorer *navigates* the
  //     shell namespace (and falls back to Documents) instead of activating
  //     the app.
  //   * `powershell Start-Process 'shell:...'`     → PowerShell uses
  //     `CreateProcess`, not `ShellExecute`, so the `shell:` URI fails with
  //     "El sistema no puede encontrar el archivo".
  //
  // The reliable approach is `Shell.Application::ShellExecute`, which delegates
  // to Win32 `ShellExecuteEx` and correctly resolves AppsFolder AUMIDs.
  //
  // The Application Id (the part after `!`) is *not* guaranteed to be `App`,
  // so we always query the actual AUMID from `Get-StartApps`.
  let aumid = find_minecraft_aumid()?;
  let alias = format!("shell:AppsFolder\\{aumid}");
  shell_execute_via_com(&alias)
    .map_err(|e| format!("No se pudo lanzar Minecraft Bedrock ({alias}): {e}"))
}

#[cfg(windows)]
fn find_minecraft_aumid() -> Result<String, String> {
  // `Get-StartApps` lists every entry the Start menu can activate, with its
  // canonical AUMID. We pick anything whose AppID starts with our package
  // family — that's the authoritative source.
  let script = "$ErrorActionPreference = 'Stop'; \
    $a = Get-StartApps \
      | Where-Object { $_.AppID -like 'Microsoft.MinecraftUWP_*' } \
      | Select-Object -First 1; \
    if ($null -eq $a) { '' } else { $a.AppID }";
  let aumid = run_powershell(script)?;
  if aumid.is_empty() {
    return Err(
      "No se encontró el AUMID de Minecraft Bedrock en Get-StartApps. \
       Asegúrate de que Minecraft for Windows esté instalado y aparezca en \
       el menú Inicio."
        .into(),
    );
  }
  Ok(aumid)
}

#[cfg(windows)]
fn shell_execute_via_com(target: &str) -> Result<(), String> {
  // The target is wrapped in single quotes inside a PowerShell string; escape
  // any embedded single quote per PowerShell rules.
  let escaped = target.replace('\'', "''");
  let script = format!(
    "(New-Object -ComObject Shell.Application).ShellExecute('{escaped}')"
  );
  Command::new("powershell.exe")
    .args([
      "-NoProfile",
      "-NonInteractive",
      "-WindowStyle",
      "Hidden",
      "-Command",
      &script,
    ])
    .spawn()
    .map_err(|e| e.to_string())?;
  Ok(())
}

#[cfg(not(windows))]
pub fn launch() -> Result<(), String> {
  Err("Minecraft Bedrock solo está disponible en Windows.".into())
}

fn resolve_folder(kind: &str) -> Result<PathBuf, String> {
  let root = user_data_root()
    .ok_or_else(|| "Bedrock no está instalado o sus datos no son accesibles.".to_string())?;
  let sub = match kind {
    "root" => return Ok(root),
    "worlds" => "LocalState/games/com.mojang/minecraftWorlds",
    "resourcePacks" | "resource_packs" => "LocalState/games/com.mojang/resource_packs",
    "behaviorPacks" | "behavior_packs" => "LocalState/games/com.mojang/behavior_packs",
    "skinPacks" | "skin_packs" => "LocalState/games/com.mojang/skin_packs",
    "screenshots" => "LocalState/games/com.mojang/screenshots",
    other => return Err(format!("Carpeta desconocida: {other}")),
  };
  Ok(root.join(sub))
}

#[cfg(windows)]
pub fn open_folder(kind: &str) -> Result<String, String> {
  let path = resolve_folder(kind)?;
  if !path.exists() {
    let _ = std::fs::create_dir_all(&path);
  }
  let p = path.to_string_lossy().to_string();
  Command::new("explorer.exe")
    .arg(&p)
    .spawn()
    .map_err(|e| format!("No se pudo abrir Explorer: {e}"))?;
  Ok(p)
}

#[cfg(not(windows))]
pub fn open_folder(kind: &str) -> Result<String, String> {
  let _ = kind;
  Err("Minecraft Bedrock solo está disponible en Windows.".into())
}

#[cfg(windows)]
pub fn open_store() -> Result<(), String> {
  // Same reasoning as `launch`: only Win32 ShellExecute (via the Shell COM
  // automation object) reliably resolves the `ms-windows-store://` protocol.
  shell_execute_via_com(STORE_PDP_URL)
    .map_err(|e| format!("No se pudo abrir Microsoft Store: {e}"))
}

#[cfg(not(windows))]
pub fn open_store() -> Result<(), String> {
  Err("Microsoft Store solo está disponible en Windows.".into())
}
