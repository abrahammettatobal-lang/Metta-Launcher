import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { launcherCheckUpdate, type LauncherUpdateInfo } from "./bridge";

export interface AppUpdateStatus {
  /** Updater nativo de Tauri (descarga e instala in-app). */
  native: Update | null;
  /** Fallback vía GitHub Releases API (solo abre enlace). */
  fallback: LauncherUpdateInfo | null;
  currentVersion: string;
  updateAvailable: boolean;
  latestVersion: string | null;
  notes: string | null;
  releaseUrl: string | null;
}

export async function checkAppUpdate(): Promise<AppUpdateStatus> {
  const currentVersion = await getVersion().catch(() => "0.0.0");

  try {
    const native = await check();
    if (native) {
      return {
        native,
        fallback: null,
        currentVersion,
        updateAvailable: true,
        latestVersion: native.version,
        notes: native.body ?? null,
        releaseUrl: null,
      };
    }
    return {
      native: null,
      fallback: null,
      currentVersion,
      updateAvailable: false,
      latestVersion: null,
      notes: null,
      releaseUrl: null,
    };
  } catch {
    /* builds de desarrollo o sin firma: usar comprobación GitHub */
  }

  try {
    const fallback = await launcherCheckUpdate();
    return {
      native: null,
      fallback,
      currentVersion: fallback.currentVersion,
      updateAvailable: fallback.updateAvailable,
      latestVersion: fallback.latestVersion,
      notes: fallback.changelog,
      releaseUrl: fallback.releaseUrl,
    };
  } catch {
    return {
      native: null,
      fallback: null,
      currentVersion,
      updateAvailable: false,
      latestVersion: null,
      notes: null,
      releaseUrl: null,
    };
  }
}

export async function installAppUpdate(
  update: Update,
  onProgress?: (percent: number) => void,
): Promise<void> {
  let downloaded = 0;
  let contentLength = 0;
  await update.downloadAndInstall((event: DownloadEvent) => {
    if (!onProgress) return;
    switch (event.event) {
      case "Started":
        contentLength = event.data.contentLength ?? 0;
        onProgress(0);
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        if (contentLength > 0) {
          onProgress(Math.min(99, Math.round((downloaded / contentLength) * 100)));
        }
        break;
      case "Finished":
        onProgress(100);
        break;
    }
  });
  await relaunch();
}
