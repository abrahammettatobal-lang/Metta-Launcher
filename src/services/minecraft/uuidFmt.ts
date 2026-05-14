export function uuidWithHyphens(raw: string): string {
  const s = raw.replace(/-/g, "");
  if (s.length !== 32) return raw;
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
