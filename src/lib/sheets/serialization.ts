/** Keep wire payloads deterministic across Postgres jsonb storage round trips.
 * Object key order is not meaningful; batch/row array order remains meaningful.
 */
export function stableJson(value: unknown): string {
 function ordered(item:unknown):unknown {
  if(Array.isArray(item))return item.map(ordered);
  if(item!==null&&typeof item==='object')return Object.fromEntries(Object.entries(item).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,v])=>[key,ordered(v)]));
  return item;
 }
 return JSON.stringify(ordered(value));
}
