# Metta Launcher

Minecraft launcher for Windows, Linux and macOS (Tauri + React + TypeScript + Tailwind + SQLite).

## Requirements

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) **stable** via **rustup** (1.78+; el proyecto incluye `rust-toolchain.toml`)
- Linux: dependencias de compilación Tauri/GTK (ver abajo)
- WebView2 on Windows (usually preinstalled)

### Linux — dependencias de sistema

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Tras instalar rustup, asegúrate de que `~/.cargo/bin` esté en tu PATH (reabre la terminal o ejecuta `source "$HOME/.cargo/env"`).

Si ves `lock file version 4 requires ...`, estás usando el `cargo` del sistema (1.75). Usa el de rustup.

## Install

```bash
npm install
```

## Development

```bash
npm run tauri dev
```

This starts Vite on `http://localhost:1420` and opens the desktop window.

## Production build

```bash
npm run tauri build
```

Installers and bundles are written under `src-tauri/target/release/bundle/`.

## Project layout

- `src/` — React UI, launcher services (Minecraft install/launch, mods, settings).
- `src-tauri/` — Rust backend: SQLite, secure token storage (OS keyring), downloads with SHA1 checks, Java process spawn and logs, filesystem operations scoped to the launcher root.

## Data

The launcher root defaults to `%USERPROFILE%\MettaLauncher` (Windows) or the platform data directory. You can change it in **Ajustes**. On first start the app creates only the folder tree under that root (`shared/...`, `instances`) and, if unset, picks the first detected Java and stores these default JVM flags in settings (one flag per line):

```
-XX:+UnlockExperimentalVMOptions
-XX:+UseG1GC
-XX:G1NewSizePercent=20
-XX:G1ReservePercent=20
-XX:MaxGCPauseMillis=50
-XX:G1HeapRegionSize=16M
```

Instances live under `instances/<id>/` with their own `mods`, `config`, `saves`, `resourcepacks`, `shaderpacks`, and `natives`. Shared game files are under `shared/` (libraries, assets, version JSON, Forge/NeoForge install runs).

## Accounts

Microsoft login uses the official device-code flow; tokens are stored in the system credential manager, not in the database. Offline accounts are local-only and use the standard offline UUID scheme.
