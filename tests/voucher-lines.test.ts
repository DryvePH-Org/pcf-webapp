import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const enabled = Boolean(url && anonKey && process.env.RUN_DB_TESTS === 'true');

const DEV_PASSWORD = 'Phase1-Dev-Passw0rd';
const tag = `vitest-lines-${Date.now()}`;

let custodian: SupabaseClient;
let fundId: string;
let categories: string[];

function lines(...amounts: [string, number, number][]) {
  return amounts.map(([particulars, amount, cat]) => ({
    particulars,
    amount,
    category_id: categories[cat],
  }));
}

function create(items: unknown) {
  return custodian.rpc('create_voucher_lines', {
    p_fund_id: fundId,
    p_payee: `${tag} payee`,
    p_items: items,
    p_no_receipt_reason: 'No official receipt issued (integration test)',
  });
}

describe.skipIf(!enabled)('Multi-line vouchers', () => {
  beforeAll(async () => {
    custodian = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await custodian.auth.signInWithPassword({
      email: 'custodian@pcf.local',
      password: DEV_PASSWORD,
    });
    if (error) throw new Error(error.message);
    const { data: fund } = await custodian
      .from('funds')
      .select('id')
      .eq('name', 'Main Petty Cash')
      .single();
    fundId = fund!.id;
    const { data: cats } = await custodian
      .from('categories')
      .select('id')
      .eq('is_active', true)
      .limit(2);
    categories = cats!.map((c) => c.id);
    expect(categories.length).toBe(2);
  });

  it('stores every line and totals them on the voucher', async () => {
    const { data: id, error } = await create(
      lines(['Paper', 100.5, 0], ['Delivery fee', 200, 1], ['Tape', 50, 0]),
    );
    expect(error).toBeNull();
    const { data: voucher } = await custodian
      .from('vouchers')
      .select('amount, particulars, category_id, status')
      .eq('id', id)
      .single();
    expect(Number(voucher!.amount)).toBeCloseTo(350.5, 2);
    expect(voucher!.particulars).toBe('Paper; Delivery fee; Tape');
    expect(voucher!.category_id).toBe(categories[1]); // largest line
    const { data: items } = await custodian
      .from('voucher_items')
      .select('position, particulars, amount')
      .eq('voucher_id', id)
      .order('position');
    expect(items!.map((i) => i.particulars)).toEqual(['Paper', 'Delivery fee', 'Tape']);
  });

  it('applies the per-transaction limit to the total, not each line', async () => {
    const { error } = await create(
      lines(['A', 600, 0], ['B', 600, 1]),
    );
    expect(error?.message).toMatch(/per-transaction limit/);
  });

  it('rejects empty lists, blank particulars and bad amounts', async () => {
    expect((await create([])).error?.message).toMatch(/at least one line/);
    expect((await create(lines([' ', 10, 0]))).error?.message).toMatch(/particulars/);
    expect((await create(lines(['A', 0, 0]))).error?.message).toMatch(/greater than zero/);
  });

  it('does not let a custodian edit the totals directly', async () => {
    const { data: id } = await create(lines(['Pens', 10, 0]));
    const { error } = await custodian.from('vouchers').update({ amount: 1 }).eq('id', id);
    expect(error).not.toBeNull();
  });
});
