use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureTarget {
  pub mode: String,
  pub hwnd: Option<isize>,
  pub title: Option<String>,
  pub monitor_index: u32,
  pub width: u32,
  pub height: u32,
  pub offset_x: i32,
  pub offset_y: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
  pub index: u32,
  pub name: String,
  pub width: u32,
  pub height: u32,
  pub offset_x: i32,
  pub offset_y: i32,
  pub primary: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftWindowInfo {
  pub found: bool,
  pub hwnd: Option<isize>,
  pub title: Option<String>,
  pub width: u32,
  pub height: u32,
  pub offset_x: i32,
  pub offset_y: i32,
  pub pid: Option<u32>,
}

pub fn list_monitors() -> Vec<MonitorInfo> {
  #[cfg(windows)]
  {
    return windows_monitors();
  }
  #[cfg(not(windows))]
  {
    vec![MonitorInfo {
      index: 0,
      name: "Monitor principal".into(),
      width: 1920,
      height: 1080,
      offset_x: 0,
      offset_y: 0,
      primary: true,
    }]
  }
}

pub fn find_minecraft_window(game_pid: Option<u32>) -> MinecraftWindowInfo {
  #[cfg(windows)]
  {
    return windows_find_minecraft(game_pid);
  }
  #[cfg(not(windows))]
  {
    let _ = game_pid;
    MinecraftWindowInfo {
      found: false,
      hwnd: None,
      title: None,
      width: 0,
      height: 0,
      offset_x: 0,
      offset_y: 0,
      pid: None,
    }
  }
}

pub fn resolve_capture_target(
  capture_mode: &str,
  game_pid: Option<u32>,
  monitor_index: u32,
) -> Result<CaptureTarget, String> {
  if capture_mode == "monitor" {
    let monitors = list_monitors();
    let mon = monitors
      .iter()
      .find(|m| m.index == monitor_index)
      .or_else(|| monitors.first())
      .ok_or_else(|| "No se encontró ningún monitor.".to_string())?;
    return Ok(CaptureTarget {
      mode: "monitor".into(),
      hwnd: None,
      title: None,
      monitor_index: mon.index,
      width: mon.width,
      height: mon.height,
      offset_x: mon.offset_x,
      offset_y: mon.offset_y,
    });
  }

  let win = find_minecraft_window(game_pid);
  if win.found {
    return Ok(CaptureTarget {
      mode: "window".into(),
      hwnd: win.hwnd,
      title: win.title.clone(),
      monitor_index: 0,
      width: win.width,
      height: win.height,
      offset_x: win.offset_x,
      offset_y: win.offset_y,
    });
  }

  if capture_mode == "window" {
    return Err(
      "No se encontró la ventana de Minecraft. Inicia el juego o cambia a captura de monitor."
        .into(),
    );
  }

  let monitors = list_monitors();
  let mon = monitors
    .iter()
    .find(|m| m.index == monitor_index)
    .or_else(|| monitors.first())
    .ok_or_else(|| "No se encontró ningún monitor.".to_string())?;
  Ok(CaptureTarget {
    mode: "monitor".into(),
    hwnd: None,
    title: None,
    monitor_index: mon.index,
    width: mon.width,
    height: mon.height,
    offset_x: mon.offset_x,
    offset_y: mon.offset_y,
  })
}

#[cfg(windows)]
fn windows_monitors() -> Vec<MonitorInfo> {
  use windows::Win32::Foundation::{BOOL, LPARAM, RECT};
  use windows::Win32::Graphics::Gdi::{
    EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFOEXW,
  };

  let mut monitors: Vec<MonitorInfo> = Vec::new();

  unsafe extern "system" fn callback(
    hmon: HMONITOR,
    _hdc: HDC,
    _rect: *mut RECT,
    lparam: LPARAM,
  ) -> BOOL {
    let list = &mut *(lparam.0 as *mut Vec<MonitorInfo>);
    let idx = list.len() as u32;

    let mut info = MONITORINFOEXW::default();
    info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
    if !GetMonitorInfoW(hmon, &mut info as *mut _ as *mut _).as_bool() {
      return BOOL(1);
    }

    let rect = info.monitorInfo.rcMonitor;
    let name = String::from_utf16_lossy(
      &info
        .szDevice
        .iter()
        .take_while(|&&c| c != 0)
        .copied()
        .collect::<Vec<_>>(),
    );
    let primary = (info.monitorInfo.dwFlags & 1) != 0;

    list.push(MonitorInfo {
      index: idx,
      name: if name.is_empty() {
        format!("Monitor {}", idx + 1)
      } else {
        name
      },
      width: (rect.right - rect.left) as u32,
      height: (rect.bottom - rect.top) as u32,
      offset_x: rect.left,
      offset_y: rect.top,
      primary,
    });
    BOOL(1)
  }

  unsafe {
    let _ = EnumDisplayMonitors(
      None,
      None,
      Some(callback),
      LPARAM(&mut monitors as *mut _ as isize),
    );
  }

  monitors
}

#[cfg(windows)]
struct WindowSearch {
  #[allow(dead_code)]
  game_pid: Option<u32>,
  best: Option<(isize, String, u32, u32, u32, i32, i32)>,
}

#[cfg(windows)]
fn windows_find_minecraft(game_pid: Option<u32>) -> MinecraftWindowInfo {
  if let Some(pid) = game_pid {
    let matched = windows_find_minecraft_with_pid(Some(pid));
    if matched.found {
      return matched;
    }
  }
  windows_find_minecraft_with_pid(None)
}

#[cfg(windows)]
fn windows_find_minecraft_with_pid(game_pid: Option<u32>) -> MinecraftWindowInfo {
  use windows::Win32::Foundation::{BOOL, HWND, LPARAM, POINT};
  use windows::Win32::Graphics::Gdi::ClientToScreen;
  use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClientRect, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
  };

  let mut search = WindowSearch {
    game_pid,
    best: None,
  };

  unsafe extern "system" fn callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    if IsWindowVisible(hwnd).as_bool() == false {
      return BOOL(1);
    }
    let search = &mut *(lparam.0 as *mut WindowSearch);
    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if let Some(expected) = search.game_pid {
      if pid != expected {
        return BOOL(1);
      }
    }
    let mut title_buf = [0u16; 512];
    let len = GetWindowTextW(hwnd, &mut title_buf);
    if len == 0 {
      return BOOL(1);
    }
    let title = String::from_utf16_lossy(&title_buf[..len as usize]);
    let lower = title.to_lowercase();
    if !lower.contains("minecraft") {
      return BOOL(1);
    }
    if lower.contains("metta") || lower.contains("launcher") {
      return BOOL(1);
    }

    let mut rect = windows::Win32::Foundation::RECT::default();
    if GetClientRect(hwnd, &mut rect).is_err() {
      return BOOL(1);
    }
    let w = (rect.right - rect.left).max(0) as u32;
    let h = (rect.bottom - rect.top).max(0) as u32;
    if w < 320 || h < 240 {
      return BOOL(1);
    }

    let area = w as u64 * h as u64;
    let replace = match &search.best {
      None => true,
      Some((_, _, bw, bh, _, _, _)) => area > (*bw as u64 * *bh as u64),
    };
    if replace {
      let mut origin = POINT { x: 0, y: 0 };
      let _ = ClientToScreen(hwnd, &mut origin);
      search.best = Some((
        hwnd.0 as isize,
        title,
        w,
        h,
        pid,
        origin.x,
        origin.y,
      ));
    }
    BOOL(1)
  }

  unsafe {
    let _ = EnumWindows(
      Some(callback),
      LPARAM(&mut search as *mut _ as isize),
    );
  }

  if let Some((hwnd, title, w, h, pid, ox, oy)) = search.best {
    MinecraftWindowInfo {
      found: true,
      hwnd: Some(hwnd),
      title: Some(title),
      width: w,
      height: h,
      offset_x: ox,
      offset_y: oy,
      pid: Some(pid),
    }
  } else {
    MinecraftWindowInfo {
      found: false,
      hwnd: None,
      title: None,
      width: 0,
      height: 0,
      offset_x: 0,
      offset_y: 0,
      pid: None,
    }
  }
}

pub fn scaled_resolution(
  target: &CaptureTarget,
  resolution: &str,
) -> (u32, u32) {
  if resolution == "original" {
    return (target.width.max(1), target.height.max(1));
  }
  if let Some((w, h)) = resolution.split_once('x') {
    if let (Ok(w), Ok(h)) = (w.parse::<u32>(), h.parse::<u32>()) {
      return (w.max(1), h.max(1));
    }
  }
  (target.width.max(1), target.height.max(1))
}

pub fn build_video_input_args(target: &CaptureTarget, fps: u32, record_cursor: bool) -> Vec<String> {
  #[cfg(windows)]
  {
    return windows_video_input(target, fps, record_cursor);
  }
  #[cfg(not(windows))]
  {
    let _ = (target, fps, record_cursor);
    vec![]
  }
}

#[cfg(windows)]
fn escape_gdigrab_title(title: &str) -> String {
  title.replace('\\', "\\\\").replace(':', "\\:")
}

#[cfg(windows)]
fn windows_video_input(target: &CaptureTarget, fps: u32, record_cursor: bool) -> Vec<String> {
  let mut args = vec![
    "-f".into(),
    "gdigrab".into(),
    "-framerate".into(),
    fps.to_string(),
    "-draw_mouse".into(),
    if record_cursor { "1" } else { "0" }.into(),
  ];

  if target.mode == "window" {
    if let Some(title) = &target.title {
      if !title.is_empty() {
        args.push("-i".into());
        args.push(format!("title={}", escape_gdigrab_title(title)));
        return args;
      }
    }
  }

  if target.mode == "monitor" && target.width > 0 && target.height > 0 {
    args.extend([
      "-offset_x".into(),
      target.offset_x.to_string(),
      "-offset_y".into(),
      target.offset_y.to_string(),
      "-video_size".into(),
      format!("{}x{}", target.width, target.height),
      "-i".into(),
      "desktop".into(),
    ]);
    return args;
  }

  args.extend(["-i".into(), "desktop".into()]);
  args
}

pub fn take_screenshot(
  ffmpeg: &str,
  target: &CaptureTarget,
  output_png: &std::path::Path,
) -> Result<(), String> {
  let mut cmd = std::process::Command::new(ffmpeg);
  cmd.arg("-y");
  cmd.args(build_video_input_args(target, 1, true));
  cmd.args(["-frames:v", "1", "-update", "1"]);
  cmd.arg(output_png);
  cmd.stdout(std::process::Stdio::null());
  cmd.stderr(std::process::Stdio::piped());
  let out = cmd.output().map_err(|e| format!("No se pudo ejecutar ffmpeg: {e}"))?;
  if !out.status.success() {
    let err = String::from_utf8_lossy(&out.stderr);
    return Err(format!("Captura fallida: {}", err.lines().last().unwrap_or("error")));
  }
  Ok(())
}
