use crate::game;
use crate::recorder::audio;
use crate::recorder::capture;
use crate::recorder::encoder;
use crate::recorder::events::{
  RecorderCountdownPayload, RecorderErrorPayload, RecorderStartedPayload, RecorderStatusPayload,
  RecorderStoppedPayload, EVENT_COUNTDOWN, EVENT_ERROR, EVENT_STARTED, EVENT_STATUS, EVENT_STOPPED,
};
use crate::recorder::settings::{ensure_output_dir, RecorderSettings};
use chrono::Local;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RecorderPhase {
  Idle,
  Countdown,
  Recording,
  Paused,
  Stopping,
}

struct RuntimeState {
  phase: RecorderPhase,
  ffmpeg_pid: Option<u32>,
  ffmpeg_stdin: Option<Arc<Mutex<Option<ChildStdin>>>>,
  ffmpeg_path: String,
  output_path: PathBuf,
  started_at: Option<Instant>,
  paused_at: Option<Instant>,
  paused_total: Duration,
  encoder_label: String,
  capture_mode: String,
  window_title: Option<String>,
  target_fps: u32,
  resolution_label: String,
  dropped_frames: u64,
  parsed_fps: u32,
  bitrate_kbps: u32,
  stop_monitor: Option<Arc<Mutex<bool>>>,
  last_ffmpeg_error: Option<String>,
}

impl Default for RuntimeState {
  fn default() -> Self {
    Self {
      phase: RecorderPhase::Idle,
      ffmpeg_pid: None,
      ffmpeg_stdin: None,
      ffmpeg_path: String::new(),
      output_path: PathBuf::new(),
      started_at: None,
      paused_at: None,
      paused_total: Duration::ZERO,
      encoder_label: String::new(),
      capture_mode: String::new(),
      window_title: None,
      target_fps: 60,
      resolution_label: String::new(),
      dropped_frames: 0,
      parsed_fps: 0,
      bitrate_kbps: 0,
      stop_monitor: None,
      last_ffmpeg_error: None,
    }
  }
}

pub struct RecorderManager {
  inner: Mutex<RuntimeState>,
  #[cfg(windows)]
  loopback: Mutex<Option<crate::recorder::wasapi_loopback::LoopbackCapture>>,
}

impl RecorderManager {
  pub fn new() -> Self {
    Self {
      inner: Mutex::new(RuntimeState::default()),
      #[cfg(windows)]
      loopback: Mutex::new(None),
    }
  }

  pub fn status_snapshot(&self) -> RecorderStatusPayload {
    let state = self.inner.lock().unwrap();
    let elapsed = state.elapsed_secs();
    let file_size = file_size_or_zero(&state.output_path);
    let disk_free = if state.phase == RecorderPhase::Idle {
      0
    } else {
      disk_free_bytes(&state.output_path)
    };
    let est = estimate_final_size(
      state.bitrate_kbps.max(state.target_fps.saturating_mul(100)),
      elapsed,
    );

    RecorderStatusPayload {
      phase: phase_name(&state.phase).into(),
      elapsed_secs: elapsed,
      file_size_bytes: file_size,
      file_path: state.output_path.to_string_lossy().into_owned(),
      fps: if state.parsed_fps > 0 {
        state.parsed_fps
      } else {
        state.target_fps
      },
      target_fps: state.target_fps,
      bitrate_kbps: state.bitrate_kbps.max(state.target_fps.saturating_mul(50)),
      encoder: state.encoder_label.clone(),
      resolution: state.resolution_label.clone(),
      dropped_frames: state.dropped_frames,
      cpu_usage_pct: 0.0,
      gpu_usage_pct: 0.0,
      disk_free_bytes: disk_free,
      mic_level: 0.0,
      capture_mode: state.capture_mode.clone(),
      window_title: state.window_title.clone(),
      estimated_final_size_bytes: est,
    }
  }

  pub fn start(&self, app: AppHandle, settings: RecorderSettings) -> Result<(), String> {
    {
      let state = self.inner.lock().unwrap();
      if state.phase != RecorderPhase::Idle {
        return Err("Ya hay una grabación en curso.".into());
      }
    }

    let ffmpeg = encoder::find_ffmpeg()?;
    ensure_output_dir(&settings)?;
    let free = disk_free_bytes(Path::new(&settings.output_dir));
    if free < 512 * 1024 * 1024 {
      return Err("No hay espacio suficiente en disco (mínimo 512 MB).".into());
    }

    {
      let mut state = self.inner.lock().unwrap();
      state.ffmpeg_path = ffmpeg;
    }

    let countdown = settings.countdown_seconds;
    if countdown > 0 {
      let mut state = self.inner.lock().unwrap();
      state.phase = RecorderPhase::Countdown;
      drop(state);

      let mgr = Arc::new(RecorderThreadProxy {
        manager: self as *const RecorderManager,
      });
      let app_c = app.clone();
      let settings_c = settings.clone();
      let _ = app.emit(EVENT_STATUS, self.status_snapshot());
      thread::spawn(move || {
        for left in (1..=countdown).rev() {
          let _ = app_c.emit(
            EVENT_COUNTDOWN,
            RecorderCountdownPayload { seconds_left: left },
          );
          thread::sleep(Duration::from_secs(1));
        }
        if let Err(e) = mgr.spawn_recording(app_c.clone(), settings_c) {
          let _ = app_c.emit(
            EVENT_ERROR,
            RecorderErrorPayload {
              code: "start_failed".into(),
              message: e,
            },
          );
          if let Some(m) = mgr.manager() {
            let mut st = m.inner.lock().unwrap();
            *st = RuntimeState::default();
          }
        }
      });
      return Ok(());
    }

    self.spawn_recording_internal(app, settings)
  }

  fn spawn_recording_internal(&self, app: AppHandle, settings: RecorderSettings) -> Result<(), String> {
    let ffmpeg = {
      let state = self.inner.lock().unwrap();
      if state.ffmpeg_path.is_empty() {
        drop(state);
        encoder::find_ffmpeg()?
      } else {
        state.ffmpeg_path.clone()
      }
    };

    let game_pid = game::running_pid();
    let capture = capture::resolve_capture_target(&settings.capture_mode, game_pid, 0)?;
    let (out_w, out_h) = capture::scaled_resolution(&capture, &settings.resolution);

    let resolved = encoder::resolve_encoder(
      &ffmpeg,
      &settings.codec,
      &settings.encoder_preference,
      settings.bitrate_mbps,
      &settings.quality_preset,
      settings.fps,
      settings.variable_frame_rate,
    )?;

    let (audio_args, has_audio) = {
      let mut audio_plan = audio::plan_audio(
        &ffmpeg,
        &settings.audio_mode,
        settings.mic_device.as_deref(),
        settings.game_audio_device.as_deref(),
        game_pid,
        None,
      )?;

      #[cfg(windows)]
      {
        if let audio::GameAudioInput::NativeLoopback { process_id } = &audio_plan.game {
          let (handle, port) =
            crate::recorder::wasapi_loopback::LoopbackCapture::start(*process_id)?;
          *self.loopback.lock().unwrap() = Some(handle);
          audio_plan = audio::plan_audio(
            &ffmpeg,
            &settings.audio_mode,
            settings.mic_device.as_deref(),
            settings.game_audio_device.as_deref(),
            game_pid,
            Some(port),
          )?;
        }
      }

      (audio_plan.ffmpeg_args, audio_plan.has_audio)
    };

    let ext = encoder::output_extension(&settings.format);
    let filename = format!(
      "Minecraft_{}.{}",
      Local::now().format("%Y-%m-%d_%H-%M-%S"),
      ext
    );
    let output_path = PathBuf::from(&settings.output_dir).join(&filename);

    let mut cmd = Command::new(&ffmpeg);
    cmd.arg("-y");
    cmd.args(["-hide_banner", "-loglevel", "info", "-stats"]);
    cmd.args(capture::build_video_input_args(
      &capture,
      settings.fps,
      settings.record_cursor,
    ));
    if out_w != capture.width || out_h != capture.height {
      cmd.args([
        "-vf",
        &format!("scale={out_w}:{out_h}:flags=lanczos,format=yuv420p"),
      ]);
    } else {
      cmd.args(["-vf", "format=yuv420p"]);
    }
    cmd.args(audio_args);
    cmd.args(resolved.video_args);
    cmd.args(encoder::build_output_args(&settings.format, has_audio));
    cmd.arg(&output_path);
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
      Ok(child) => child,
      Err(e) => {
        #[cfg(windows)]
        if let Some(loopback) = self.loopback.lock().unwrap().take() {
          loopback.stop();
        }
        return Err(format!("No se pudo iniciar la grabación: {e}"));
      }
    };
    let ffmpeg_pid = child.id();
    let ffmpeg_stdin = Arc::new(Mutex::new(child.stdin.take()));
    let stderr = child
      .stderr
      .take()
      .ok_or_else(|| "No se pudo capturar stderr de ffmpeg.".to_string())?;

    let stop_flag = Arc::new(Mutex::new(false));
    let stats_flag = Arc::clone(&stop_flag);
    let parse_flag = Arc::clone(&stop_flag);
    let wait_flag = Arc::clone(&stop_flag);
    let manager_ptr = self as *const RecorderManager as usize;

    {
      let mut state = self.inner.lock().unwrap();
      state.ffmpeg_pid = Some(ffmpeg_pid);
      state.ffmpeg_stdin = Some(Arc::clone(&ffmpeg_stdin));
      state.output_path = output_path.clone();
      state.phase = RecorderPhase::Recording;
      state.started_at = Some(Instant::now());
      state.paused_at = None;
      state.paused_total = Duration::ZERO;
      state.encoder_label = resolved.label.clone();
      state.capture_mode = capture.mode.clone();
      state.window_title = capture.title.clone();
      state.target_fps = settings.fps.max(1);
      state.resolution_label = format!("{out_w}x{out_h}");
      state.dropped_frames = 0;
      state.parsed_fps = 0;
      state.bitrate_kbps = settings.bitrate_mbps.saturating_mul(1000);
      state.stop_monitor = Some(stop_flag);
      state.ffmpeg_path = ffmpeg;
      state.last_ffmpeg_error = None;
    }

    let app_wait = app.clone();
    thread::spawn(move || {
      let exit = child.wait();
      if let Ok(mut f) = wait_flag.lock() {
        *f = true;
      }
      let mgr = unsafe { &*(manager_ptr as *const RecorderManager) };
      let should_finalize = {
        let state = mgr.inner.lock().unwrap();
        matches!(
          state.phase,
          RecorderPhase::Recording | RecorderPhase::Paused
        )
      };
      if should_finalize {
        let detail = {
          let state = mgr.inner.lock().unwrap();
          state.last_ffmpeg_error.clone()
        };
        if !exit.map(|s| s.success()).unwrap_or(false) {
          let message = detail.unwrap_or_else(|| {
            "FFmpeg terminó inesperadamente. Prueba encoder CPU (libx264) y audio «Sin audio»."
              .into()
          });
          let _ = app_wait.emit(
            EVENT_ERROR,
            RecorderErrorPayload {
              code: "ffmpeg_exit".into(),
              message,
            },
          );
        }
        let _ = mgr.stop(app_wait);
      }
    });

    let app_stats = app.clone();
    thread::spawn(move || stats_loop(app_stats, manager_ptr, stats_flag));

    let app_err = app.clone();
    thread::spawn(move || parse_ffmpeg_stderr(app_err, manager_ptr, parse_flag, stderr));

    let _ = app.emit(
      EVENT_STARTED,
      RecorderStartedPayload {
        file_path: output_path.to_string_lossy().into_owned(),
        encoder: resolved.label,
        capture_mode: capture.mode,
      },
    );
    let _ = app.emit(EVENT_STATUS, self.status_snapshot());
    Ok(())
  }

  pub fn stop(&self, app: AppHandle) -> Result<(), String> {
    let mut state = self.inner.lock().unwrap();
    if state.phase == RecorderPhase::Idle {
      return Ok(());
    }
    if state.phase == RecorderPhase::Countdown {
      *state = RuntimeState::default();
      return Ok(());
    }

    state.phase = RecorderPhase::Stopping;
    let output = state.output_path.clone();
    let elapsed = state.elapsed_secs();
    let pid = state.ffmpeg_pid.take();
    let stdin = state.ffmpeg_stdin.take();

    if let Some(flag) = &state.stop_monitor {
      if let Ok(mut f) = flag.lock() {
        *f = true;
      }
    }
    drop(state);

    if let Some(pid) = pid {
      stop_ffmpeg_gracefully(pid, stdin);
    }

    #[cfg(windows)]
    if let Some(loopback) = self.loopback.lock().unwrap().take() {
      loopback.stop();
    }

    thread::sleep(Duration::from_millis(250));
    let file_size = file_size_or_zero(&output);
    let success = output.is_file() && file_size > 1024;
    let mut state = self.inner.lock().unwrap();
    *state = RuntimeState::default();
    drop(state);

    let _ = app.emit(
      EVENT_STOPPED,
      RecorderStoppedPayload {
        file_path: output.to_string_lossy().into_owned(),
        duration_secs: elapsed,
        file_size_bytes: file_size,
        success,
      },
    );
    Ok(())
  }

  pub fn pause(&self) -> Result<(), String> {
    let mut state = self.inner.lock().unwrap();
    if state.phase != RecorderPhase::Recording {
      return Err("No hay grabación activa para pausar.".into());
    }
    let pid = state
      .ffmpeg_pid
      .ok_or_else(|| "Proceso de grabación no encontrado.".to_string())?;
    suspend_process(pid)?;
    state.paused_at = Some(Instant::now());
    state.phase = RecorderPhase::Paused;
    Ok(())
  }

  pub fn resume(&self) -> Result<(), String> {
    let mut state = self.inner.lock().unwrap();
    if state.phase != RecorderPhase::Paused {
      return Err("La grabación no está pausada.".into());
    }
    let pid = state
      .ffmpeg_pid
      .ok_or_else(|| "Proceso de grabación no encontrado.".to_string())?;
    resume_process(pid)?;
    if let Some(paused_at) = state.paused_at.take() {
      state.paused_total += paused_at.elapsed();
    }
    state.phase = RecorderPhase::Recording;
    Ok(())
  }

  pub fn screenshot(&self, settings: &RecorderSettings) -> Result<String, String> {
    let ffmpeg = encoder::find_ffmpeg()?;
    ensure_output_dir(settings)?;
    let game_pid = game::running_pid();
    let capture = capture::resolve_capture_target(&settings.capture_mode, game_pid, 0)?;
    let filename = format!("Minecraft_{}.png", Local::now().format("%Y-%m-%d_%H-%M-%S"));
    let path = PathBuf::from(&settings.output_dir).join(filename);
    capture::take_screenshot(&ffmpeg, &capture, &path)?;
    Ok(path.to_string_lossy().into_owned())
  }
}

struct RecorderThreadProxy {
  manager: *const RecorderManager,
}

impl RecorderThreadProxy {
  fn manager(&self) -> Option<&RecorderManager> {
    if self.manager.is_null() {
      None
    } else {
      Some(unsafe { &*self.manager })
    }
  }

  fn spawn_recording(&self, app: AppHandle, settings: RecorderSettings) -> Result<(), String> {
    self
      .manager()
      .ok_or_else(|| "Recorder no disponible.".to_string())?
      .spawn_recording_internal(app, settings)
  }
}

unsafe impl Send for RecorderThreadProxy {}
unsafe impl Sync for RecorderThreadProxy {}

impl RuntimeState {
  fn elapsed_secs(&self) -> u64 {
    let Some(started) = self.started_at else {
      return 0;
    };
    let mut elapsed = started.elapsed();
    elapsed = elapsed.saturating_sub(self.paused_total);
    if let Some(paused_at) = self.paused_at {
      elapsed = elapsed.saturating_sub(paused_at.elapsed());
    }
    elapsed.as_secs()
  }
}

fn phase_name(phase: &RecorderPhase) -> &'static str {
  match phase {
    RecorderPhase::Idle => "idle",
    RecorderPhase::Countdown => "countdown",
    RecorderPhase::Recording => "recording",
    RecorderPhase::Paused => "paused",
    RecorderPhase::Stopping => "stopping",
  }
}

fn file_size_or_zero(path: &Path) -> u64 {
  std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

fn disk_free_bytes(path: &Path) -> u64 {
  let dir = if path.is_dir() {
    path.to_path_buf()
  } else {
    path.parent().unwrap_or(path).to_path_buf()
  };
  #[cfg(windows)]
  {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    let root = dir
      .ancestors()
      .find(|p| p.parent().is_none() || p.iter().count() <= 1)
      .map(|p| p.to_path_buf())
      .unwrap_or_else(|| PathBuf::from("C:\\"));
    let mut root_str = root.to_string_lossy().into_owned();
    if !root_str.ends_with('\\') {
      root_str.push('\\');
    }
    let wide: Vec<u16> = std::ffi::OsStr::new(&root_str)
      .encode_wide()
      .chain(Some(0))
      .collect();
    let mut free = 0u64;
    unsafe {
      if GetDiskFreeSpaceExW(PCWSTR(wide.as_ptr()), Some(&mut free), None, None).is_ok() {
        return free;
      }
    }
  }
  let _ = dir;
  0
}

fn estimate_final_size(bitrate_kbps: u32, elapsed_secs: u64) -> u64 {
  (bitrate_kbps as u64 * elapsed_secs * 1000) / 8
}

fn stats_loop(app: AppHandle, manager_ptr: usize, stop: Arc<Mutex<bool>>) {
  let mut ticks: u64 = 0;
  loop {
    if *stop.lock().unwrap() {
      break;
    }
    let mgr = unsafe { &*(manager_ptr as *const RecorderManager) };
    let phase = mgr.inner.lock().unwrap().phase.clone();
    if phase == RecorderPhase::Idle || phase == RecorderPhase::Stopping {
      break;
    }
    ticks += 1;
    if ticks == 1 || ticks % 2 == 0 {
      let _ = app.emit(EVENT_STATUS, mgr.status_snapshot());
    }
    thread::sleep(Duration::from_millis(1000));
  }
}

fn parse_ffmpeg_stderr(
  app: AppHandle,
  manager_ptr: usize,
  stop: Arc<Mutex<bool>>,
  stderr: impl Read + Send + 'static,
) {
  let reader = BufReader::new(stderr);
  for line in reader.lines().map_while(Result::ok) {
    if *stop.lock().unwrap() {
      break;
    }
    let mgr = unsafe { &*(manager_ptr as *const RecorderManager) };
    {
      let mut state = mgr.inner.lock().unwrap();
      if line.contains("drop=") {
        if let Some(v) = parse_stat_value(&line, "drop=") {
          state.dropped_frames = v;
        }
      }
      if line.contains("fps=") {
        if let Some(v) = parse_stat_value(&line, "fps=") {
          state.parsed_fps = v as u32;
        }
      }
      if line.contains("bitrate=") {
        if let Some(raw) = line.split("bitrate=").nth(1) {
          let num = raw
            .split_whitespace()
            .next()
            .unwrap_or("0")
            .trim_end_matches("kbits/s");
          if let Ok(kbps) = num.parse::<f32>() {
            state.bitrate_kbps = kbps as u32;
          }
        }
      }
    }
    let lower = line.to_lowercase();
    if line.contains("Unknown input format")
      || line.contains("Unrecognized option")
      || line.contains("Error opening input")
      || line.contains("Conversion failed")
      || line.contains("Could not open encoder")
      || is_fatal_ffmpeg_line(&lower)
    {
      {
        let mut state = mgr.inner.lock().unwrap();
        state.last_ffmpeg_error = Some(line.clone());
      }
      if is_fatal_ffmpeg_line(&lower)
        || line.contains("Unknown input format")
        || line.contains("Unrecognized option")
        || line.contains("Error opening input")
        || line.contains("Conversion failed")
        || line.contains("Could not open encoder")
      {
        let _ = app.emit(
          EVENT_ERROR,
          RecorderErrorPayload {
            code: "ffmpeg".into(),
            message: line,
          },
        );
      }
    }
  }
}

fn is_fatal_ffmpeg_line(lower: &str) -> bool {
  lower.contains("conversion failed")
    || lower.contains("error opening output")
    || lower.contains("error opening input")
    || lower.contains("no such file or directory")
    || lower.contains("permission denied")
    || lower.contains("could not find")
    || lower.contains("failed to")
}

fn parse_stat_value(line: &str, key: &str) -> Option<u64> {
  let part = line.split(key).nth(1)?;
  part.split_whitespace()
    .next()?
    .parse::<f64>()
    .ok()
    .map(|v| v as u64)
}

fn stop_ffmpeg_gracefully(pid: u32, stdin: Option<Arc<Mutex<Option<ChildStdin>>>>) {
  if let Some(stdin_arc) = stdin {
    if let Ok(mut guard) = stdin_arc.lock() {
      if let Some(ref mut handle) = *guard {
        let _ = handle.write_all(b"q");
        let _ = handle.flush();
      }
    }
  }

  for _ in 0..150 {
    if !process_running(pid) {
      return;
    }
    thread::sleep(Duration::from_millis(100));
  }

  kill_pid_tree(pid);
}

fn process_running(pid: u32) -> bool {
  #[cfg(windows)]
  {
    let output = Command::new("tasklist")
      .args(["/FI", &format!("PID eq {pid}"), "/NH"])
      .stdout(Stdio::piped())
      .stderr(Stdio::null())
      .output();
    match output {
      Ok(out) if out.status.success() => {
        let text = String::from_utf8_lossy(&out.stdout);
        let lower = text.to_lowercase();
        if lower.contains("no tasks")
          || lower.contains("ninguna tarea")
          || lower.contains("no hay tareas")
        {
          return false;
        }
        text.contains(&pid.to_string())
      }
      _ => false,
    }
  }
  #[cfg(not(windows))]
  {
    Command::new("kill")
      .args(["-0", &pid.to_string()])
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .status()
      .map(|s| s.success())
      .unwrap_or(false)
  }
}

fn kill_pid_tree(pid: u32) {
  #[cfg(windows)]
  {
    let _ = Command::new("taskkill")
      .args(["/PID", &pid.to_string(), "/T", "/F"])
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .status();
  }
  #[cfg(not(windows))]
  {
    let _ = Command::new("kill").args(["-9", &pid.to_string()]).status();
  }
}

#[cfg(windows)]
fn suspend_process(pid: u32) -> Result<(), String> {
  let script = format!(
    "(Get-Process -Id {pid} -ErrorAction SilentlyContinue | ForEach-Object {{ $_.Suspend() }})"
  );
  Command::new("powershell")
    .args(["-NoProfile", "-Command", &script])
    .status()
    .map_err(|e| e.to_string())?
    .success()
    .then_some(())
    .ok_or_else(|| "No se pudo pausar la grabación.".into())
}

#[cfg(not(windows))]
fn suspend_process(_pid: u32) -> Result<(), String> {
  Err("Pausar grabación no está soportado en esta plataforma.".into())
}

#[cfg(windows)]
fn resume_process(pid: u32) -> Result<(), String> {
  let script = format!(
    "(Get-Process -Id {pid} -ErrorAction SilentlyContinue | ForEach-Object {{ $_.Resume() }})"
  );
  Command::new("powershell")
    .args(["-NoProfile", "-Command", &script])
    .status()
    .map_err(|e| e.to_string())?
    .success()
    .then_some(())
    .ok_or_else(|| "No se pudo reanudar la grabación.".into())
}

#[cfg(not(windows))]
fn resume_process(_pid: u32) -> Result<(), String> {
  Err("Reanudar grabación no está soportado en esta plataforma.".into())
}
