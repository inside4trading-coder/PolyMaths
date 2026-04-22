-- Add columns to track P/L sync progress for high-volume wallets
ALTER TABLE public.wallets
ADD COLUMN IF NOT EXISTS pnl_sync_offset integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS pnl_sync_status text DEFAULT 'idle',
ADD COLUMN IF NOT EXISTS pnl_sync_started_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS pnl_sync_completed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS closed_positions_count integer DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN public.wallets.pnl_sync_offset IS 'Current offset in closed-positions API pagination for incremental sync';
COMMENT ON COLUMN public.wallets.pnl_sync_status IS 'Status: idle, syncing, completed, error';