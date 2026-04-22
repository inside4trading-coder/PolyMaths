-- Add P/L tracking columns to wallets table
ALTER TABLE public.wallets
ADD COLUMN IF NOT EXISTS total_buys_usd numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_sells_usd numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_redeems_usd numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS realized_pnl numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS unrealized_pnl numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_pnl numeric DEFAULT 0;

-- Add index for P/L queries
CREATE INDEX IF NOT EXISTS idx_wallets_total_pnl ON public.wallets(total_pnl DESC);
CREATE INDEX IF NOT EXISTS idx_wallets_realized_pnl ON public.wallets(realized_pnl DESC);