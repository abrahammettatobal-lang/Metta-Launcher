use serde::Serialize;

use std::time::Duration;



#[derive(Debug, Clone)]

pub enum GameAudioInput {

  None,

  Dshow(String),

  NativeLoopback { process_id: u32 },

}



#[derive(Debug, Clone)]

pub struct AudioPlan {

  pub ffmpeg_args: Vec<String>,

  pub has_audio: bool,

  pub game: GameAudioInput,

}



#[derive(Debug, Clone, Serialize)]

#[serde(rename_all = "camelCase")]

pub struct AudioDeviceInfo {

  pub id: String,

  pub name: String,

  pub kind: String,

}



pub fn list_audio_devices(ffmpeg: &str) -> Result<Vec<AudioDeviceInfo>, String> {

  #[cfg(windows)]

  {

    return list_dshow_devices(ffmpeg);

  }

  #[cfg(target_os = "linux")]

  {

    return list_pulse_devices(ffmpeg);

  }

  #[cfg(target_os = "macos")]

  {

    return list_avfoundation_devices(ffmpeg);

  }

  #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]

  {

    let _ = ffmpeg;

    Ok(vec![])

  }

}



#[cfg(windows)]

fn list_dshow_devices(ffmpeg: &str) -> Result<Vec<AudioDeviceInfo>, String> {

  use crate::recorder::ffmpeg_gate::run_ffmpeg_serial;

  let out = run_ffmpeg_serial(

    ffmpeg,

    &["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"],

    Duration::from_secs(5),

  )?;

  let text = String::from_utf8_lossy(&out.stderr);

  let mut devices = Vec::new();

  let mut in_audio = false;

  for line in text.lines() {

    if line.contains("DirectShow audio devices") {

      in_audio = true;

      continue;

    }

    if line.contains("DirectShow video devices") {

      in_audio = false;

    }

    if !in_audio {

      continue;

    }

    if let Some(name) = parse_quoted_device(line) {

      let kind = if name.to_lowercase().contains("stereo mix")

        || name.to_lowercase().contains("loopback")

        || name.to_lowercase().contains("virtual-audio")

      {

        "loopback"

      } else {

        "input"

      };

      devices.push(AudioDeviceInfo {

        id: name.clone(),

        name,

        kind: kind.into(),

      });

    }

  }



  devices.push(AudioDeviceInfo {

    id: "native_loopback".into(),

    name: "Audio del juego (automático)".into(),

    kind: "loopback".into(),

  });



  Ok(devices)

}



#[cfg(windows)]

fn find_dshow_loopback_name(ffmpeg: &str) -> Option<String> {

  let devices = list_dshow_devices(ffmpeg).ok()?;

  devices

    .into_iter()

    .find(|d| d.kind == "loopback" && d.id != "native_loopback")

    .map(|d| d.name)

}



pub fn ffmpeg_has_game_audio(_ffmpeg: &str) -> bool {

  #[cfg(windows)]

  {

    return true;

  }

  #[cfg(not(windows))]

  {

    let _ = _ffmpeg;

    false

  }

}



#[cfg(target_os = "linux")]

fn list_pulse_devices(ffmpeg: &str) -> Result<Vec<AudioDeviceInfo>, String> {

  use std::process::{Command, Stdio};

  let out = Command::new(ffmpeg)

    .args(["-hide_banner", "-sources", "device", "-f", "pulse", "-i", "default"])

    .stderr(Stdio::piped())

    .output()

    .map_err(|e| e.to_string())?;

  let _ = String::from_utf8_lossy(&out.stderr);

  Ok(vec![

    AudioDeviceInfo {

      id: "default".into(),

      name: "Predeterminado (PulseAudio)".into(),

      kind: "loopback".into(),

    },

    AudioDeviceInfo {

      id: "default".into(),

      name: "Micrófono predeterminado".into(),

      kind: "input".into(),

    },

  ])

}



#[cfg(target_os = "macos")]

fn list_avfoundation_devices(ffmpeg: &str) -> Result<Vec<AudioDeviceInfo>, String> {

  use std::process::{Command, Stdio};

  let out = Command::new(ffmpeg)

    .args(["-hide_banner", "-list_devices", "true", "-f", "avfoundation", "-i", ""])

    .stderr(Stdio::piped())

    .output()

    .map_err(|e| e.to_string())?;

  let text = String::from_utf8_lossy(&out.stderr);

  let mut devices = Vec::new();

  let mut in_audio = false;

  for line in text.lines() {

    if line.contains("AVFoundation audio devices") {

      in_audio = true;

      continue;

    }

    if line.contains("AVFoundation video devices") {

      in_audio = false;

    }

    if !in_audio {

      continue;

    }

    if let Some(idx) = line.find(']') {

      let name = line[idx + 1..].trim();

      if !name.is_empty() {

        devices.push(AudioDeviceInfo {

          id: name.to_string(),

          name: name.to_string(),

          kind: "input".into(),

        });

      }

    }

  }

  Ok(devices)

}



fn parse_quoted_device(line: &str) -> Option<String> {

  let start = line.find('"')?;

  let rest = &line[start + 1..];

  let end = rest.find('"')?;

  Some(rest[..end].to_string())

}



pub fn plan_audio(

  ffmpeg: &str,

  audio_mode: &str,

  mic_device: Option<&str>,

  game_device: Option<&str>,

  game_pid: Option<u32>,

  loopback_port: Option<u16>,

) -> Result<AudioPlan, String> {

  if audio_mode == "none" {

    return Ok(AudioPlan {

      ffmpeg_args: vec!["-an".into()],

      has_audio: false,

      game: GameAudioInput::None,

    });

  }



  #[cfg(windows)]

  {

    return windows_audio_plan(

      ffmpeg,

      audio_mode,

      mic_device,

      game_device,

      game_pid,

      loopback_port,

    );

  }

  #[cfg(not(windows))]

  {

    let _ = (ffmpeg, mic_device, game_device, game_pid, loopback_port);

    if audio_mode == "mic" || audio_mode == "both" {

      Ok(AudioPlan {

        ffmpeg_args: vec![

          "-f".into(),

          "pulse".into(),

          "-i".into(),

          "default".into(),

        ],

        has_audio: true,

        game: GameAudioInput::None,

      })

    } else {

      Ok(AudioPlan {

        ffmpeg_args: vec![],

        has_audio: false,

        game: GameAudioInput::None,

      })

    }

  }

}



#[cfg(windows)]

fn windows_audio_plan(

  ffmpeg: &str,

  audio_mode: &str,

  mic_device: Option<&str>,

  game_device: Option<&str>,

  game_pid: Option<u32>,

  loopback_port: Option<u16>,

) -> Result<AudioPlan, String> {

  let want_game = audio_mode == "game" || audio_mode == "both";

  let want_mic = audio_mode == "mic" || audio_mode == "both";



  let mut game_input = GameAudioInput::None;

  let mut game_args = Vec::new();

  let mut mic_args = Vec::new();

  let mut inputs = 0u32;



  if want_game {

    if let Some(name) = game_device.filter(|n| {

      !n.is_empty() && *n != "native_loopback" && *n != "wasapi_loopback"

    }) {

      game_input = GameAudioInput::Dshow(name.to_string());

      game_args.extend([

        "-f".into(),

        "dshow".into(),

        "-i".into(),

        format!("audio={name}"),

      ]);

      inputs += 1;

    } else if let Some(port) = loopback_port {

      let pid = game_pid.ok_or_else(|| {

        "Para capturar audio del juego, inicia Minecraft antes de grabar.".to_string()

      })?;

      game_input = GameAudioInput::NativeLoopback { process_id: pid };

      game_args.extend([

        "-f".into(),

        "s16le".into(),

        "-ar".into(),

        crate::recorder::wasapi_loopback::SAMPLE_RATE.to_string(),

        "-ac".into(),

        crate::recorder::wasapi_loopback::CHANNELS.to_string(),

        "-i".into(),

        crate::recorder::wasapi_loopback::tcp_input_url(port),

      ]);

      inputs += 1;

    } else if let Some(pid) = game_pid {

      game_input = GameAudioInput::NativeLoopback { process_id: pid };

    } else if let Some(loopback) = find_dshow_loopback_name(ffmpeg) {

      game_input = GameAudioInput::Dshow(loopback.clone());

      game_args.extend([

        "-f".into(),

        "dshow".into(),

        "-i".into(),

        format!("audio={loopback}"),

      ]);

      inputs += 1;

    } else if want_game && !want_mic {

      return Err(

        "Para capturar audio del juego, inicia Minecraft antes de grabar.".to_string(),

      );

    }

  }



  if want_mic {

    if let Some(mic_name) = mic_device.filter(|n| !n.is_empty()) {

      mic_args.extend([

        "-f".into(),

        "dshow".into(),

        "-i".into(),

        format!("audio={mic_name}"),

      ]);

      inputs += 1;

    } else if let Ok(devices) = list_dshow_devices(ffmpeg) {

      if let Some(mic) = devices.iter().find(|d| d.kind == "input") {

        mic_args.extend([

          "-f".into(),

          "dshow".into(),

          "-i".into(),

          format!("audio={}", mic.name),

        ]);

        inputs += 1;

      } else if audio_mode == "mic" {

        return Err(

          "No se encontró micrófono. Conecta uno o cambia el modo de audio.".into(),

        );

      }

    } else if audio_mode == "mic" {

      return Err(

        "No se encontró micrófono. Conecta uno o cambia el modo de audio.".into(),

      );

    }

  }



  if matches!(game_input, GameAudioInput::NativeLoopback { .. }) && loopback_port.is_none() {

    return Ok(AudioPlan {

      ffmpeg_args: vec![],

      has_audio: false,

      game: game_input,

    });

  }



  if inputs == 0 {

    return Ok(AudioPlan {

      ffmpeg_args: vec!["-an".into()],

      has_audio: false,

      game: game_input,

    });

  }



  let mut ffmpeg_args = Vec::new();

  ffmpeg_args.extend(game_args);

  ffmpeg_args.extend(mic_args);



  if inputs > 1 {

    ffmpeg_args.extend([

      "-filter_complex".into(),

      "[1:a][2:a]amix=inputs=2:duration=longest:dropout_transition=2[aout]".into(),

      "-map".into(),

      "0:v:0".into(),

      "-map".into(),

      "[aout]".into(),

    ]);

  } else {

    ffmpeg_args.extend(["-map".into(), "0:v:0".into(), "-map".into(), "1:a:0".into()]);

  }



  Ok(AudioPlan {

    ffmpeg_args,

    has_audio: true,

    game: game_input,

  })

}



pub fn build_audio_args(

  ffmpeg: &str,

  audio_mode: &str,

  mic_device: Option<&str>,

  game_device: Option<&str>,

) -> Result<(Vec<String>, bool), String> {

  let plan = plan_audio(

    ffmpeg,

    audio_mode,

    mic_device,

    game_device,

    None,

    None,

  )?;

  Ok((plan.ffmpeg_args, plan.has_audio))

}


