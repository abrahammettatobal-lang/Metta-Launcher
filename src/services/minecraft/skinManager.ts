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
  const entityDir = `${packRoot}/assets/minecraft/textures/entity`;

  await mkdirAllCmd(entityDir);

  // Write steve and alex skins
  await writeBinaryFile(`${entityDir}/steve.png`, skinData);
  await writeBinaryFile(`${entityDir}/alex.png`, skinData);

  // Create pack.mcmeta (Format 34 is for 1.21.x, but it will work with warning on older)
  const mcmeta = {
    pack: {
      pack_format: 34,
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
