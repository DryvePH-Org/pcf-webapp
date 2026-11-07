// Request numbers are stored as "BR-" plus a full UUID. People read and quote
// the first block; the full value stays in exports and search.
export function shortRef(value: string) {
  const match = /^([A-Za-z]+)-([0-9A-Fa-f]{8})-[0-9A-Fa-f-]{20,}$/.exec(value);
  return match ? `${match[1]}-${match[2].toUpperCase()}` : value;
}
