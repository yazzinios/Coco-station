-- Migration 011: Add last_login column to users table
-- Fixes: column "last_login" of relation "users" does not exist

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
