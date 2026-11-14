// The fund's cash in two views. "Recorded" counts a settlement only once the custodian
// has recorded it. "After pending settlements" adds the cash that approved liquidations
// say should come back (returns due) and takes off what is owed to employees
// (reimbursements due), so it is the money the custodian should actually be holding
// once those settlements are done. Amounts are worked in centavos.
export function cashAfterSettlements(fund: {
  expected_cash: number;
  returns_due?: number;
  reimbursements_due?: number;
}) {
  const recorded = Math.round(fund.expected_cash * 100);
  const returnsDue = Math.round((fund.returns_due ?? 0) * 100);
  const reimbursementsDue = Math.round((fund.reimbursements_due ?? 0) * 100);
  return {
    recorded: recorded / 100,
    returnsDue: returnsDue / 100,
    reimbursementsDue: reimbursementsDue / 100,
    afterSettlements: (recorded + returnsDue - reimbursementsDue) / 100,
    pending: returnsDue > 0 || reimbursementsDue > 0,
  };
}
