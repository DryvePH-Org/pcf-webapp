import { z } from 'zod';
export const deletionFilters = z.object({
 mode: z.enum(['reset','transactions','receipts','photos']),
 fund: z.union([z.uuid(),z.literal('')]).default(''),
 custodian: z.union([z.uuid(),z.literal('')]).default(''),
 from: z.union([z.iso.date(),z.literal('')]).default(''),
 to: z.union([z.iso.date(),z.literal('')]).default(''),
 test: z.boolean().default(false),
}).refine(p=>!p.from||!p.to||p.from<=p.to,'Start date must be before end date')
.refine(p=>p.mode!=='reset'||(!p.fund&&!p.custodian&&!p.from&&!p.to&&!p.test),'Clear filters for a full reset');
export type DeletionFilters = z.infer<typeof deletionFilters>;
export type DeletionPreview = {id:string;plan:{vouchers:string[];liquidations:string[];requests:string[];replenishments:string[];files:{bucket:string;path:string}[];funds:number;categories:number}};
export function deletionPhrase(mode: DeletionFilters['mode']) { return mode==='reset'?'DELETE ALL APP DATA':'DELETE SELECTED DATA'; }
