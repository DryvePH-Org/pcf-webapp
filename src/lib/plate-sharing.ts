// One plate number for a whole liquidation, typed once at the top, with the freedom to give one line its own.
// A line "follows" the shared plate until its plate is changed to something else; from then on it keeps its own.
export type PlateAccess<T> = { get: (line: T) => string; set: (line: T, plate: string) => T };

const same = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();

// The shared plate of lines that already exist (a saved draft): the plate most lines use. Lines with a different
// plate keep it as their own; lines with none follow the shared one.
export function deriveShared<T extends { id: string }>(lines: T[], access: PlateAccess<T>): { shared: string; own: string[] } {
  const counts = new Map<string, { value: string; n: number }>();
  for (const line of lines) {
    const value = access.get(line).trim();
    if (!value) continue;
    const key = value.toUpperCase();
    const seen = counts.get(key);
    counts.set(key, { value: seen?.value ?? value, n: (seen?.n ?? 0) + 1 });
  }
  let best: { value: string; n: number } | null = null;
  for (const entry of counts.values()) if (!best || entry.n > best.n) best = entry;
  const shared = best?.value ?? "";
  const own = lines.filter((line) => access.get(line).trim() !== "" && !same(access.get(line), shared)).map((line) => line.id);
  return { shared, own };
}

// Every line that follows gets the shared plate; lines with their own plate are left alone.
export function applyShared<T extends { id: string }>(lines: T[], shared: string, own: string[], access: PlateAccess<T>): T[] {
  return lines.map((line) => (own.includes(line.id) ? line : access.set(line, shared)));
}

// A line was changed by hand: it keeps its own plate if that differs from the shared one, and follows again if not.
export function ownAfterEdit(own: string[], lineId: string, plate: string, shared: string): string[] {
  const rest = own.filter((id) => id !== lineId);
  return plate.trim() !== "" && !same(plate, shared) ? [...rest, lineId] : rest;
}

// "N/A" in every empty field that can take it, never over something typed. Returns how many were filled.
export function fillEmptyNa<T extends Record<string, unknown>>(lines: T[], fields: readonly (keyof T & string)[]): { lines: T[]; filled: number } {
  let filled = 0;
  const next = lines.map((line) => {
    const patch: Record<string, string> = {};
    for (const field of fields) {
      if (String(line[field] ?? "").trim() === "") {
        patch[field] = "N/A";
        filled += 1;
      }
    }
    return Object.keys(patch).length ? { ...line, ...patch } : line;
  });
  return { lines: next, filled };
}
