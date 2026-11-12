import { describe, expect, it } from 'vitest';

import { changePasswordSchema, resetPasswordSchema } from '@/lib/validators/auth';

describe('changePasswordSchema', () => {
  const ok = { current: 'old-password-1', next: 'brand new pass', confirm: 'brand new pass' };

  it('accepts a valid change', () => {
    expect(changePasswordSchema.safeParse(ok).success).toBe(true);
  });

  it('needs the current password, 8+ characters, and a matching confirmation', () => {
    expect(changePasswordSchema.safeParse({ ...ok, current: '' }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...ok, next: 'short', confirm: 'short' }).success).toBe(false);
    const mismatch = changePasswordSchema.safeParse({ ...ok, confirm: 'something else' });
    expect(mismatch.success).toBe(false);
    expect(mismatch.error?.issues[0]?.path).toEqual(['confirm']);
  });

  it('refuses reusing the current password', () => {
    const same = changePasswordSchema.safeParse({ current: 'same-password', next: 'same-password', confirm: 'same-password' });
    expect(same.success).toBe(false);
    expect(same.error?.issues[0]?.path).toEqual(['next']);
  });

  it('keeps passwords exactly as typed (no trimming)', () => {
    const parsed = changePasswordSchema.parse({ current: 'x', next: '  spaced pass  ', confirm: '  spaced pass  ' });
    expect(parsed.next).toBe('  spaced pass  ');
  });
});

describe('resetPasswordSchema', () => {
  it('needs a real user id and a long enough password', () => {
    expect(resetPasswordSchema.safeParse({ userId: '00000000-0000-4000-8000-000000000002', password: 'Abcdefg-hijkmnp' }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ userId: 'nope', password: 'Abcdefg-hijkmnp' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ userId: '00000000-0000-4000-8000-000000000002', password: 'short' }).success).toBe(false);
  });
});
