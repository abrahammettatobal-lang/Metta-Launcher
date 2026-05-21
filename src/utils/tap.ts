/** Ejecuta una acción async y muestra errores con toast (sin alert). */
export async function tap(
  label: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    window.dispatchEvent(
      new CustomEvent("metta-toast", {
        detail: { kind: "error", title: label, message: m },
      }),
    );
    console.error(`[${label}]`, e);
  }
}

export function toastOk(title: string, message?: string) {
  window.dispatchEvent(
    new CustomEvent("metta-toast", {
      detail: { kind: "success", title, message },
    }),
  );
}

export function toastWarn(title: string, message?: string) {
  window.dispatchEvent(
    new CustomEvent("metta-toast", {
      detail: { kind: "warning", title, message },
    }),
  );
}

export function toastInfo(title: string, message?: string) {
  window.dispatchEvent(
    new CustomEvent("metta-toast", {
      detail: { kind: "info", title, message },
    }),
  );
}
