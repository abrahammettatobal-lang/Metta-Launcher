import { appPaths } from "../services/bridge";

export async function fullPath(rel: string): Promise<string> {
  const { launcherRoot } = await appPaths();
  const a = launcherRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const b = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${a}/${b}`;
}
