-- =========================================================
-- Liberty Trust Bank — Supabase schema v2 (safe for EXISTING tables)
-- Paste ALL of this into SQL Editor → Run
-- =========================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) TRANSACTIONS: create IF MISSING + add any missing columns
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_email text NOT NULL,
  name text,
  sub text,
  amt numeric NOT NULL DEFAULT 0,
  type text,
  date text,
  balance_after numeric NOT NULL DEFAULT 0
);
DO $$ BEGIN
  ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS name text;
  ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS sub text;
  ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS amt numeric NOT NULL DEFAULT 0;
  ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS type text;
  ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS date text;
  ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS balance_after numeric NOT NULL DEFAULT 0;
  ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS user_email text NOT NULL DEFAULT '';
  ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
EXCEPTION WHEN others THEN RAISE NOTICE 'one of cols existed: %', SQLERRM; END $$;
CREATE INDEX IF NOT EXISTS idx_transactions_user_email ON public.transactions(user_email);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);

-- 2) SETTINGS_SYNC — cloud save for beneficiaries/card/scheduled bills/dark/email/pin
CREATE TABLE IF NOT EXISTS public.settings_sync (
  user_email text PRIMARY KEY,
  updated_at timestamptz NOT NULL DEFAULT now(),
  beneficiaries jsonb NOT NULL DEFAULT '[]'::jsonb,
  card jsonb NOT NULL DEFAULT '{"frozen":false,"last4":"1034","limit":null}'::jsonb,
  scheduled jsonb NOT NULL DEFAULT '[]'::jsonb,
  dark boolean NOT NULL DEFAULT false,
  default_email text NOT NULL DEFAULT '',
  pin_hash text NOT NULL DEFAULT ''
);

-- 3) RLS
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings_sync ENABLE ROW LEVEL SECURITY;

-- 4) Policies — open (the app filters by user_email itself)
DROP POLICY IF EXISTS tx_select_own ON public.transactions;
CREATE POLICY tx_select_own ON public.transactions FOR SELECT USING (true);
DROP POLICY IF EXISTS tx_insert_any ON public.transactions;
CREATE POLICY tx_insert_any ON public.transactions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS ss_select_own ON public.settings_sync;
CREATE POLICY ss_select_own ON public.settings_sync FOR SELECT USING (true);
DROP POLICY IF EXISTS ss_upsert_any ON public.settings_sync;
CREATE POLICY ss_upsert_any ON public.settings_sync FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS ss_update_any ON public.settings_sync;
CREATE POLICY ss_update_any ON public.settings_sync FOR UPDATE USING (true) WITH CHECK (true);

-- 5) Grants
GRANT SELECT, INSERT ON public.transactions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.settings_sync TO anon, authenticated;
-- Grant sequence only if the id column is a serial/bigserial (skip for UUID tables)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='transactions' AND column_name='id'
      AND column_default LIKE '%nextval%'
  ) THEN
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.transactions_id_seq TO anon, authenticated';
  END IF;
END $$;

-- Seed settings row for lucky@libertytrust.com (avoids empty-settings bugs)
INSERT INTO public.settings_sync(user_email) VALUES ('lucky@libertytrust.com')
ON CONFLICT (user_email) DO NOTHING;
