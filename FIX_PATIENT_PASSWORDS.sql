-- =============================================================================
-- FIX_PATIENT_PASSWORDS.sql
-- Remediation for: CWE-256 Plaintext Password Storage in patients table
-- =============================================================================
--
-- CONTEXT
-- -------
-- The `patients` table currently stores user passwords in a plaintext `password`
-- column. The AuthContext.tsx code compares submitted passwords directly against
-- this column (.eq('password', password)), which is a critical security risk.
--
-- This script migrates plaintext passwords to bcrypt hashes using pgcrypto.
--
-- INSTRUCTIONS
-- ------------
-- 1. Run this script in the Supabase SQL editor (or via psql).
-- 2. After verifying hashes look correct, create a Supabase Edge Function to
--    handle patient login using crypt() for comparison (see template below).
-- 3. Once the Edge Function is deployed and tested, drop the plaintext column:
--       ALTER TABLE patients DROP COLUMN password;
-- 4. Update AuthContext.tsx to call the Edge Function instead of the direct query.
--
-- =============================================================================

-- Step 1: Enable pgcrypto extension (needed for crypt / gen_salt)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Step 2: Add a new column for the bcrypt password hash
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Step 3: Hash all existing plaintext passwords with bcrypt (cost factor 10)
--         Only updates rows that have a password and haven't been hashed yet.
UPDATE patients
SET password_hash = crypt(password, gen_salt('bf', 10))
WHERE password IS NOT NULL
  AND password_hash IS NULL
  AND password != '';

-- Verify: Check how many rows were updated
SELECT
  COUNT(*) FILTER (WHERE password_hash IS NOT NULL) AS hashed_count,
  COUNT(*) FILTER (WHERE password_hash IS NULL)     AS not_hashed_count,
  COUNT(*)                                           AS total_patients
FROM patients;

-- =============================================================================
-- Step 4 (AFTER testing): Remove the plaintext column
--   Run this ONLY after your Supabase Edge Function is live and working.
--   Uncomment the line below when ready:
-- =============================================================================

-- ALTER TABLE patients DROP COLUMN password;

-- =============================================================================
-- Edge Function template (TypeScript / Deno)
-- Deploy via: supabase functions deploy patient-login
-- =============================================================================
--
-- import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
-- import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
--
-- serve(async (req) => {
--   const { email, password } = await req.json();
--
--   const supabase = createClient(
--     Deno.env.get("SUPABASE_URL")!,
--     Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!  // service role — never expose to client
--   );
--
--   // Use crypt() to compare submitted password against stored hash
--   const { data, error } = await supabase
--     .from("patients")
--     .select("*")
--     .eq("email", email)
--     .eq("status", "active")
--     // PostgreSQL: crypt(input, stored_hash) returns stored_hash if match
--     .filter("password_hash", "eq", `crypt('${password}', password_hash)`)
--     .maybeSingle();
--
--   if (error || !data) {
--     return new Response(JSON.stringify({ error: "Invalid credentials" }), {
--       status: 401,
--       headers: { "Content-Type": "application/json" },
--     });
--   }
--
--   return new Response(JSON.stringify({ patient: data }), {
--     headers: { "Content-Type": "application/json" },
--   });
-- });
-- =============================================================================
