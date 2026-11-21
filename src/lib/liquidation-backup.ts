import { parseMoney } from "@/lib/money";
import type { LiquidationFormValues } from "@/lib/validators/liquidation";

// What a person is typing in the liquidation form is also kept on their own device, so a page that reloads by
// itself (a phone browser coming back from the camera, a new version of the app, a discarded tab) does not lose it.
// The copy remembers which saved version it was built on, so it only comes back when the server has nothing newer.
const PREFIX = "pcf:liquidation-draft:";
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Backup = { values: LiquidationFormValues; base: string; at: number };

// The same form compared without typing differences ("450" and "450.00", stray spaces).
export function normalizeForm(values: LiquidationFormValues): string {
  return JSON.stringify({
    department: values.department.trim(),
    filing_date: values.filing_date,
    unspent_reason: values.unspent_reason.trim(),
    items: values.items.map((item) => {
      const cents = parseMoney(item.amount);
      return {
        id: item.id,
        particulars: item.particulars.trim(),
        amount: cents === null ? item.amount.trim() : (cents / 100).toFixed(2),
        receipt_path: item.receipt_path,
        extra_photos: item.extra_photos ?? [],
        no_receipt_reason: item.no_receipt_reason.trim(),
        plate: (item.sheet_details as { plate?: string } | undefined)?.plate?.trim() ?? "",
      };
    }),
  });
}

export function browserStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function saveBackup(store: Store | null, values: LiquidationFormValues, base: LiquidationFormValues) {
  if (!store) return;
  try {
    const backup: Backup = { values, base: normalizeForm(base), at: Date.now() };
    store.setItem(PREFIX + values.id, JSON.stringify(backup));
  } catch {
    // storage full or blocked: the server save still protects the work
  }
}

export function clearBackup(store: Store | null, id: string) {
  try {
    store?.removeItem(PREFIX + id);
  } catch {
    // nothing to do
  }
}

// The values to bring back, or null when there is nothing to restore.
export function restorable(store: Store | null, server: LiquidationFormValues, now = Date.now()): LiquidationFormValues | null {
  if (!store) return null;
  try {
    const raw = store.getItem(PREFIX + server.id);
    if (!raw) return null;
    const backup = JSON.parse(raw) as Backup;
    if (!backup?.values || backup.values.id !== server.id || now - backup.at > MAX_AGE_MS) return null;
    const serverNow = normalizeForm(server);
    // built on a different saved version (someone else changed it, or it was saved since): the saved one wins
    if (backup.base !== serverNow) return null;
    return normalizeForm(backup.values) === serverNow ? null : backup.values;
  } catch {
    return null;
  }
}
