import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
it('full reset mutations have predicates required by Supabase safeupdate',()=>{
 const sql=readFileSync('supabase/migrations/20261107110000_phase28_safe_data_reset.sql','utf8');
 const mutations=sql.split(';').filter(statement=>/\b(delete from|update \w+ set)\b/i.test(statement));
 expect(mutations.length).toBeGreaterThan(10);
 for(const mutation of mutations)expect(mutation).toMatch(/\bwhere\b/i);
});
