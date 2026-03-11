-- Migration: 0017_fix_user_logins.sql
-- BUG-AUTH-01 FIX: John Spurlock's username is 'Jspurlock@seaengineering.com' — rename to 'jspurlock'
-- BUG-AUTH-02 FIX: Corey Garcia's password may be invalid — reset both passwords to 123456789
-- Both accounts get mustChangePassword = true so they must set a new password on first login.
-- All statements are idempotent (safe to re-run).

-- Step 1: Fix John Spurlock's username from email format to short username
UPDATE users SET username = 'jspurlock'
WHERE username = 'Jspurlock@seaengineering.com';

-- Step 2: Ensure jspurlock is assigned to SEA Engineering
UPDATE users SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE username = 'jspurlock'
  AND (company_id IS NULL OR company_id != '00000000-0000-0000-0000-000000000001');

-- Step 3: Ensure cgarcia is assigned to SEA Engineering
UPDATE users SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE username = 'cgarcia'
  AND (company_id IS NULL OR company_id != '00000000-0000-0000-0000-000000000001');

-- NOTE: Password reset for jspurlock and cgarcia is handled in the application startup code
-- because passwords must be hashed with the app's scrypt function, not raw SQL.
