import { describe, expect, it } from 'vitest';

import {
  ACTION_ROLES,
  ALL_ROLES,
  ROLE_LABELS,
  canAccessRoute,
  canPerform,
  type Action,
  type Role,
} from '@/lib/permissions';
import { isNavActive, mobileNavFor, navGroupsFor } from '@/lib/navigation';

describe('canAccessRoute', () => {
  it.each<[Role, string, boolean]>([
    ['admin', '/dashboard', true],
    ['admin', '/vouchers', true],
    ['admin', '/approvals', true],
    ['admin', '/replenishments', true],
    ['admin', '/cash-count', true],
    ['admin', '/reports', true],
    ['admin', '/audit', true],
    ['admin', '/admin/users', true],
    ['admin', '/admin/funds', true],
    ['admin', '/admin/categories', true],
    ['custodian', '/vouchers', true],
    ['custodian', '/vouchers/new', true],
    ['custodian', '/cash-count', true],
    ['custodian', '/approvals', false],
    ['custodian', '/reports', false],
    ['custodian', '/audit', false],
    ['custodian', '/admin/users', false],
    ['approver', '/approvals', true],
    ['approver', '/vouchers', false],
    ['approver', '/replenishments', false],
    ['approver', '/admin/funds', false],
    ['accounting', '/replenishments', true],
    ['accounting', '/reports', true],
    ['accounting', '/audit', true],
    ['accounting', '/vouchers', false],
    ['accounting', '/cash-count', false],
    ['accounting', '/admin/categories', false],
  ])('%s on %s → %s', (role, pathname, expected) => {
    expect(canAccessRoute(role, pathname)).toBe(expected);
  });

  it('matches nested routes but not sibling prefixes', () => {
    expect(canAccessRoute('custodian', '/vouchers/abc/receipt')).toBe(true);
    expect(canAccessRoute('custodian', '/vouchers-archive')).toBe(false);
  });

  it('denies unknown routes to every role', () => {
    for (const role of ALL_ROLES) {
      expect(canAccessRoute(role, '/login')).toBe(false);
      expect(canAccessRoute(role, '/unknown')).toBe(false);
      expect(canAccessRoute(role, '/')).toBe(false);
    }
  });

  it('lets every role reach the dashboard', () => {
    for (const role of ALL_ROLES) {
      expect(canAccessRoute(role, '/dashboard')).toBe(true);
    }
  });
});

describe('canPerform', () => {
  it('separates duties between custodian, approver, and accounting', () => {
    const custodianActions: Action[] = [
      'voucher.create',
      'voucher.submit',
      'voucher.release',
      'voucher.void',
      'replenishment.create',
      'replenishment.submit',
      'cash.count',
    ];
    for (const action of custodianActions) {
      expect(canPerform('custodian', action)).toBe(true);
    }

    expect(canPerform('approver', 'voucher.approve')).toBe(true);
    expect(canPerform('approver', 'voucher.reject')).toBe(true);
    expect(canPerform('approver', 'voucher.create')).toBe(false);
    expect(canPerform('approver', 'voucher.release')).toBe(false);

    expect(canPerform('accounting', 'replenishment.review')).toBe(true);
    expect(canPerform('accounting', 'replenishment.close')).toBe(true);
    expect(canPerform('accounting', 'replenishment.create')).toBe(false);
    expect(canPerform('accounting', 'voucher.approve')).toBe(false);
  });

  it('grants admin every action', () => {
    for (const action of Object.keys(ACTION_ROLES) as Action[]) {
      expect(canPerform('admin', action)).toBe(true);
    }
  });

  it('never grants an action to a role outside its map', () => {
    for (const [action, roles] of Object.entries(ACTION_ROLES)) {
      for (const role of ALL_ROLES) {
        expect(canPerform(role, action as Action)).toBe(
          roles.includes(role),
        );
      }
    }
  });
});

describe('ROLE_LABELS', () => {
  it('labels every role', () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
  });
});

describe('navigation', () => {
  it('only exposes routes the role can access', () => {
    for (const role of ALL_ROLES) {
      for (const group of navGroupsFor(role)) {
        for (const item of group.items) {
          expect(canAccessRoute(role, item.href)).toBe(true);
        }
      }
    }
  });

  it('lists administration only for admins', () => {
    expect(navGroupsFor('admin').map((group) => group.label)).toEqual([
      'Operations',
      'Administration',
    ]);
    for (const role of ALL_ROLES.filter((candidate) => candidate !== 'admin')) {
      expect(navGroupsFor(role).map((group) => group.label)).toEqual([
        'Operations',
      ]);
    }
  });

  it('splits mobile tabs into at most four primary items', () => {
    for (const role of ALL_ROLES) {
      const { primary, overflow } = mobileNavFor(role);
      expect(primary.length).toBeLessThanOrEqual(4);
      expect(primary.length + overflow.length).toBe(
        navGroupsFor(role).flatMap((group) => group.items).length,
      );
    }
  });

  it('marks a nav item active for its own route and children', () => {
    expect(isNavActive('/vouchers', '/vouchers')).toBe(true);
    expect(isNavActive('/vouchers/new', '/vouchers')).toBe(true);
    expect(isNavActive('/vouchers-archive', '/vouchers')).toBe(false);
    expect(isNavActive('/dashboard', '/vouchers')).toBe(false);
  });
});
