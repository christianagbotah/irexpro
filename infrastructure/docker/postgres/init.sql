-- iRexPro PostgreSQL Schema Initialisation
-- Creates all required schemas for the platform's bounded contexts.
-- Run once on first database startup.

-- Identity & access
CREATE SCHEMA IF NOT EXISTS identity;      -- users, roles, auth

-- Subscriptions & billing
CREATE SCHEMA IF NOT EXISTS subscriptions; -- plans, user_subscriptions, payment_profiles

-- Trading & risk
CREATE SCHEMA IF NOT EXISTS trading;       -- risk_profiles, risk_violations, trades, sessions

-- Performance & revenue
CREATE SCHEMA IF NOT EXISTS performance;   -- high-water marks, performance fees
CREATE SCHEMA IF NOT EXISTS revenue;       -- invoices, payment records

-- Platform & config
CREATE SCHEMA IF NOT EXISTS platform;      -- country_config, global_settings
CREATE SCHEMA IF NOT EXISTS broker;        -- broker_connections, broker_accounts

-- Observability
CREATE SCHEMA IF NOT EXISTS audit;         -- audit_logs
CREATE SCHEMA IF NOT EXISTS notifications; -- notification_templates, delivery_logs

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
