-- ==============================================================================
-- Migration: 001_add_phone_to_users.sql
-- Description: Add nullable phone column to users table with +91XXXXXXXXXX format.
-- Existing users get NULL.
-- ==============================================================================

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS phone_number VARCHAR(15) DEFAULT NULL;

-- Ensure constraint for Indian mobile format (+91 followed by 10 digits starting with 6-9) when NOT NULL
ALTER TABLE users 
DROP CONSTRAINT IF EXISTS check_indian_phone_number;

ALTER TABLE users 
ADD CONSTRAINT check_indian_phone_number 
CHECK (phone_number IS NULL OR phone_number ~ '^\+91[6-9][0-9]{9}$');

COMMENT ON COLUMN users.phone_number IS 'Indian mobile number in E.164 format (+91XXXXXXXXXX), nullable for existing accounts.';
