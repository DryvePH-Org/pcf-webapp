# User guide

One short page per role. Everyone signs in the same way.

## Signing in (everyone)

1. Open the app and enter your work email.
2. Click **Send sign-in code**. An 8-digit code arrives by email within a minute.
3. Type the code and click **Verify code**.

You stay signed in on that device. There is no password. If you never get a
code, ask an administrator to check that your account exists and is active.

The app is installable: on a phone, use your browser's **Add to Home Screen**
(or **Install app** in the account menu on desktop).

## The one rule to remember

**Cash on hand + released vouchers = the fund amount.** The dashboard shows this
equation for the fund. If a physical count doesn't match, record it on the Cash
Count page and explain the difference.

## Email notifications (everyone)

You get an email when something needs you or something important happens to
your work — for example an approver gets one when a voucher is released, a
custodian when a voucher is flagged, accounting when a replenishment is
submitted, and admins when a cash count doesn't match or the fund runs low.
You are never emailed about something you did yourself. Each morning at 8:00 you
also get one short summary of what is still waiting on you, but only if there is
something.

Admins can see every email the app sent, and any that failed, under
**Admin → Notifications**.

---

## Custodian

You hold the fund and hand out the cash.

**Record an expense**
1. **Vouchers → New voucher**. Fill in date, payee, particulars, amount, and
   category. The amount can't exceed the per-transaction limit.
2. Attach a receipt photo (on a phone this opens the camera). No receipt? Give a
   reason instead.
3. **Save draft** to finish later, or **Save and release cash** to hand over
   the money now. Releasing lowers your expected cash by that amount.

**Count the cash** — **Cash Count**: enter what is physically in the box. If it
differs from the expected amount you must add a note.

**Restore the fund** — when cash runs low, **Replenishments → New
replenishment**. It bundles every released, approved, or flagged voucher not yet
reimbursed. Check the totals, then **Submit to accounting**.

A flagged voucher shows the approver's reason. It can't be edited; ask an admin
to void it, or ask the approver to approve it once the issue is resolved.

## Approver

You review expenses after the cash is out.

1. **Approvals** lists released vouchers, oldest first.
2. Open one and check the receipt and details.
3. **Approve** if it's fine, or **Flag** with a reason if something is wrong.
   Flagging doesn't take the cash back — it stays counted until an admin voids
   the voucher.

You can't review a voucher you prepared yourself.

## Accounting

You review replenishment requests and watch the numbers.

1. **Replenishments** → open a submitted request. Check the vouchers, receipt
   thumbnails, and totals by category.
2. **Approve**, or **Reject** with a note (the vouchers go back to the pool so
   the custodian can bundle them again).
3. After approving, **Mark as replenished and close** once the cash has been
   handed back. The vouchers become closed and the fund is whole again.

Also yours: **Reports** (spend by category, month, and payee, plus cash-count
variances, with CSV export) and the **Audit Trail** (every change, with who and
when).

## Administrator

You can do everything above, plus set the system up.

- **Admin → Users**: create a user with their email and role (they receive no
  password — they sign in with a code), change roles, deactivate people who
  leave.
- **Admin → Funds**: create the fund, set its amount, per-transaction limit,
  low-balance warning level, and custodian. Changing the fund amount changes the
  equation, so you're warned first.
- **Admin → Categories**: add, rename, or deactivate (never delete) categories.
- **Voiding**: only admins can void a voucher that has been released, and a
  reason is required. Voided records are kept for the audit trail.
