import {
  mkdirAllCmd,
  pathExists,
  readTextFile,
  writeBinaryFile,
  writeTextFile,
} from "../bridge";

export type SkinModel = "classic" | "slim";

/**
 * Installs a skin PNG as a resource pack inside an instance.
 *
 * The PNG must be a canonical 64x64 Minecraft skin (the format Mojang's
 * own session API serves). Legacy 64x32 textures will render mangled UVs;
 * always prefer `resolve_minecraft_skin` from the backend over Minotar.
 *
 * Only the player textures matching the given model are written, so the
 * vanilla auto-select between Steve (classic, 4px arms) and Alex (slim,
 * 3px arms) does not produce wrong-arm rendering.
 */
export async function applySkinAsResourcePack(
  instancePath: string,
  skinData: Uint8Array,
  model: SkinModel,
): Promise<void> {
  const packRoot = `${instancePath}/resourcepacks/MettaSkin`;

  // Legacy entity textures (used by Minecraft <= 1.20.1).
  const legacyEntityDir = `${packRoot}/assets/minecraft/textures/entity`;
  await mkdirAllCmd(legacyEntityDir);
  await writeBinaryFile(`${legacyEntityDir}/steve.png`, skinData);
  await writeBinaryFile(`${legacyEntityDir}/alex.png`, skinData);

  // Modern player textures (>= 1.20.2). Each default character is tied to a
  // specific body model, so writing to the wrong folder breaks rendering.
  // We only populate the folder matching the supplied skin model.
  const classicNames = ["steve", "efe", "kai", "noor", "sunny"];
  const slimNames = ["alex", "ari", "makena", "zuri"];

  const targetDir =
    model === "slim"
      ? `${packRoot}/assets/minecraft/textures/entity/player/slim`
      : `${packRoot}/assets/minecraft/textures/entity/player/wide`;
  await mkdirAllCmd(targetDir);

  const names = model === "slim" ? slimNames : classicNames;
  for (const name of names) {
    await writeBinaryFile(`${targetDir}/${name}.png`, skinData);
  }

  const mcmeta = {
    pack: {
      pack_format: 34,
      supported_formats: [1, 99],
      description: `Skin Personalizada (${model === "slim" ? "Slim" : "Classic"}) — Metta Launcher`,
    },
  };
  await writeTextFile(`${packRoot}/pack.mcmeta`, JSON.stringify(mcmeta, null, 2));

  const packId = "file/MettaSkin";
  await upsertOptionLine(instancePath, "resourcePacks", packId);
  await upsertOptionLine(instancePath, "incompatibleResourcePacks", packId);
}

async function upsertOptionLine(
  instancePath: string,
  key: string,
  packId: string,
): Promise<void> {
  const optionsPath = `${instancePath}/options.txt`;
  let optionsText = "";
  if (await pathExists(optionsPath)) {
    optionsText = await readTextFile(optionsPath);
  }
  const lines = optionsText.length ? optionsText.split(/\r?\n/) : [];

  let found = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(`${key}:`)) {
      found = true;
      let arr: string[] = [];
      try {
        arr = JSON.parse(lines[i].substring(key.length + 1));
        if (!Array.isArray(arr)) arr = [];
      } catch {
        arr = key === "resourcePacks" ? ["vanilla"] : [];
      }
      if (!arr.includes(packId)) arr.push(packId);
      lines[i] = `${key}:${JSON.stringify(arr)}`;
      break;
    }
  }
  if (!found) {
    const base = key === "resourcePacks" ? ["vanilla", packId] : [packId];
    lines.push(`${key}:${JSON.stringify(base)}`);
  }
  await writeTextFile(optionsPath, lines.join("\n"));
}
