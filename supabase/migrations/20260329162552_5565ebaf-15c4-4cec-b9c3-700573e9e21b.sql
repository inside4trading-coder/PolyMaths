
CREATE INDEX IF NOT EXISTS idx_bot_orders_user_config 
  ON public.bot_orders (user_id, bot_config_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bot_events_user_config_type 
  ON public.bot_events (user_id, bot_config_id, event_type, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_bot_positions_user_config 
  ON public.bot_positions (user_id, bot_config_id, created_at DESC);
