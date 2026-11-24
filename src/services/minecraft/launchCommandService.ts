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
  /** Set automatically in buildLaunchCommand if omitted. */
  classpath_separator?: string;
  library_directory: string;
  natives_directory: string;
  primary_jar: string;
  clientid: string;
  /**
   * Vanilla Minecraft version (1.21.1). Forge/NeoForge JSON ignoreList uses
   * `${version_name}.jar`; Prism sets version_name to this so 1.21.1.jar is ignored.
   */
  minecraft_version?: string;
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

const GC_FLAG =
  /^-XX:\+Use(G1GC|ZGC|SerialGC|ParallelGC)|^-XX:G1|^-XX:\+UnlockExperimentalVMOptions/;

/** Drop global G1 flags when Mojang's version JSON already defines JVM options. */
function sanitizeExtraJvm(extraJvm: string[], jvmPieces: string[]): string[] {
  if (jvmPieces.length === 0) return extraJvm;
  return extraJvm.filter((f) => !GC_FLAG.test(f.trim()));
}

function normalizeJvmFlag(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith("-D") && trimmed.includes("=")) {
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trimEnd();
    const val = trimmed.slice(eq + 1).trim();
    return `${key}=${val}`;
  }
  return trimmed;
}

function jarFileName(p: string): string {
  const n = p.replace(/\\/g, "/").split("/").pop() ?? "";
  return n.toLowerCase();
}

function stripClasspathFlags(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-cp" || a === "-classpath") {
      i += 1;
      continue;
    }
    out.push(a);
  }
  return out;
}

function modulePathJarNames(jvmArgs: string[], cpSep: string): Set<string> {
  const names = new Set<string>();
  for (let i = 0; i < jvmArgs.length; i++) {
    if (jvmArgs[i] !== "-p" && jvmArgs[i] !== "--module-path") continue;
    const value = jvmArgs[i + 1];
    if (!value) continue;
    for (const part of value.split(cpSep)) {
      const name = jarFileName(part);
      if (name) names.add(name);
    }
  }
  return names;
}

/** Vanilla client names like 1.21.1.jar become automatic modules `_1._21._1`. */
function isVanillaClientJarName(name: string): boolean {
  return /^\d+(?:\.\d+)+(?:-rc\d+|-pre\d+)?\.jar$/i.test(name);
}

/** Keep the Minecraft client jar off JPMS; Forge/NeoForge create module `minecraft` themselves. */
function removeVersionJarFromModulePath(
  jvmArgs: string[],
  cpSep: string,
  versionJar: string,
): string[] {
  const versionName = jarFileName(versionJar);
  const out = [...jvmArgs];
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== "-p" && out[i] !== "--module-path") continue;
    const value = out[i + 1];
    if (!value) continue;
    out[i + 1] = value
      .split(cpSep)
      .filter((part) => {
        const name = jarFileName(part);
        if (!name) return false;
        if (versionName && name === versionName) return false;
        if (isVanillaClientJarName(name)) return false;
        return true;
      })
      .join(cpSep);
  }
  return out;
}

function classpathWithoutModuleJars(
  classpath: string,
  cpSep: string,
  moduleJarNames: Set<string>,
  versionJar: string,
): string {
  const parts = classpath.split(cpSep).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const name = jarFileName(part);
    if (moduleJarNames.has(name)) continue;
    const key = part.replace(/\\/g, "/").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  const versionKey = versionJar.replace(/\\/g, "/").toLowerCase();
  if (versionJar && !seen.has(versionKey)) {
    out.push(versionJar);
  }
  return out.join(cpSep);
}

/**
 * BootstrapLauncher 2.0.2 ignores classpath jars whose *filename* startsWith an
 * ignoreList entry. NeoForge ships `-DignoreList=client-extra,${version_name}.jar`.
 * Metta used to set version_name to `neoforge-21.1.265`, so ignoreList missed
 * `1.21.1.jar` → automatic module `_1._21._1` split-packages with `minecraft`.
 * Prism sets --version / version_name to the MC version so the JSON already matches.
 */
function collectIgnoreJarNames(
  versionJar: string,
  classpath: string,
  cpSep: string,
  minecraftVersion?: string,
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const n = raw.trim();
    if (!n) return;
    const key = n.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    names.push(n);
  };
  add(jarFileName(versionJar));
  const mc = minecraftVersion?.replace(/[/\\]/g, "").trim();
  if (mc) add(`${mc}.jar`);
  for (const part of classpath.split(cpSep)) {
    const n = jarFileName(part);
    if (isVanillaClientJarName(n)) add(n);
  }
  return names;
}

function appendJarsToIgnoreList(jvmArgs: string[], extraNames: string[]): string[] {
  if (!extraNames.length) return jvmArgs;
  let found = false;
  const mapped = jvmArgs.map((arg) => {
    if (!arg.startsWith("-DignoreList=")) return arg;
    found = true;
    const current = arg.slice("-DignoreList=".length);
    const parts = current.split(",").map((s) => s.trim()).filter(Boolean);
    const lower = new Set(parts.map((p) => p.toLowerCase()));
    for (const name of extraNames) {
      if (!lower.has(name.toLowerCase())) {
        parts.push(name);
        lower.add(name.toLowerCase());
      }
    }
    return `-DignoreList=${parts.join(",")}`;
  });
  if (found) return mapped;
  const usesForgeModules = jvmArgs.some((a) => a === "-p" || a === "--module-path");
  if (!usesForgeModules) return jvmArgs;
  return [
    `-DignoreList=bootstraplauncher,securejarhandler,asm,client-extra,forge-,${extraNames.join(",")}`,
    ...jvmArgs,
  ];
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
    .replaceAll("${classpath_separator}", rep.classpath_separator ?? ";")
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
  const rep2 = {
    ...rep,
    classpath: rep.classpath.split(cpSep).filter(Boolean).join(cpSep),
    classpath_separator: cpSep,
  };
  const jvm: string[] = [];
  jvm.push(`-Xms${minMb}M`);
  jvm.push(`-Xmx${maxMb}M`);

  let jvmPieces =
    v.arguments?.jvm && v.arguments.jvm.length > 0
      ? flatten(v.arguments.jvm as ArgPiece[], os, { has_custom_resolution: false }).map((part) =>
          normalizeJvmFlag(substitute(part, rep2)),
        )
      : [];

  jvm.push(...sanitizeExtraJvm(extraJvm, jvmPieces));

  /*
   * Prism/CurseForge: Forge's `-p` is only bootstrap/ModLauncher jars.
   * The Minecraft version JAR (1.20.1.jar) stays on `-cp` so Java 17+ does
   * not turn it into an automatic module (split package vs module `minecraft`,
   * which breaks Sinytra Connector). Jars already on `-p` must not also be on `-cp`.
   */
  jvmPieces = stripClasspathFlags(jvmPieces);
  jvmPieces = removeVersionJarFromModulePath(jvmPieces, cpSep, rep.primary_jar);
  const moduleJars = modulePathJarNames(jvmPieces, cpSep);
  const classpath = classpathWithoutModuleJars(
    rep2.classpath,
    cpSep,
    moduleJars,
    rep.primary_jar,
  );
  jvmPieces = appendJarsToIgnoreList(
    jvmPieces,
    collectIgnoreJarNames(rep.primary_jar, classpath, cpSep, rep.minecraft_version),
  );

  if (jvmPieces.length > 0) {
    jvm.push(...jvmPieces);
  } else {
    jvm.push(`-Djava.library.path=${rep.natives_directory}`);
  }
  jvm.push("-cp", classpath);
  jvm.push(v.mainClass);
  const game: string[] = [];
  if (v.minecraftArguments) {
    game.push(
      ...substitute(v.minecraftArguments, rep2)
        .split(" ")
        .filter(Boolean),
    );
  } else if (v.arguments?.game) {
    for (const part of flatten(v.arguments.game as ArgPiece[], os, { has_custom_resolution: false })) {
      const subbed = substitute(part, rep2);
      if (subbed) game.push(subbed);
    }
  }
  game.push(...extraGame);
  return [...jvm, ...game];
}

/** Strip JVM flags that require a newer JDK than the one in use. */
export function filterLaunchArgsForJava(argv: string[], javaPath: string): string[] {
  const m = javaPath.match(/jdk-(\d+)/i) || javaPath.match(/jre-(\d+)/i);
  const major = m ? Number(m[1]) : 21;
  const minMajor: Record<string, number> = {
    "--sun-misc-unsafe-memory-access": 25,
    "--enable-native-access": 21,
  };
  return argv.filter((arg) => {
    for (const [prefix, need] of Object.entries(minMajor)) {
      if (arg.startsWith(prefix) && major < need) return false;
    }
    return true;
  });
}
