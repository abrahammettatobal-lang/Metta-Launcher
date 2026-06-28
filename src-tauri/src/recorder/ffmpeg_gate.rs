use std::process::{Command, Output};
use std::sync::Mutex;
use std::time::Duration;

use super::process::run_with_timeout;

static FFMPEG_PROBE_LOCK: Mutex<()> = Mutex::new(());

/// Serializa llamadas a FFmpeg (dshow/WASAPI no toleran varios procesos a la vez en Windows).
pub fn with_ffmpeg_probe<T>(f: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
  let _guard = FFMPEG_PROBE_LOCK
    .lock()
    .map_err(|_| "Ocupado detectando dispositivos FFmpeg.".to_string())?;
  f()
}

pub fn run_ffmpeg_serial(ffmpeg: &str, args: &[&str], timeout: Duration) -> Result<Output, String> {
  with_ffmpeg_probe(|| {
    let mut cmd = Command::new(ffmpeg);
    cmd.args(args);
    run_with_timeout(cmd, timeout)
  })
}
