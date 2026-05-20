export type ClassValue =
  | string
  | number
  | false
  | null
  | undefined
  | ClassValue[];

export function cx(...inputs: ClassValue[]): string {
  const out: string[] = [];
  const walk = (v: ClassValue) => {
    if (!v && v !== 0) return;
    if (typeof v === "string" || typeof v === "number") {
      out.push(String(v));
      return;
    }
    if (Array.isArray(v)) v.forEach(walk);
  };
  inputs.forEach(walk);
  return out.join(" ");
}
