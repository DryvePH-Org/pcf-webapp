import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { pickClientIp } from '@/lib/rate-limit';

const from = (entries: Record<string, string>) => new Headers(entries);

describe('pickClientIp', () => {
  it('prefers the address the proxy vouched for', () => {
    expect(pickClientIp(from({ 'x-pcf-client-ip': '203.0.113.7', 'x-forwarded-for': '162.158.1.1' }))).toBe('203.0.113.7');
    expect(pickClientIp(from({ 'x-pcf-client-ip': '2001:db8::1' }))).toBe('2001:db8::1');
  });

  it('falls back to the forwarded address, then to unknown', () => {
    expect(pickClientIp(from({ 'x-forwarded-for': '198.51.100.4, 10.0.0.1' }))).toBe('198.51.100.4');
    expect(pickClientIp(from({}))).toBe('unknown');
  });

  it('ignores a client-supplied Cloudflare header and junk values', () => {
    expect(pickClientIp(from({ 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '198.51.100.4' }))).toBe('198.51.100.4');
    expect(pickClientIp(from({ 'x-pcf-client-ip': '', 'x-forwarded-for': 'evil<script>' }))).toBe('unknown');
  });
});
