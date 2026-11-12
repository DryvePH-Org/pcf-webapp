import { describe, expect, it, vi } from 'vitest';

// A tiny stand-in for check_rate_limit: counts hits per key like the database does.
const hits = new Map<string, number>();
vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (_name: string, args: { p_key: string; p_limit: number }) => {
      const count = (hits.get(args.p_key) ?? 0) + 1;
      hits.set(args.p_key, count);
      return { data: count <= args.p_limit, error: null };
    },
  }),
}));

import { isRepeat } from '@/lib/rate-limit';

describe('isRepeat', () => {
  it('lets the first send through and stops the same send repeated', async () => {
    hits.clear();
    const payload = { fund_id: 'f1', amount: '500.00', purpose: 'Taxi' };
    expect(await isRepeat('user-1', 'request:create', payload)).toBe(false);
    expect(await isRepeat('user-1', 'request:create', payload)).toBe(true);
    expect(await isRepeat('user-1', 'request:create', { ...payload })).toBe(true);
  });

  it('treats a different payload, person or action as a new send', async () => {
    hits.clear();
    const payload = { fund_id: 'f1', amount: '500.00', purpose: 'Taxi' };
    expect(await isRepeat('user-1', 'request:create', payload)).toBe(false);
    expect(await isRepeat('user-1', 'request:create', { ...payload, amount: '501.00' })).toBe(false);
    expect(await isRepeat('user-2', 'request:create', payload)).toBe(false);
    expect(await isRepeat('user-1', 'voucher:create', payload)).toBe(false);
  });
});
