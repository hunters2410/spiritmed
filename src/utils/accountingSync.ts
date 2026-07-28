import { supabase } from '../lib/supabase';

export interface DefaultAccountConfig {
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  description: string;
}

export const DEFAULT_ACCOUNTS: DefaultAccountConfig[] = [
  { code: '1000', name: 'Cash & Bank', type: 'asset', description: 'Main cash drawer and bank accounts for operations' },
  { code: '1100', name: 'Accounts Receivable — Patients', type: 'asset', description: 'Unpaid balances owed directly by patients' },
  { code: '1110', name: 'Accounts Receivable — Medical Aid', type: 'asset', description: 'Unpaid claims owed by medical insurance companies' },
  { code: '1200', name: 'Inventory / Medical Supplies', type: 'asset', description: 'Value of medicines, pharmacy stock and clinical items' },
  { code: '1500', name: 'Medical Equipment', type: 'asset', description: 'Capital machinery, scanners and hospital furniture' },
  { code: '2000', name: 'Accounts Payable', type: 'liability', description: 'Outstanding unpaid bills owed to suppliers/vendors' },
  { code: '2100', name: 'Accrued Expenses', type: 'liability', description: 'Incurred but unpaid liabilities like utilities and taxes' },
  { code: '3000', name: 'Owner Equity', type: 'equity', description: 'Initial capital contributed to the clinic/hospital' },
  { code: '3100', name: 'Retained Earnings', type: 'equity', description: 'Accumulated profits or losses from prior periods' },
  { code: '4000', name: 'Patient Cash Revenue', type: 'revenue', description: 'Income generated from direct patient fees and shortfall payments' },
  { code: '4100', name: 'Medical Aid Claim Revenue', type: 'revenue', description: 'Income recognized from insurance and medical aid claims' },
  { code: '4200', name: 'Discounts Allowed', type: 'expense', description: 'Patient discounts applied on bills and payments' },
  { code: '5000', name: 'Salaries & Wages', type: 'expense', description: 'Staff, nurse and physician salary disbursements' },
  { code: '5100', name: 'Medical & Drug Expenses', type: 'expense', description: 'Cost of purchasing clinical consumables and medicines' },
  { code: '5200', name: 'Utilities', type: 'expense', description: 'Hospital power, water, internet and garbage services' },
  { code: '5300', name: 'Administrative Expenses', type: 'expense', description: 'Office supplies, printing, rent, legal and marketing' },
];

export const accountingSync = {
  /**
   * Checks and ensures all default accounts are seeded for the current branch.
   */
  async ensureDefaultAccounts(branchId: string): Promise<Record<string, string>> {
    if (!branchId) return {};

    try {
      // 1. Fetch existing accounts for this branch
      const { data: existing } = await supabase
        .from('accounts')
        .select('id, code')
        .eq('branch_id', branchId);

      const existingMap: Record<string, string> = {};
      if (existing) {
        existing.forEach(acc => {
          existingMap[acc.code] = acc.id;
        });
      }

      // 2. Determine missing accounts
      const toInsert = DEFAULT_ACCOUNTS.filter(acc => !existingMap[acc.code]);

      if (toInsert.length > 0) {
        const insertData = toInsert.map(acc => ({
          branch_id: branchId,
          code: acc.code,
          name: acc.name,
          type: acc.type,
          description: acc.description,
          is_system: true,
          is_active: true
        }));

        const { data: inserted, error } = await supabase
          .from('accounts')
          .insert(insertData)
          .select();

        if (error) throw error;
        if (inserted) {
          inserted.forEach(acc => {
            existingMap[acc.code] = acc.id;
          });
        }
      }

      return existingMap;
    } catch (err) {
      console.error('ensureDefaultAccounts error:', err);
      return {};
    }
  },

  /**
   * Auto-posts a double-entry journal entry for a newly created or updated Invoice (Bill).
   */
  async postBillJournalEntry(
    bill: {
      id: string;
      bill_number: string;
      patient_id: string;
      branch_id: string;
      total_amount: number;
      discount_amount: number;
      medical_aid_amount: number;
      shortfall_amount: number;
      bill_date: string;
      patient?: { full_name: string };
    },
    patientName: string
  ) {
    if (!bill.branch_id) return;

    try {
      // 1. Clear any existing journal entry for this bill to allow clean updates
      await this.deleteJournalEntry('bill', bill.id, bill.branch_id);

      // 2. Ensure accounts exist
      const accounts = await this.ensureDefaultAccounts(bill.branch_id);
      
      const patientArId = accounts['1100'];
      const medAidArId = accounts['1110'];
      const discountsId = accounts['4200'];
      const patientRevId = accounts['4000'];
      const medAidRevId = accounts['4100'];

      if (!patientArId || !medAidArId || !discountsId || !patientRevId || !medAidRevId) {
        console.warn('Seeding failed, could not map all required accounts.');
        return;
      }

      // Calculate gross balances
      const sfGross = (bill.shortfall_amount || 0);
      const maGross = (bill.medical_aid_amount || 0);
      const discount = (bill.discount_amount || 0);

      // Debit accounts:
      // - Patient A/R gets shortfall_amount
      // - Medical Aid A/R gets medical_aid_amount
      // - Discounts Allowed gets discount_amount
      // Credit accounts:
      // - Patient Revenue gets shortfall_amount + discount (gross patient revenue)
      // - Medical Aid Revenue gets medical_aid_amount
      
      const lines = [];

      // Debits
      if (sfGross > 0) {
        lines.push({
          account_id: patientArId,
          description: `Patient Receivable — Invoice ${bill.bill_number}`,
          debit: sfGross,
          credit: 0
        });
      }

      if (maGross > 0) {
        lines.push({
          account_id: medAidArId,
          description: `Medical Aid Receivable — Invoice ${bill.bill_number}`,
          debit: maGross,
          credit: 0
        });
      }

      if (discount > 0) {
        lines.push({
          account_id: discountsId,
          description: `Discount Applied — Invoice ${bill.bill_number}`,
          debit: discount,
          credit: 0
        });
      }

      // Credits
      if (sfGross + discount > 0) {
        lines.push({
          account_id: patientRevId,
          description: `Patient Service Revenue — Invoice ${bill.bill_number}`,
          debit: 0,
          credit: sfGross + discount
        });
      }

      if (maGross > 0) {
        lines.push({
          account_id: medAidRevId,
          description: `Medical Aid Recognized Revenue — Invoice ${bill.bill_number}`,
          debit: 0,
          credit: maGross
        });
      }

      if (lines.length === 0) return;

      // 3. Create Entry Header
      const { data: entry, error: entryErr } = await supabase
        .from('journal_entries')
        .insert([{
          branch_id: bill.branch_id,
          entry_number: `JE-INV-${bill.bill_number}-${Date.now().toString().slice(-3)}`,
          entry_date: bill.bill_date || new Date().toISOString().split('T')[0],
          description: `Auto-posted invoice invoice ${bill.bill_number} for patient: ${patientName}`,
          reference_type: 'bill',
          reference_id: bill.id,
          is_posted: true
        }])
        .select()
        .single();

      if (entryErr) throw entryErr;

      // 4. Create Entry Lines
      const { error: linesErr } = await supabase
        .from('journal_lines')
        .insert(lines.map(line => ({
          journal_entry_id: entry.id,
          ...line
        })));

      if (linesErr) throw linesErr;

    } catch (err) {
      console.error('postBillJournalEntry error:', err);
    }
  },

  /**
   * Auto-posts a double-entry journal entry for recorded Payments.
   */
  async postPaymentJournalEntry(
    payment: {
      id: string;
      bill_id: string;
      amount: number;
      discount_amount?: number;
      payment_method: string;
      target_portion: 'shortfall' | 'medical_aid';
      notes?: string;
      branch_id: string;
      payment_date: string;
      bill?: { bill_number: string; patient?: { full_name: string } };
    }
  ) {
    if (!payment.branch_id) return;

    try {
      // 1. Clear any existing journal entry for this payment to allow clean updates
      await this.deleteJournalEntry('payment', payment.id, payment.branch_id);

      // 2. Resolve bill number and patient details if not provided
      let billNumber = payment.bill?.bill_number || '';
      let patientName = payment.bill?.patient?.full_name || 'Patient';

      if (!billNumber || patientName === 'Patient') {
        const { data: billData } = await supabase
          .from('bills')
          .select(`
            bill_number,
            patient:patients(full_name)
          `)
          .eq('id', payment.bill_id)
          .maybeSingle();

        if (billData) {
          billNumber = billData.bill_number;
          patientName = (billData.patient as any)?.full_name || 'Patient';
        }
      }

      // 3. Ensure accounts exist
      const accounts = await this.ensureDefaultAccounts(payment.branch_id);

      const cashId = accounts['1000'];
      const patientArId = accounts['1100'];
      const medAidArId = accounts['1110'];
      const discountsId = accounts['4200'];

      if (!cashId || !patientArId || !medAidArId || !discountsId) {
        console.warn('Seeding failed, could not map all required accounts.');
        return;
      }

      const amount = Number(payment.amount) || 0;
      const discount = Number(payment.discount_amount) || 0;
      const totalARCredit = amount + discount;

      if (amount <= 0 && discount <= 0) return;

      const lines = [];

      // Debits
      if (amount > 0) {
        lines.push({
          account_id: cashId,
          description: `Cash/Bank Payment received — INV ${billNumber}`,
          debit: amount,
          credit: 0
        });
      }

      if (discount > 0) {
        lines.push({
          account_id: discountsId,
          description: `Discount granted during payment — INV ${billNumber}`,
          debit: discount,
          credit: 0
        });
      }

      // Credits (Reduce AR)
      const targetArId = payment.target_portion === 'medical_aid' ? medAidArId : patientArId;
      const targetText = payment.target_portion === 'medical_aid' ? 'Medical Aid Claim' : 'Patient Fee';

      lines.push({
        account_id: targetArId,
        description: `Receipt reduction of ${targetText} A/R — INV ${billNumber}`,
        debit: 0,
        credit: totalARCredit
      });

      // 4. Create Entry Header
      const { data: entry, error: entryErr } = await supabase
        .from('journal_entries')
        .insert([{
          branch_id: payment.branch_id,
          entry_number: `JE-PAY-${payment.id.slice(-6)}-${Date.now().toString().slice(-3)}`,
          entry_date: payment.payment_date ? payment.payment_date.split('T')[0] : new Date().toISOString().split('T')[0],
          description: `Payment received of $${amount.toLocaleString()} from ${patientName} on Invoice ${billNumber}`,
          reference_type: 'payment',
          reference_id: payment.id,
          is_posted: true
        }])
        .select()
        .single();

      if (entryErr) throw entryErr;

      // 5. Create Entry Lines
      const { error: linesErr } = await supabase
        .from('journal_lines')
        .insert(lines.map(line => ({
          journal_entry_id: entry.id,
          ...line
        })));

      if (linesErr) throw linesErr;

    } catch (err) {
      console.error('postPaymentJournalEntry error:', err);
    }
  },

  /**
   * Auto-posts a double-entry journal entry for Expenses.
   */
  async postExpenseJournalEntry(
    expense: {
      id: string;
      amount: number;
      expense_date: string;
      description: string;
      payment_method: string;
      branch_id: string;
      category?: { name: string } | string;
    }
  ) {
    if (!expense.branch_id) return;

    try {
      // 1. Clear any existing journal entry for this expense to allow clean updates
      await this.deleteJournalEntry('expense', expense.id, expense.branch_id);

      // 2. Ensure accounts exist
      const accounts = await this.ensureDefaultAccounts(expense.branch_id);

      const cashId = accounts['1000'];
      
      // Determine expense account: try Utilities (5200) or general Office/Admin Expenses (5300)
      const categoryName = (expense.category && typeof expense.category === 'object') ? expense.category?.name : expense.category || '';
      let expenseAccountId = accounts['5300']; // default to General Admin

      const lowerCat = categoryName.toLowerCase();
      if (lowerCat.includes('salary') || lowerCat.includes('wage') || lowerCat.includes('staff')) {
        expenseAccountId = accounts['5000'];
      } else if (lowerCat.includes('utility') || lowerCat.includes('electricity') || lowerCat.includes('power') || lowerCat.includes('water')) {
        expenseAccountId = accounts['5200'];
      } else if (lowerCat.includes('drug') || lowerCat.includes('medical') || lowerCat.includes('supply') || lowerCat.includes('clinical')) {
        expenseAccountId = accounts['5100'];
      }

      if (!cashId || !expenseAccountId) {
        console.warn('Seeding failed, could not map all required accounts.');
        return;
      }

      const amount = Number(expense.amount) || 0;
      if (amount <= 0) return;

      const lines = [
        // Debit the Expense Account
        {
          account_id: expenseAccountId,
          description: `Disbursement: ${expense.description}`,
          debit: amount,
          credit: 0
        },
        // Credit Cash & Bank
        {
          account_id: cashId,
          description: `Cash payout: ${expense.description}`,
          debit: 0,
          credit: amount
        }
      ];

      // 3. Create Entry Header
      const { data: entry, error: entryErr } = await supabase
        .from('journal_entries')
        .insert([{
          branch_id: expense.branch_id,
          entry_number: `JE-EXP-${expense.id.slice(-6)}-${Date.now().toString().slice(-3)}`,
          entry_date: expense.expense_date || new Date().toISOString().split('T')[0],
          description: `Disbursed expense: ${expense.description || 'Hospital Expense'}`,
          reference_type: 'expense',
          reference_id: expense.id,
          is_posted: true
        }])
        .select()
        .single();

      if (entryErr) throw entryErr;

      // 4. Create Entry Lines
      const { error: linesErr } = await supabase
        .from('journal_lines')
        .insert(lines.map(line => ({
          journal_entry_id: entry.id,
          ...line
        })));

      if (linesErr) throw linesErr;

    } catch (err) {
      console.error('postExpenseJournalEntry error:', err);
    }
  },

  /**
   * Deletes a journal entry by reference and branch.
   */
  async deleteJournalEntry(refType: string, refId: string, branchId: string) {
    try {
      await supabase
        .from('journal_entries')
        .delete()
        .eq('reference_type', refType)
        .eq('reference_id', refId)
        .eq('branch_id', branchId);
    } catch (err) {
      console.error('deleteJournalEntry error:', err);
    }
  }
};
