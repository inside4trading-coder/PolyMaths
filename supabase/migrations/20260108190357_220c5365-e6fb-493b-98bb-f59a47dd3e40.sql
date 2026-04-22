-- =============================================
-- FASE 1: Reestructuración para alineación con Polymarket
-- =============================================

-- 1. Crear tabla wallet_positions (P/L pre-calculado de Polymarket)
CREATE TABLE IF NOT EXISTS public.wallet_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  condition_id TEXT NOT NULL,
  asset_id TEXT,
  slug TEXT,
  title TEXT,
  outcome TEXT,
  outcome_index INTEGER,
  size NUMERIC NOT NULL DEFAULT 0,
  avg_price NUMERIC,
  cur_price NUMERIC,
  initial_value NUMERIC,
  current_value NUMERIC,
  cash_pnl NUMERIC DEFAULT 0,
  percent_pnl NUMERIC DEFAULT 0,
  realized_pnl NUMERIC DEFAULT 0,
  total_bought NUMERIC DEFAULT 0,
  redeemable BOOLEAN DEFAULT FALSE,
  mergeable BOOLEAN DEFAULT FALSE,
  end_date TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(wallet_address, condition_id, outcome)
);

-- 2. Agregar columnas a wallet_activity para alineación con API
ALTER TABLE public.wallet_activity 
  ADD COLUMN IF NOT EXISTS condition_id TEXT,
  ADD COLUMN IF NOT EXISTS usdc_size NUMERIC,
  ADD COLUMN IF NOT EXISTS transaction_hash TEXT,
  ADD COLUMN IF NOT EXISTS asset_id TEXT;

-- 3. Índices para wallet_positions
CREATE INDEX IF NOT EXISTS idx_wallet_positions_wallet ON public.wallet_positions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_wallet_positions_condition ON public.wallet_positions(condition_id);
CREATE INDEX IF NOT EXISTS idx_wallet_positions_synced ON public.wallet_positions(synced_at);

-- 4. Índices para wallet_activity nuevas columnas
CREATE INDEX IF NOT EXISTS idx_wallet_activity_condition ON public.wallet_activity(condition_id);
CREATE INDEX IF NOT EXISTS idx_wallet_activity_txhash ON public.wallet_activity(transaction_hash);

-- 5. Índice en markets.condition_id para lookups rápidos
CREATE INDEX IF NOT EXISTS idx_markets_condition_id ON public.markets(condition_id);

-- 6. RLS para wallet_positions
ALTER TABLE public.wallet_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Wallet positions are publicly readable"
  ON public.wallet_positions
  FOR SELECT
  USING (true);

CREATE POLICY "Service can manage wallet positions"
  ON public.wallet_positions
  FOR ALL
  USING (true);

-- 7. Habilitar realtime para wallet_positions
ALTER TABLE public.wallet_positions REPLICA IDENTITY FULL;

-- 8. Agregar a publicación realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_positions;