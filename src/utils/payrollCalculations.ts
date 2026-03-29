/**
 * Dynamic Payroll Calculation Utility
 */

export interface TaxBracket {
    min: number;
    max: number;
    rate: number;
}

export interface PayrollSettings {
    paye_enabled: boolean;
    nssa_enabled: boolean;
    aids_levy_enabled: boolean;
    nssa_rate: number;
    nssa_limit: number;
    aids_levy_rate: number;
    tax_brackets: TaxBracket[];
}

export interface CustomDeduction {
    label: string;
    amount: number;
}

export interface PayrollResult {
    gross: number;
    nssa: number;
    paye: number;
    aidsLevy: number;
    totalDeductions: number;
    net: number;
}

export function calculateMonthlyPayroll(
    basicSalary: number,
    allowances: number = 0,
    fixedDeductions: number = 0, // Medical Aid, Pension, etc.
    customDeductions: CustomDeduction[] = [],
    settings: PayrollSettings = {
        paye_enabled: true,
        nssa_enabled: true,
        aids_levy_enabled: true,
        nssa_rate: 4.5,
        nssa_limit: 700,
        aids_levy_rate: 3.0,
        tax_brackets: [
            { min: 0, max: 100, rate: 0 },
            { min: 101, max: 300, rate: 20 },
            { min: 301, max: 1000, rate: 25 },
            { min: 1001, max: 2000, rate: 30 },
            { min: 2001, max: 3000, rate: 35 },
            { min: 3001, max: 9999999, rate: 40 }
        ]
    }
): PayrollResult {
    const gross = basicSalary + allowances;

    // 1. NSSA Deduction
    let nssa = 0;
    if (settings.nssa_enabled) {
        const rate = settings.nssa_rate / 100;
        nssa = Math.min(gross, settings.nssa_limit) * rate;
    }

    // 2. Taxable Income
    const taxableIncome = Math.max(0, gross - nssa);

    // 3. PAYE Calculation
    let paye = 0;
    if (settings.paye_enabled) {
        // Sort brackets by min descending for progressive calculation
        const sortedBrackets = [...settings.tax_brackets].sort((a, b) => b.min - a.min);

        let remainingIncome = taxableIncome;
        for (const bracket of sortedBrackets) {
            if (remainingIncome > bracket.min) {
                const amountInBracket = remainingIncome - bracket.min;
                paye += amountInBracket * (bracket.rate / 100);
                remainingIncome = bracket.min;
            }
        }
    }

    // 4. AIDS Levy
    let aidsLevy = 0;
    if (settings.aids_levy_enabled) {
        aidsLevy = paye * (settings.aids_levy_rate / 100);
    }

    // 5. Custom Deductions sum
    const customDedsTotal = customDeductions.reduce((acc, d) => acc + d.amount, 0);

    // 6. Totals
    const totalDeductions = nssa + paye + aidsLevy + fixedDeductions + customDedsTotal;
    const net = gross - totalDeductions;

    return {
        gross: Number(gross.toFixed(2)),
        nssa: Number(nssa.toFixed(2)),
        paye: Number(paye.toFixed(2)),
        aidsLevy: Number(aidsLevy.toFixed(2)),
        totalDeductions: Number(totalDeductions.toFixed(2)),
        net: Number(net.toFixed(2))
    };
}
