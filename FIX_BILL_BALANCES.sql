-- ================================================================
-- FIX_BILL_BALANCES.sql  (SAFE VERSION)
-- ================================================================
--
-- WHAT THIS SCRIPT TOUCHES (bills table only):
--     balance             (was 0, fixed to: total - discount - paid)
--     shortfall_balance   (was 0, set from shortfall_amount or total balance)
--     medical_aid_balance (was 0, set from medical_aid_amount)
--     status              (recalculated from paid_amount vs total_amount)
--
-- WHAT THIS SCRIPT NEVER TOUCHES:
--   payments table  -- NOT READ, NOT WRITTEN, COMPLETELY IGNORED
--   patients table  -- NOT READ, NOT WRITTEN, COMPLETELY IGNORED
--   Any bill already paid (paid_amount >= total_amount) -- SKIPPED
--   Any bill where balance > 0 already (already correct) -- SKIPPED
--
-- SAFE GUARDS:
--   WHERE clause: balance = 0 AND paid_amount < total_amount AND total_amount > 0
--   GREATEST(0, ...) -- balance can never go negative
--   COALESCE(..., 0) -- handles all NULL fields safely
--   Idempotent       -- safe to run multiple times, 2nd run changes nothing
--
-- HOW TO USE:
--   STEP 1: Run the SELECT to preview which bills will be changed
--   STEP 2: Run BEGIN...ROLLBACK to test the math (nothing committed)
--   STEP 3: Run BEGIN...COMMIT only when you are satisfied
-- ================================================================


-- ================================================================
-- STEP 1 — DRY RUN PREVIEW (SELECT ONLY — nothing is changed)
-- ================================================================
SELECT
    bill_number                                                 AS "Invoice #",
    payment_method                                              AS "Type",
    total_amount                                                AS "Total",
    COALESCE(discount_amount, 0)                                AS "Discount",
    COALESCE(paid_amount, 0)                                    AS "Paid",
    balance                                                     AS "Stored Balance (broken = 0)",
    GREATEST(0,
        total_amount
        - COALESCE(discount_amount, 0)
        - COALESCE(paid_amount, 0))                             AS "Correct Balance",
    status                                                      AS "Current Status",
    CASE
        WHEN COALESCE(paid_amount, 0) = 0  THEN 'unpaid'
        ELSE 'partially_paid'
    END                                                         AS "Correct Status"
FROM bills
WHERE balance = 0
  AND COALESCE(paid_amount, 0) < total_amount
  AND total_amount > 0
ORDER BY created_at DESC;


-- ================================================================
-- STEP 2 — SAFE TEST (BEGIN + ROLLBACK)
-- Runs the UPDATE then immediately rolls it back.
-- Nothing is saved. Use to verify numbers look right.
-- ================================================================
BEGIN;

UPDATE bills
SET
    balance = GREATEST(0,
        total_amount
        - COALESCE(discount_amount, 0)
        - COALESCE(paid_amount, 0)
    ),

    shortfall_balance = CASE
        WHEN COALESCE(shortfall_balance, 0) > 0
            THEN shortfall_balance                  -- already set, leave alone
        WHEN COALESCE(medical_aid_amount, 0) = 0
            THEN GREATEST(0,                       -- cash patient: full balance
                    total_amount
                    - COALESCE(discount_amount, 0)
                    - COALESCE(paid_amount, 0))
        ELSE COALESCE(shortfall_amount, 0)         -- MA patient: patient portion
    END,

    medical_aid_balance = CASE
        WHEN COALESCE(medical_aid_balance, 0) > 0
            THEN medical_aid_balance               -- already set, leave alone
        WHEN COALESCE(medical_aid_amount, 0) > 0
            THEN COALESCE(medical_aid_amount, 0)  -- set from original MA amount
        ELSE 0
    END,

    status = CASE
        WHEN COALESCE(paid_amount, 0) = 0
            THEN 'unpaid'
        WHEN GREATEST(0,
                total_amount
                - COALESCE(discount_amount, 0)
                - COALESCE(paid_amount, 0)) <= 0
            THEN 'paid'
        ELSE 'partially_paid'
    END

WHERE balance = 0
  AND COALESCE(paid_amount, 0) < total_amount
  AND total_amount > 0;

-- Preview result BEFORE rollback:
SELECT
    bill_number,
    payment_method,
    total_amount,
    COALESCE(paid_amount, 0)    AS paid,
    balance                     AS new_balance,
    shortfall_balance           AS new_sf_bal,
    medical_aid_balance         AS new_ma_bal,
    status                      AS new_status
FROM bills
WHERE total_amount > 0
  AND COALESCE(paid_amount, 0) < total_amount
ORDER BY created_at DESC
LIMIT 50;

ROLLBACK; -- Nothing committed. bills, payments, patients all unchanged.


-- ================================================================
-- STEP 3 — FINAL COMMIT (run ONLY after reviewing Steps 1 & 2)
-- Only the bills table is modified. payments and patients untouched.
-- ================================================================
BEGIN;

UPDATE bills
SET
    balance = GREATEST(0,
        total_amount
        - COALESCE(discount_amount, 0)
        - COALESCE(paid_amount, 0)
    ),
    shortfall_balance = CASE
        WHEN COALESCE(shortfall_balance, 0) > 0
            THEN shortfall_balance
        WHEN COALESCE(medical_aid_amount, 0) = 0
            THEN GREATEST(0,
                    total_amount
                    - COALESCE(discount_amount, 0)
                    - COALESCE(paid_amount, 0))
        ELSE COALESCE(shortfall_amount, 0)
    END,
    medical_aid_balance = CASE
        WHEN COALESCE(medical_aid_balance, 0) > 0
            THEN medical_aid_balance
        WHEN COALESCE(medical_aid_amount, 0) > 0
            THEN COALESCE(medical_aid_amount, 0)
        ELSE 0
    END,
    status = CASE
        WHEN COALESCE(paid_amount, 0) = 0
            THEN 'unpaid'
        WHEN GREATEST(0,
                total_amount
                - COALESCE(discount_amount, 0)
                - COALESCE(paid_amount, 0)) <= 0
            THEN 'paid'
        ELSE 'partially_paid'
    END
WHERE balance = 0
  AND COALESCE(paid_amount, 0) < total_amount
  AND total_amount > 0;

-- Confirmation summary:
SELECT
    COUNT(*)                                                    AS "Bills Fixed",
    SUM(balance)                                                AS "Total Outstanding",
    SUM(CASE WHEN status = 'unpaid'         THEN 1 ELSE 0 END) AS "Unpaid Count",
    SUM(CASE WHEN status = 'partially_paid' THEN 1 ELSE 0 END) AS "Partially Paid Count"
FROM bills
WHERE total_amount > 0
  AND COALESCE(paid_amount, 0) < total_amount;

COMMIT; -- Only bills.balance/shortfall_balance/medical_aid_balance/status changed.

