CREATE INDEX IF NOT EXISTS idx_price_history_recorded_at ON public.price_history (recorded_at);
CREATE INDEX IF NOT EXISTS idx_wallet_activity_timestamp ON public.wallet_activity (timestamp);