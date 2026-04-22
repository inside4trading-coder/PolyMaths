-- Create wallet_onchain_activity table for verified on-chain data
CREATE TABLE public.wallet_onchain_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  activity_type TEXT NOT NULL, -- TRADE, SPLIT, MERGE, REDEEM, ADD_LIQUIDITY, REMOVE_LIQUIDITY
  block_number BIGINT NOT NULL,
  transaction_hash TEXT NOT NULL,
  condition_id TEXT,
  token_id TEXT,
  amount NUMERIC,
  collateral_amount NUMERIC,
  fee_amount NUMERIC,
  outcome_index INTEGER,
  is_maker BOOLEAN DEFAULT false,
  counterparty TEXT,
  timestamp TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(transaction_hash, wallet_address, activity_type)
);

-- Create indexes for efficient queries
CREATE INDEX idx_wallet_onchain_activity_wallet ON public.wallet_onchain_activity(wallet_address);
CREATE INDEX idx_wallet_onchain_activity_timestamp ON public.wallet_onchain_activity(timestamp DESC);
CREATE INDEX idx_wallet_onchain_activity_type ON public.wallet_onchain_activity(activity_type);
CREATE INDEX idx_wallet_onchain_activity_condition ON public.wallet_onchain_activity(condition_id);

-- Add new columns to wallets table for on-chain metrics
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS maker_ratio NUMERIC DEFAULT 0;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS liquidity_provided NUMERIC DEFAULT 0;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS splits_count INTEGER DEFAULT 0;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS merges_count INTEGER DEFAULT 0;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS onchain_verified BOOLEAN DEFAULT false;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS total_fees_paid NUMERIC DEFAULT 0;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS onchain_synced_at TIMESTAMPTZ;

-- Enable RLS
ALTER TABLE public.wallet_onchain_activity ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Wallet onchain activity is publicly readable"
ON public.wallet_onchain_activity
FOR SELECT
USING (true);

CREATE POLICY "Service can manage wallet onchain activity"
ON public.wallet_onchain_activity
FOR ALL
USING (true);