import { supabase as defaultSupabase } from '../lib/supabase';

export interface AllocationResult {
  allocated: number;
  billsCleared: number;
  remainingCredit: number;
  details: Array<{ billNumber: string; applied: number; newStatus: string }>;
}

/**
 * Auto-allocates any excess credit (overpayment) on a patient's bills
 * to their outstanding invoices, applying to the SHORTFALL portion only.
 * Runs silently — does not throw; errors are logged to console only.
 */
export async function autoAllocateCredits(
  patientId: string,
  branchId: string | null,
  receivedBy: string | null = null,
  client: typeof defaultSupabase = defaultSupabase
): Promise<AllocationResult> {
  const empty: AllocationResult = { allocated: 0, billsCleared: 0, remainingCredit: 0, details: [] };

  try {
    // 1. Fetch all bills for this patient, oldest first
    const { data: bills, error } = await client
      .from('bills')
      .select(`
        id, bill_number, bill_date,
        total_amount, discount_amount, paid_amount, balance,
        shortfall_amount, shortfall_balance,
        medical_aid_amount, medical_aid_balance,
        status, payment_method
      `)
      .eq('patient_id', patientId)
      .order('bill_date', { ascending: true });

    if (error || !bills || bills.length === 0) return empty;

    // 2. Build credit pool from overpaid bills
    let creditPool = 0;
    for (const bill of bills) {
      const owed = Math.max(0, (bill.total_amount || 0) - (bill.discount_amount || 0));
      const paid = bill.paid_amount || 0;
      const credit = paid - owed;
      if (credit > 0) creditPool += credit;
    }

    if (creditPool <= 0) return empty;

    // 3. Find bills with unpaid shortfall (not medical-aid-only portion)
    const unpaidBills = bills.filter(b => {
      if (b.status === 'paid') return false;
      const eff = b.balance != null && b.balance > 0
        ? b.balance
        : Math.max(0, (b.total_amount || 0) - (b.discount_amount || 0) - (b.paid_amount || 0));
      const isCashBill = (b.medical_aid_amount || 0) === 0;
      const sfBalance = isCashBill
        ? eff
        : (b.shortfall_balance != null && b.shortfall_balance > 0 ? b.shortfall_balance : (b.shortfall_amount || 0));
      return sfBalance > 0;
    });

    if (unpaidBills.length === 0) return { ...empty, remainingCredit: creditPool };

    let totalAllocated = 0;
    let billsCleared = 0;
    const details: AllocationResult['details'] = [];

    // 4. Allocate credit to shortfall portion, oldest bill first
    for (const bill of unpaidBills) {
      if (creditPool <= 0) break;

      const isCashBill = (bill.medical_aid_amount || 0) === 0;

      const effectiveTotalBalance = bill.balance != null && bill.balance > 0
        ? bill.balance
        : Math.max(0, (bill.total_amount || 0) - (bill.discount_amount || 0) - (bill.paid_amount || 0));

      const sfBalance = isCashBill
        ? effectiveTotalBalance
        : (bill.shortfall_balance != null && bill.shortfall_balance > 0
            ? bill.shortfall_balance
            : (bill.shortfall_amount || 0));

      const applyAmount = Math.min(creditPool, sfBalance);
      if (applyAmount <= 0) continue;

      const newPaidAmount = (bill.paid_amount || 0) + applyAmount;
      const newBalance = effectiveTotalBalance - applyAmount;
      const maBalance = bill.medical_aid_balance ?? bill.medical_aid_amount ?? 0;
      const newShortfallBalance = Math.max(0, sfBalance - applyAmount);

      const newStatus = newBalance <= 0 && maBalance <= 0 ? 'paid' : 'partially_paid';

      const { error: billErr } = await client
        .from('bills')
        .update({
          paid_amount: newPaidAmount,
          balance: Math.max(newBalance, 0),
          shortfall_balance: newShortfallBalance,
          status: newStatus,
        })
        .eq('id', bill.id);

      if (billErr) {
        console.error('[creditAllocation] Failed to update bill:', bill.id, billErr);
        continue;
      }

      const paymentRow: Record<string, any> = {
        bill_id: bill.id,
        patient_id: patientId,
        amount: applyAmount,
        discount_amount: 0,
        payment_method: 'credit_transfer',
        target_portion: 'shortfall',
        notes: 'Auto-allocated from patient overpayment/credit',
        payment_date: new Date().toISOString(),
        branch_id: branchId,
      };
      if (receivedBy) paymentRow.received_by = receivedBy;

      const { error: payErr } = await client
        .from('payments')
        .insert(paymentRow);

      if (payErr) {
        console.error('[creditAllocation] Payment audit record failed (bill already corrected):', bill.id, payErr);
      }

      creditPool -= applyAmount;
      totalAllocated += applyAmount;
      if (newStatus === 'paid') billsCleared++;
      details.push({ billNumber: bill.bill_number, applied: applyAmount, newStatus });
    }

    return { allocated: totalAllocated, billsCleared, remainingCredit: creditPool, details };

  } catch (err) {
    console.error('[creditAllocation] Unexpected error:', err);
    return empty;
  }
}
