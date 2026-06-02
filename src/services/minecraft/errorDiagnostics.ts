/**
 * Error diagnostics for Minecraft launch failures.
 * Analyzes game log lines + exit code to produce actionable user-facing messages.
 */

export interface LaunchDiagnosis {
  /** Short title for the crash panel. */
  title: string;
  /** Human-readable probable cause. */
  cause: string;
  /** Suggested fix step(s). */
  suggestions: string[];
  /** Severity: fatal = game unusable, warn = may still work. */
  severity: "fatal" | "warn";
}

interface ErrorPattern {
  regex: RegExp;
  title: string;
  cause: string;
  suggestions: string[];
}

const PATTERNS: ErrorPattern[] = [
  {
    regex: /UnsupportedClassVersionError/,
    title: "Java incorrecto",
    cause: "La versión de Java instalada es demasiado antigua para esta versión de Minecraft.",
    suggestions: [
      "Instala Java 21 LTS desde Settings → Java.",
      "Para Minecraft 1.17+, necesitas Java 16 o superior.",
      "Para Minecraft 1.20.5+, necesitas Java 21.",
    ],
  },
  {
    regex: /java\.lang\.OutOfMemoryError|GC overhead limit|Java heap space/,
    title: "Sin memoria (RAM)",
    cause: "Minecraft se quedó sin RAM durante la ejecución.",
    suggestions: [
      "Aumenta la RAM máxima en la configuración de la instancia.",
      "Reduce mods que consumen mucha memoria.",
      "Para modpacks grandes, usa al menos 6-8 GB.",
    ],
  },
  {
    regex: /GLFW error|[Cc]ould not create context|OpenGL/,
    title: "Error de GPU / OpenGL",
    cause: "Minecraft no pudo inicializar el contexto gráfico OpenGL.",
    suggestions: [
      "Actualiza los drivers de tu tarjeta gráfica.",
      "Intenta desactivar OptiFine u otros mods de gráficos.",
      "En laptops con GPU dual, asegúrate de usar la GPU dedicada.",
    ],
  },
  {
    regex: /ModLoadingException|fml\.common\.LoaderException|java\.lang\.NoClassDefFoundError.*forge/i,
    title: "Mod incompatible",
    cause: "Uno o más mods fallaron al cargar, probablemente incompatibles con esta versión.",
    suggestions: [
      "Revisa los logs para el nombre del mod que falla.",
      "Actualiza el mod a una versión compatible.",
      "Intenta lanzar sin mods para aislar el problema.",
    ],
  },
  {
    regex: /Could not find required mod|missing mod/i,
    title: "Dependencia de mod faltante",
    cause: "Un mod requiere otro mod que no está instalado.",
    suggestions: [
      "Instala la dependencia indicada en los logs.",
      "Descarga el mod desde Modrinth o CurseForge.",
    ],
  },
  {
    regex: /ClassNotFoundException|NoClassDefFoundError/,
    title: "Librería o clase faltante",
    cause: "Minecraft no encontró una clase Java necesaria. Puede ser una librería corrupta.",
    suggestions: [
      "Repara la instancia desde el menú de instancias.",
      "Borra la carpeta libraries y vuelve a lanzar.",
    ],
  },
  {
    regex: /ZipException|Invalid or corrupt jarfile|zip file is empty/i,
    title: "Archivo JAR corrupto",
    cause: "Un archivo .jar descargado está corrupto o incompleto.",
    suggestions: [
      "Elimina el archivo indicado en los logs.",
      "Vuelve a lanzar para que se descargue de nuevo.",
    ],
  },
  {
    regex: /Access is denied|Permission denied|AccessDeniedException/,
    title: "Sin permisos de acceso",
    cause: "El launcher no tiene permisos para leer o escribir en la carpeta necesaria.",
    suggestions: [
      "Ejecuta el launcher como administrador.",
      "Verifica que la carpeta de instancias no esté bloqueada por otro programa.",
      "Agrega la carpeta del launcher a las exclusiones del antivirus.",
    ],
  },
  {
    regex: /ConnectException|SocketTimeoutException|UnknownHostException/,
    title: "Error de red",
    cause: "Minecraft no pudo conectarse a los servidores de Mojang.",
    suggestions: [
      "Verifica tu conexión a internet.",
      "Si usas VPN, intenta desactivarla.",
      "Los servidores de Mojang pueden estar caídos.",
    ],
  },
];

/**
 * Analyze a list of recent log lines + exit code to produce a diagnosis.
 * Returns null if no specific pattern was detected.
 */
export function diagnoseLaunchFailure(
  lines: string[],
  exitCode: number | null,
): LaunchDiagnosis | null {
  const haystack = lines.join("\n");

  for (const pattern of PATTERNS) {
    if (pattern.regex.test(haystack)) {
      return {
        title: pattern.title,
        cause: pattern.cause,
        suggestions: pattern.suggestions,
        severity: "fatal",
      };
    }
  }

  // Generic fallback based on exit code
  if (exitCode !== null && exitCode !== 0) {
    return {
      title: `Salida inesperada (código ${exitCode})`,
      cause: "Minecraft se cerró de forma inesperada sin un error reconocible en los logs.",
      suggestions: [
        "Revisa los logs completos para más detalles.",
        "Intenta lanzar con menos mods.",
        "Verifica que Java y los archivos de la instancia estén correctos.",
      ],
      severity: "fatal",
    };
  }

  return null;
}
