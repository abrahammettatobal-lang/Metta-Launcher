import { mkdirAllCmd, pathExists, readTextFile, writeBinaryFile, writeTextFile } from "../bridge";

export async function fetchSkinData(username: string): Promise<Uint8Array> {
  const url = `https://minotar.net/skin/${username}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`No se pudo obtener la skin de ${username} (HTTP ${res.status})`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export async function applySkinAsResourcePack(
  instancePath: string,
  skinData: Uint8Array,
): Promise<void> {
  const packRoot = `${instancePath}/resourcepacks/MettaSkin`;

  const oldEntityDir = `${packRoot}/assets/minecraft/textures/entity`;
  await mkdirAllCmd(oldEntityDir);
  await writeBinaryFile(`${oldEntityDir}/steve.png`, skinData);
  await writeBinaryFile(`${oldEntityDir}/alex.png`, skinData);

  const slimDir = `${packRoot}/assets/minecraft/textures/entity/player/slim`;
  const wideDir = `${packRoot}/assets/minecraft/textures/entity/player/wide`;
  await mkdirAllCmd(slimDir);
  await mkdirAllCmd(wideDir);

  const defaultNames = [
    "steve", "alex", "ari", "efe", "kai",
    "makena", "noor", "sunny", "zuri",
  ];
  for (const name of defaultNames) {
    await writeBinaryFile(`${slimDir}/${name}.png`, skinData);
    await writeBinaryFile(`${wideDir}/${name}.png`, skinData);
  }

  const mcmeta = {
    pack: {
      pack_format: 34,
      supported_formats: [1, 99],
      description: "Skin Personalizada (Metta Launcher)",
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
  const lines = optionsText.length
    ? optionsText.split(/\r?\n/)
    : [];

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
