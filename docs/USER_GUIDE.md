# User guide

One short page per role. Everyone signs in the same way.

## Signing in (everyone)

1. Ask an administrator to create your account with your email, password, and role.
2. Open the app and enter your email and password, then click **Sign in**.

No email code is needed. If you cannot sign in, ask an administrator to check
that your account is active and that you have the correct credentials.

The app is installable: on a phone, use your browser's **Add to Home Screen**
(or **Install app** in the account menu on desktop).

## The one rule to remember

**Cash on hand + released vouchers = the fund amount.** The dashboard shows this
equation for the fund. Budget requests and their approval do not reduce cash;
only recording the actual cash release does.

## Request a budget (everyone)

All roles can request a budget, including users whose main role is **Requester**.

1. Open **Budget Requests → Request a budget**. Enter your name, amount, and
   purpose, then choose a fund. Its assigned custodians appear beside its name.
2. Submit. The request shows **Awaiting custodian review**. A custodian assigned
   to that fund or another admin can approve it or reject it with a reason.
3. After approval, a custodian prepares the linked PCV. Request approval itself
   does not hand out cash and does not replace the PCV's approval rules.
4. Open your request to track its status and linked voucher's cash release.
   Use **Print** or **Export CSV** on the detail page. The list exports its
   displayed page (20 records) and supports status and own-request filters.

You can cancel your submitted or approved request before a voucher is created.
Rejected requests are retained; submit a new request if the budget is still
needed. You cannot review or prepare a voucher for your own request.

Standalone requesters see their own requests and linked voucher summaries, not
fund balances or other employees' requests. Staff retain their main-role access.

## Large requests need an approver first

Each fund has an **approval limit** (default ₱3,000, set by the admin on the Funds
page) and a **per-transaction limit** (the most one request or voucher may be; a
request above it is refused when it is made).

Requests **below** the approval limit are approved by the custodian alone, and
their vouchers are released straight away and reviewed later. A request **at or
above** the approval limit takes one more step:

1. The custodian approves the request. It now shows **Awaiting approver**.
2. An independent approver (never the requester, and never the custodian who
   reviewed it) approves it, or rejects it with a reason. An administrator can do
   this step too. This holds even for a custodian's own request when the fund
   lets custodians approve their own.
3. Only then can the custodian create the voucher and **Release cash**. The voucher
   needs no second approval, because the approver already cleared the budget.
   A request an approver has approved can be made into a voucher for up to the approved
   amount, even above the per-transaction limit. The limit only stops a custodian
   from going over it without an approver.

A request that needs an approver can never be approved without one: the database refuses
it, whoever tries. Anything above the per-transaction limit needs an approver too. If an
administrator lowers a fund's limits, any waiting request that now needs an approver goes
back to **Awaiting approver** by itself, and the approver is notified in the app.

The custodian prepares the voucher for anyone's request. An approver prepares it only
for a custodian's own request in the funds they are assigned to.

Requests that were approved before this rule keep the old path: the approver
approves the voucher itself before release.

**Reimbursements.** When an approved liquidation shows the employee spent more than
the advance, the extra is a reimbursement. If the spending is at or above the
approval limit, or above the fund's per-transaction limit, an approver approves
the extra payment first. Any approver of the fund or an administrator can do it,
even if they approved the liquidation. Only the employee being paid cannot approve
their own reimbursement. Then the custodian records it as paid.

## What an approver can approve

An approver can approve anything in the funds they are assigned to, for anyone's
items except their own: budget requests, vouchers, liquidations (including the
Google Sheets approval), extra reimbursements, cash settlements, cancelling an
unused advance, and replenishments. An approver cannot act in funds they are not
assigned to. A fund with no assigned approver can be handled by any approver, so
nothing gets stuck. Administrators can act in every fund. Custodians keep their
own duties.

## Notifications: the bell and email (everyone)

The **bell** at the top of every page shows what needs you or changed on your
work, with a red number for unread items. Tap one to open it (it is then marked
read), or choose **See all notifications**. You can also turn emails on or off
there. The bell is always on; it keeps your notifications for 30 days after you
read them.

**Email** is only for things that need you or that you must know, for example:
a budget request or liquidation to review, a voucher to approve, corrections to
make, your cash being ready (your liquidation is then due within 48 hours), a
replenishment to review, and your account. Everything else (a voucher approved
or voided, a cash settlement recorded, and so on) is bell-only. Each morning at
8:00 you get one short summary, only if something is waiting on you.

Who is told follows the fund's rules: a custodian's own request goes to the
fund's assigned approver, or to nobody when the fund lets custodians approve
their own (administrators and accounting see that in their bell). You are never
notified about something you did yourself.

Under **Notifications** you can turn off the action emails and the morning
summary. Account emails are always sent. Admins can see every email the app
sent, and any that failed or were skipped, under **Admin → Notifications**.

---

## Liquidation and reimbursement (everyone)

After cash is handed over, the PCV shows **Liquidation pending**. Open the
released voucher through your Budget Request and choose **File liquidation**.
For a voucher created directly, its preparer files liquidation from the PCV page.

1. Check your name and the amount received, then enter department and filing date.
2. Replace the initial voucher lines with what was actually spent. Each line has
   particulars, amount, category, and one receipt (JPEG/PNG/WebP/PDF, up to 5 MB),
   or a reason why no receipt is available. Images are compressed before upload.
3. Save a draft or submit for custodian review. To report a completely unused
   advance, remove all expense lines and explain why nothing was spent.
4. A custodian assigned to the fund, or another administrator, approves or flags
   it with a reason. You cannot review your own liquidation. If flagged, correct
   it and resubmit; previous submissions and receipt references remain in history.
5. The form calculates the cash return or reimbursement. Approval alone never
   changes cash. A custodian records the full exact difference only after money
   is actually returned or paid. Partial settlements are not supported yet.

If additional payment takes actual spending to the fund's approval threshold,
or above its per-transaction limit, an approver or admin must authorize it before
payment. Only the employee being paid cannot authorize their own extra payment.
Reimbursement cannot exceed the available cash, and cannot be paid while the
voucher is flagged. A return can still be recorded.

Print or export the saved form from its detail page. Submitted/approved forms
are locked; only flagged forms can be corrected by their owner. A fully unused
advance closes when its entire cash return is recorded, without replenishment.

## Custodian

You hold the fund and hand out the cash.

**Review budget requests** — open **Budget Requests**, filter to requests
awaiting review, and inspect the name, fund, amount, and purpose. The queue
includes your own requests and those for funds assigned to you. You cannot
review your own request. Approve or reject with a reason. For an approved
request, **Create linked voucher** opens the existing voucher form with its
fund, requester, amount, and purpose prefilled. Choose categories and check
all lines. One request can produce one voucher; its total cannot exceed the
approved budget. Draft edits keep that ceiling too. A request at or above the
fund's approval limit also needs an approver before its voucher is prepared.

**Record an expense**
1. **Vouchers → New voucher**. Fill in date and payee, then add a line for each
   thing bought: particulars, amount, and category. Use **Add line** when one
   payee was paid for several items; the voucher total is the sum of the lines
   (up to 20) and can't exceed the per-transaction limit.
   Attach a photo of the signed paper voucher if available; enter the details
   manually. Paper voucher photos are saved with the voucher and can be copied
   to Google Drive when configured.
2. Attach a receipt photo (on a phone this opens the camera).
   No receipt? Give a reason instead.
   A draft can be corrected later: open it and tap **Edit** to change the payee,
   date or lines (the receipt and release stay on the voucher page). Once a
   voucher is submitted or released it is locked.
3. **Save draft** to finish later, or **Save and release cash** to hand over
   the money now. Releasing lowers your expected cash by that amount.

**Restore the fund** — when cash runs low, **Replenishments → New
replenishment**. It bundles up to 100 oldest vouchers whose liquidation is
approved and cash difference settled, excluding flagged vouchers. The total is
actual expenses, not the original advances. Check the receipts and totals, then
**Submit to accounting**.

You only see the funds an administrator has assigned to you. If you have none,
the dashboard says so; ask an administrator. When your funds change you get an
email.

A flagged voucher shows the approver's reason. Resolve the issue with the
approver. Cash stays counted, and replenishment is blocked until the flag is
resolved. Released money cannot be erased by voiding a voucher.

## Approver

Approvers can also **prepare their own vouchers** (Vouchers → New voucher), with the
same steps as a custodian: lines, receipt, edit a draft, release or submit for
approval. You can never approve a voucher you prepared; another approver or an
admin has to. Large ones submitted by you go to the other approvers and admins.


You review expenses after the cash is out.

1. **Approvals** lists released vouchers, oldest first.
2. Open one and check the receipt and details.
3. **Approve** if it's fine, or **Flag** with a reason if something is wrong.
   Flagging does not take cash back. Actual returns and additional payments are
   recorded through liquidation settlement.

You can't review a voucher you prepared yourself.

## Excel ledger export (a backup that does not depend on Google Sheets)

**Accounting → Excel ledger export** builds each fund's ledger as an Excel file from the
app's own records. The Google Sheet is not read, so the file is correct even when the sheet is not.

1. An administrator uploads each fund's own Excel ledger once (in Google Sheets: **File → Download →
   Microsoft Excel**). Every fund keeps its own layout, formulas, summary blocks and older tabs;
   only the current period's rows are filled in. Replace the file whenever the sheet's layout changes.
2. **Check first** shows how many rows were filled and whether the file closes at the balance the app
   expects. **Download Excel** saves the file.
3. The PCF number printed is the paper voucher number, the same as the sheet shows.
4. Amounts typed into the sheet by hand (input VAT, an additional fund) are not in the app. They stay as
   the template has them, and the check lists them.
5. A **PCF APP EXPORT** tab at the end of the file records when it was made and whether it matched.

## Accounting

Use **Fund assignments** to assign one or more active custodians to each fund.
Fund amounts, limits, categories, and user accounts remain administrator settings.
Assignments take effect immediately and are recorded in the audit trail.


You review replenishment requests and watch the numbers. **Budget Requests**
also lets you inspect every request and its linked voucher. Budget-request review
and voucher preparation belong to custodians/admins.

1. **Replenishments** shows released vouchers and why each is ready or excluded.
   Open a submitted request and follow each liquidation link to review receipts,
   reasons, versions, actual expenses, and cash settlement. Category totals use
   liquidation expenses.
2. **Approve**, or **Reject** with a note (the vouchers go back to the pool so
   the custodian can bundle them again).
3. After approving, **Mark as replenished and close** once the cash has been
   actually received into the fund. Approval alone does not restore cash. The
   batch is rechecked on submission, approval, and closing. A later voucher flag
   blocks closing; reject the batch and rebuild after resolving it. Rejected
   batches retain their original voucher/expense snapshots.

Also yours: voucher CSV export and the **Audit Trail** (every change, with who
and when). Vouchers and replenishment forms can be printed.

## Administrator

You can do everything above, plus set the system up.

- **Admin → Users**: create a user with their email, password, and role, change roles, deactivate people who
  leave. For a custodian, the **Funds** column shows what they hold; click
  **Assign** or **Change** and tick the funds they should have. A custodian can
  hold many funds, and a fund can have several custodians; ticking a fund never
  takes it from another custodian. Before you deactivate a custodian or change
  their role, take them off their funds.
- **Admin → Funds**: create the fund, set its amount, per-transaction limit,
  low-balance warning level, and its custodians (tick as many as you need; each
  can prepare and release their own vouchers and request
  replenishments for it). Changing the fund amount changes the equation, so
  you're warned first.
- **Admin → Categories**: add, rename, or deactivate (never delete) categories.
- **Voiding**: only unreleased vouchers can be voided, with a reason. Released
  advances must be resolved through liquidation and actual cash settlement.
  Financial records and audit history are retained.


### Data deletion center

Open **Administration → Data deletion**. Choose a deletion type and optional
fund, custodian, date range, or test-fund filter, then select **Preview deletion**.
Review the counts in the confirmation dialog and type the requested phrase
exactly to enable deletion. **Cancel** closes the preview without deleting data.
Accounts, Google workbook contents, and the audit trail are retained. A full
reset clears fund assignments and disables sheet automation until reassigned.
Use **Retry pending file cleanup** if a prior removal was interrupted.


## Requester expenses and custodian receipt review

1. The requester submits a budget request. The custodian reviews it and creates
   a voucher. The existing fund limit determines whether an Approver must approve
   before cash release.
2. Voucher creation contains the date, payee, and particulars with amounts.
   Choose automatic numbering, enter a manual receipt/voucher number, or select
   no document number. Automatic numbering follows the last saved numbered
   voucher in that fund. When no numbered app voucher exists, it uses the latest
   usable number in the assigned workbook mirror, then the fund counter. The app
   keeps its internal reference for audit and links.
3. After spending, the requester files liquidation with their locked account name
   and filing date, department, particulars, amounts, and optional plate numbers.
   Every expense needs a receipt picture. Received cash comes from the voucher.
   Spent, return due, and reimbursement due are calculated automatically.
4. The custodian verifies the physical receipts and completes separate receipt
   entries. Entries may split or combine receipt amounts, but their sum must match
   the requester total. Enter the supplier, TIN or NON VAT, exact CE/NCE workbook
   tag, transaction or liquidation date, plate, and optional invoice number.
5. Extraction can suggest details from the requester picture or a new photograph
   of the physical receipt. Edit suggestions and confirm each physical receipt,
   then save the review. The Google Sheets preview is available after this step.
   Confirming approval queues the reviewed receipt entries for the assigned
   workbook. Input VAT remains excluded.

## Replenishment approvals and actual cash handover

The custodian bundles approved, settled voucher expenses and submits the request.
Accounting reviews the request and vouchers, then sends it to an independent
Approver. Every replenishment requires this approval. Accounting records the
actual cash handover only after approval. This restores the corresponding cash
and requests the next numbered Google worksheet. Approval alone does not move
cash. Existing open accounting approvals also require the new Approver stage.
