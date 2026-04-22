-- ============================================
-- PAPER TRADING: Add tracking fields
-- ============================================

-- 1. Add last_signal_scan_at to bot_configs
-- This tracks when we last scanned for signals to avoid duplicates
ALTER TABLE public.bot_configs 
  ADD COLUMN IF NOT EXISTS last_signal_scan_at TIMESTAMPTZ DEFAULT now();

-- 2. Add source tracking to bot_orders
-- source_activity_id: links order to the original wallet_activity that triggered it
-- simulated_slippage: tracks the calculated slippage from orderbook simulation
ALTER TABLE public.bot_orders 
  ADD COLUMN IF NOT EXISTS source_activity_id UUID,
  ADD COLUMN IF NOT EXISTS simulated_slippage NUMERIC DEFAULT 0;

-- 3. Add source tracking to bot_positions
-- Links position back to the original signal for full traceability
ALTER TABLE public.bot_positions
  ADD COLUMN IF NOT EXISTS source_activity_id UUID;

-- 4. Add index for efficient signal scanning
CREATE INDEX IF NOT EXISTS idx_wallet_activity_signal_scan 
  ON public.wallet_activity(wallet_address, timestamp DESC) 
  WHERE activity_type = 'TRADE';

-- 5. Add index for linking orders/positions to source activity
CREATE INDEX IF NOT EXISTS idx_bot_orders_source ON public.bot_orders(source_activity_id);
CREATE INDEX IF NOT EXISTS idx_bot_positions_source ON public.bot_positions(source_activity_id);