import { appPaths } from "../services/bridge";

/** Strip Windows `\\?\` / `//?/` extended paths — Java classpath cannot load jars through them. */
export function simplifyPath(p: string): string {
  let s = p.trim();
  if (s.startsWith("\\\\?\\UNC\\")) {
    s = `\\\\${s.slice(8)}`;
  } else if (s.startsWith("\\\\?\\")) {
    s = s.slice(4);
  } else if (s.startsWith("//?/UNC/")) {
    s = `//${s.slice(8)}`;
  } else if (s.startsWith("//?/")) {
    s = s.slice(4);
  }
  return s.replace(/\\/g, "/");
}

export async function fullPath(rel: string): Promise<string> {
  const { launcherRoot } = await appPaths();
  const a = simplifyPath(launcherRoot).replace(/\/+$/, "");
  const b = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${a}/${b}`;
}
