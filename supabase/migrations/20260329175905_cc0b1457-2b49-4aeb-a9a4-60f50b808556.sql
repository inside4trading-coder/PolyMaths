CREATE INDEX IF NOT EXISTS idx_bot_events_config_type_ts ON bot_events(bot_config_id, event_type, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_bot_orders_config_activity ON bot_orders(bot_config_id, source_activity_id) WHERE source_activity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bot_positions_open ON bot_positions(bot_config_id, outcome, side) WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_activity_wallet_ts ON wallet_activity(wallet_address, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_activity_type_ts ON wallet_activity(activity_type, timestamp DESC);