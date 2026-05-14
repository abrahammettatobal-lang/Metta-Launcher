import type { McOs } from "./os";
import type { McVersionJson } from "./libraryService";

export interface LaunchReplacements {
  auth_player_name: string;
  auth_uuid: string;
  auth_access_token: string;
  /** Xbox user id for Microsoft accounts; empty for offline. */
  auth_xuid: string;
  /** Mojang `--versionType` (e.g. release, snapshot). */
  version_type: string;
  user_type: string;
  version_name: string;
  game_directory: string;
  assets_root: string;
  assets_index_name: string;
  launcher_name: string;
  launcher_version: string;
  classpath: string;
  library_directory: string;
  natives_directory: string;
  primary_jar: string;
  clientid: string;
}

type ArgRule = {
  action: string;
  os?: { name?: string };
  features?: Record<string, boolean>;
};

type ArgPiece = string | { rules?: ArgRule[]; value: string | string[] };

function ruleOk(
  rules: ArgRule[] | undefined,
  os: McOs,
  features: Record<string, boolean>,
): boolean {
  if (!rules?.length) return true;
  let allowed = false;
  for (const r of rules) {
    let ok = true;
    if (r.os?.name && r.os.name !== os) ok = false;
    if (r.features) {
      for (const [k, need] of Object.entries(r.features)) {
        if (!!features[k] !== need) ok = false;
      }
    }
    if (!ok) continue;
    if (r.action === "allow") allowed = true;
    if (r.action === "disallow") return false;
  }
  return allowed;
}

function flatten(parts: ArgPiece[] | undefined, os: McOs, feats: Record<string, boolean>): string[] {
  if (!parts) return [];
  const out: string[] = [];
  for (const p of parts) {
    if (typeof p === "string") {
      out.push(p);
      continue;
    }
    if (!ruleOk(p.rules, os, feats)) continue;
    if (Array.isArray(p.value)) out.push(...p.value);
    else out.push(p.value);
  }
  return out;
}

function substitute(s: string, rep: LaunchReplacements): string {
  return s
    .replaceAll("${auth_player_name}", rep.auth_player_name)
    .replaceAll("${auth_session}", rep.auth_access_token)
    .replaceAll("${auth_uuid}", rep.auth_uuid)
    .replaceAll("${auth_access_token}", rep.auth_access_token)
    .replaceAll("${auth_xuid}", rep.auth_xuid)
    .replaceAll("${version_type}", rep.version_type)
    .replaceAll("${user_type}", rep.user_type)
    .replaceAll("${version_name}", rep.version_name)
    .replaceAll("${game_directory}", rep.game_directory)
    .replaceAll("${assets_root}", rep.assets_root)
    .replaceAll("${assets_index_name}", rep.assets_index_name)
    .replaceAll("${launcher_name}", rep.launcher_name)
    .replaceAll("${launcher_version}", rep.launcher_version)
    .replaceAll("${classpath}", rep.classpath)
    .replaceAll("${library_directory}", rep.library_directory)
    .replaceAll("${natives_directory}", rep.natives_directory)
    .replaceAll("${primary_jar}", rep.primary_jar)
    .replaceAll("${clientid}", rep.clientid);
}

export function buildLaunchCommand(
  v: McVersionJson,
  os: McOs,
  rep: LaunchReplacements,
  extraJvm: string[],
  extraGame: string[],
  minMb: number,
  maxMb: number,
): string[] {
  const cpSep = os === "windows" ? ";" : ":";
  const rep2 = { ...rep, classpath: rep.classpath.split(cpSep).filter(Boolean).join(cpSep) };
  const jvm: string[] = [];
  jvm.push(`-Xms${minMb}M`);
  jvm.push(`-Xmx${maxMb}M`);
  jvm.push(...extraJvm);

  const jvmPieces =
    v.arguments?.jvm && v.arguments.jvm.length > 0
      ? flatten(v.arguments.jvm as ArgPiece[], os, { has_custom_resolution: false }).map((part) =>
          substitute(part, rep2),
        )
      : [];

  if (jvmPieces.length > 0) {
    jvm.push(...jvmPieces);
    jvm.push(v.mainClass);
  } else {
    jvm.push(`-Djava.library.path=${rep.natives_directory}`);
    jvm.push("-cp", rep2.classpath);
    jvm.push(v.mainClass);
  }
  const game: string[] = [];
  if (v.minecraftArguments) {
    game.push(
      ...substitute(v.minecraftArguments, rep2)
        .split(" ")
        .filter(Boolean),
    );
  } else if (v.arguments?.game) {
    for (const part of flatten(v.arguments.game as ArgPiece[], os, { has_custom_resolution: false })) {
      game.push(substitute(part, rep2));
    }
  }
  game.push(...extraGame);
  return [...jvm, ...game];
}
