-- Add cursor tracking columns for incremental full-history sync
ALTER TABLE public.wallets 
  ADD COLUMN IF NOT EXISTS activity_cursor timestamp with time zone,
  ADD COLUMN IF NOT EXISTS activity_loaded_count integer DEFAULT 0;