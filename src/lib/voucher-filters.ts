// The vouchers list and its CSV export filter the same way, so the export is exactly what the filters show.
type Filterable<T> = {
  eq(column: string, value: string): T;
  or(filter: string): T;
  gte(column: string, value: string): T;
  lte(column: string, value: string): T;
};

export function applyVoucherFilters<T extends Filterable<T>>(
  query: T,
  filters: { status?: string; q: string; from: string; to: string },
): T {
  let next = query;
  if (filters.status) next = next.eq("status", filters.status);
  if (filters.q) {
    const safe = filters.q.replace(/[,%()"\\]/g, " ").trim();
    if (safe) next = next.or(`pcv_number.ilike.%${safe}%,payee.ilike.%${safe}%`);
  }
  if (filters.from) next = next.gte("voucher_date", filters.from);
  if (filters.to) next = next.lte("voucher_date", filters.to);
  return next;
}
