mod audio;
mod capture;
mod commands;
mod encoder;
mod events;
mod ffmpeg_gate;
mod ffmpeg_install;
mod process;
mod recorder;
mod settings;
#[cfg(windows)]
mod wasapi_loopback;

pub use commands::{
  recorder_delete_recording, recorder_detect_encoders, recorder_find_minecraft_window,
  recorder_ffmpeg_status, recorder_get_game_status, recorder_get_settings, recorder_get_status,
  recorder_install_ffmpeg, recorder_list_audio_devices, recorder_list_monitors,
  recorder_list_recordings, recorder_pause, recorder_probe_hardware, recorder_rename_recording,
  recorder_resume, recorder_save_settings, recorder_screenshot, recorder_start, recorder_stop,
};
pub use recorder::RecorderManager;
pub use settings::RecorderSettings;
