import { describe, expect, it } from 'vitest';

import {
  createCategorySchema,
  renameCategorySchema,
  setCategoryActiveSchema,
} from '@/lib/validators/category';
import { fundFormSchema, saveFundSchema } from '@/lib/validators/fund';
import {
  createUserSchema,
  roleSchema,
  setUserActiveSchema,
  updateUserRoleSchema,
} from '@/lib/validators/user';

const validFund = {
  name: 'Main Petty Cash',
  amount: '10000.00',
  per_txn_limit: '1000.00',
  low_balance_pct: 25,
  custodian_id: 'none',
};

describe('fundFormSchema', () => {
  it('accepts a valid fund', () => {
    expect(fundFormSchema.safeParse(validFund).success).toBe(true);
  });

  it('accepts a uuid custodian', () => {
    expect(
      fundFormSchema.safeParse({
        ...validFund,
        custodian_id: '00000000-0000-4000-8000-000000000002',
      }).success,
    ).toBe(true);
  });

  it('rejects a per-transaction limit above the fund amount', () => {
    const result = fundFormSchema.safeParse({
      ...validFund,
      per_txn_limit: '10000.01',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/cannot exceed/i);
    }
  });

  it('rejects zero, negative, and over-precise money', () => {
    for (const amount of ['0', '0.00', '-5', '10.001', '1,000']) {
      expect(
        fundFormSchema.safeParse({ ...validFund, amount }).success,
        amount,
      ).toBe(false);
    }
  });

  it('rejects an invalid custodian id and low-balance percentage', () => {
    expect(
      fundFormSchema.safeParse({ ...validFund, custodian_id: 'nobody' })
        .success,
    ).toBe(false);
    expect(
      fundFormSchema.safeParse({ ...validFund, low_balance_pct: 0 }).success,
    ).toBe(false);
    expect(
      fundFormSchema.safeParse({ ...validFund, low_balance_pct: 101 }).success,
    ).toBe(false);
    expect(
      fundFormSchema.safeParse({ ...validFund, low_balance_pct: 25.5 }).success,
    ).toBe(false);
  });

  it('allows the confirmation flag on save', () => {
    expect(
      saveFundSchema.safeParse({
        ...validFund,
        id: '00000000-0000-4000-8000-0000000000aa',
        confirmAmountChange: true,
      }).success,
    ).toBe(true);
  });
});

describe('category schemas', () => {
  it('trims and requires a name', () => {
    expect(createCategorySchema.parse({ name: '  Supplies ' }).name).toBe(
      'Supplies',
    );
    expect(createCategorySchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(
      createCategorySchema.safeParse({ name: 'x'.repeat(61) }).success,
    ).toBe(false);
  });

  it('validates ids and active flags', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(renameCategorySchema.safeParse({ id, name: 'Travel' }).success).toBe(
      true,
    );
    expect(renameCategorySchema.safeParse({ id: 'x', name: 'Travel' }).success).toBe(
      false,
    );
    expect(setCategoryActiveSchema.safeParse({ id, isActive: false }).success).toBe(
      true,
    );
  });
});

describe('user schemas', () => {
  const validUser = {
    full_name: 'Maria Santos',
    email: 'Maria@Example.com',
    password: 'Secret123',
    role: 'custodian',
  };

  it('normalizes email and accepts a valid user', () => {
    const parsed = createUserSchema.parse(validUser);
    expect(parsed.email).toBe('maria@example.com');
  });

  it('rejects invalid emails, weak passwords, and unknown roles', () => {
    expect(
      createUserSchema.safeParse({ ...validUser, email: 'not-an-email' })
        .success,
    ).toBe(false);
    expect(
      createUserSchema.safeParse({ ...validUser, password: 'short1' }).success,
    ).toBe(false);
    expect(
      createUserSchema.safeParse({ ...validUser, password: 'lettersonly' })
        .success,
    ).toBe(false);
    expect(
      createUserSchema.safeParse({ ...validUser, password: '12345678' }).success,
    ).toBe(false);
    expect(
      createUserSchema.safeParse({ ...validUser, role: 'owner' }).success,
    ).toBe(false);
    expect(
      createUserSchema.safeParse({ ...validUser, full_name: ' ' }).success,
    ).toBe(false);
  });

  it('accepts every supported role', () => {
    for (const role of ['admin', 'custodian', 'approver', 'accounting']) {
      expect(roleSchema.safeParse(role).success).toBe(true);
    }
  });

  it('validates role and active updates', () => {
    const userId = '00000000-0000-4000-8000-000000000002';
    expect(updateUserRoleSchema.safeParse({ userId, role: 'approver' }).success).toBe(
      true,
    );
    expect(updateUserRoleSchema.safeParse({ userId: 'x', role: 'approver' }).success).toBe(
      false,
    );
    expect(setUserActiveSchema.safeParse({ userId, isActive: false }).success).toBe(
      true,
    );
  });
});
