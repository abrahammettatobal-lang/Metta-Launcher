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
  
  // Rutas antiguas (<= 1.20.1)
  const oldEntityDir = `${packRoot}/assets/minecraft/textures/entity`;
  await mkdirAllCmd(oldEntityDir);
  await writeBinaryFile(`${oldEntityDir}/steve.png`, skinData);
  await writeBinaryFile(`${oldEntityDir}/alex.png`, skinData);

  // Rutas nuevas (>= 1.20.2)
  const slimDir = `${packRoot}/assets/minecraft/textures/entity/player/slim`;
  const wideDir = `${packRoot}/assets/minecraft/textures/entity/player/wide`;
  await mkdirAllCmd(slimDir);
  await mkdirAllCmd(wideDir);

  const defaultNames = ["steve", "alex", "ari", "efe", "kai", "makena", "noor", "sunny", "zuri"];
  for (const name of defaultNames) {
    await writeBinaryFile(`${slimDir}/${name}.png`, skinData);
    await writeBinaryFile(`${wideDir}/${name}.png`, skinData);
  }

  // mcmeta con 'supported_formats' para que no marque incompatibilidad en ninguna versión
  const mcmeta = {
    pack: {
      pack_format: 34,
      supported_formats: [1, 99],
      description: "Skin Personalizada (Metta Launcher)",
    },
  };
  await writeTextFile(`${packRoot}/pack.mcmeta`, JSON.stringify(mcmeta, null, 2));

  // Enable the resource pack in options.txt
  const optionsPath = `${instancePath}/options.txt`;
  let optionsText = "";
  if (await pathExists(optionsPath)) {
    optionsText = await readTextFile(optionsPath);
  }

  const lines = optionsText.split(/\r?\n/);
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("resourcePacks:")) {
      found = true;
      let currentPacks = [];
      try {
        const val = lines[i].substring("resourcePacks:".length);
        currentPacks = JSON.parse(val);
      } catch (e) {
        currentPacks = ["vanilla"];
      }
      
      // Add MettaSkin if not present
      if (!currentPacks.includes("file/MettaSkin") && !currentPacks.includes("file/MettaSkin.zip") && !currentPacks.includes("MettaSkin")) {
        // usually format is file/MettaSkin
        currentPacks.push("file/MettaSkin");
      }
      lines[i] = `resourcePacks:${JSON.stringify(currentPacks)}`;
      break;
    }
  }

  if (!found) {
    lines.push(`resourcePacks:["vanilla","file/MettaSkin"]`);
  }

  await writeTextFile(optionsPath, lines.join("\n"));
}
