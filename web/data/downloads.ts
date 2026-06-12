export const RELEASE_VERSION = "0.7.0";
export const REPO_URL = "https://github.com/abrahammettatobal-lang/Metta-Launcher";
export const RELEASE_URL = `${REPO_URL}/releases/tag/v${RELEASE_VERSION}`;
export const RELEASE_BASE = `${REPO_URL}/releases/download/v${RELEASE_VERSION}`;

export interface DownloadAsset {
  id: string;
  name: string;
  url: string;
  filename: string;
  /** Short subtitle shown under the name */
  hint?: string;
  /** "primary" = the recommended install for that OS */
  variant?: "primary" | "secondary" | "advanced";
}

export interface DownloadGroup {
  os: "windows" | "macos" | "linux";
  label: string;
  description: string;
  assets: DownloadAsset[];
}

export const downloads: Record<"windows" | "macos" | "linux", DownloadGroup> = {
  windows: {
    os: "windows",
    label: "Windows",
    description: "Compatible con Windows 10 y Windows 11 (x64).",
    assets: [
      {
        id: "win-setup",
        name: "Windows Setup EXE",
        url: `${RELEASE_BASE}/Metta.Launcher_${RELEASE_VERSION}_x64-setup.exe`,
        filename: `Metta.Launcher_${RELEASE_VERSION}_x64-setup.exe`,
        hint: "Instalador recomendado (NSIS)",
        variant: "primary",
      },
      {
        id: "win-msi",
        name: "Windows MSI",
        url: `${RELEASE_BASE}/Metta.Launcher_${RELEASE_VERSION}_x64_en-US.msi`,
        filename: `Metta.Launcher_${RELEASE_VERSION}_x64_en-US.msi`,
        hint: "Para despliegues empresariales o GPO",
        variant: "secondary",
      },
    ],
  },
  macos: {
    os: "macos",
    label: "macOS",
    description: "Compatible con macOS 11 Big Sur o superior.",
    assets: [
      {
        id: "mac-arm",
        name: "macOS Apple Silicon DMG",
        url: `${RELEASE_BASE}/Metta.Launcher_${RELEASE_VERSION}_aarch64.dmg`,
        filename: `Metta.Launcher_${RELEASE_VERSION}_aarch64.dmg`,
        hint: "M1, M2, M3, M4 — recomendado",
        variant: "primary",
      },
      {
        id: "mac-intel",
        name: "macOS Intel DMG",
        url: `${RELEASE_BASE}/Metta.Launcher_${RELEASE_VERSION}_x64.dmg`,
        filename: `Metta.Launcher_${RELEASE_VERSION}_x64.dmg`,
        hint: "Procesadores Intel Core",
        variant: "primary",
      },
      {
        id: "mac-arm-tar",
        name: "Apple Silicon app.tar.gz",
        url: `${RELEASE_BASE}/Metta.Launcher_aarch64.app.tar.gz`,
        filename: "Metta.Launcher_aarch64.app.tar.gz",
        hint: "Bundle sin DMG (avanzado)",
        variant: "advanced",
      },
      {
        id: "mac-intel-tar",
        name: "Intel app.tar.gz",
        url: `${RELEASE_BASE}/Metta.Launcher_x64.app.tar.gz`,
        filename: "Metta.Launcher_x64.app.tar.gz",
        hint: "Bundle sin DMG (avanzado)",
        variant: "advanced",
      },
    ],
  },
  linux: {
    os: "linux",
    label: "Linux",
    description: "Disponible en formatos DEB, AppImage y RPM (x86_64).",
    assets: [
      {
        id: "linux-deb",
        name: "Linux DEB",
        url: `${RELEASE_BASE}/Metta.Launcher_${RELEASE_VERSION}_amd64.deb`,
        filename: `Metta.Launcher_${RELEASE_VERSION}_amd64.deb`,
        hint: "Ubuntu, Debian, Pop!_OS, Mint",
        variant: "primary",
      },
      {
        id: "linux-appimage",
        name: "Linux AppImage",
        url: `${RELEASE_BASE}/Metta.Launcher_${RELEASE_VERSION}_amd64.AppImage`,
        filename: `Metta.Launcher_${RELEASE_VERSION}_amd64.AppImage`,
        hint: "Universal — funciona en cualquier distro",
        variant: "secondary",
      },
      {
        id: "linux-rpm",
        name: "Linux RPM",
        url: `${RELEASE_BASE}/Metta.Launcher-${RELEASE_VERSION}-1.x86_64.rpm`,
        filename: `Metta.Launcher-${RELEASE_VERSION}-1.x86_64.rpm`,
        hint: "Fedora, RHEL, openSUSE",
        variant: "secondary",
      },
    ],
  },
};
