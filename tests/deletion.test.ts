import { describe,it,expect } from 'vitest';
import { deletionFilters,deletionPhrase } from '@/lib/deletion';
describe('data deletion safeguards',()=>{
 it('requires a known scope',()=>{expect(deletionFilters.safeParse({mode:'users'}).success).toBe(false);});
 it('rejects invalid dates and inverted ranges',()=>{expect(deletionFilters.safeParse({mode:'receipts',from:'2026-02-30'}).success).toBe(false);expect(deletionFilters.safeParse({mode:'receipts',from:'2026-11-07',to:'2026-11-01'}).success).toBe(false);});
 it('rejects filters on a full reset',()=>{expect(deletionFilters.safeParse({mode:'reset',test:true}).success).toBe(false);});
 it('accepts scoped filters',()=>{expect(deletionFilters.safeParse({mode:'transactions',fund:'20000000-0000-4000-8000-000000000001',test:true}).success).toBe(true);});
 it('distinguishes reset confirmation from filtered deletion',()=>{expect(deletionPhrase('reset')).toBe('DELETE ALL APP DATA');expect(deletionPhrase('receipts')).toBe('DELETE SELECTED DATA');});
});
