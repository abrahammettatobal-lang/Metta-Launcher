/** Ejecuta una acción async y muestra el error en pantalla (Tauri invoke falla en silencio si no se captura). */
export async function tap(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    window.alert(`${label}\n\n${m}`);
    console.error(`[${label}]`, e);
  }
}
