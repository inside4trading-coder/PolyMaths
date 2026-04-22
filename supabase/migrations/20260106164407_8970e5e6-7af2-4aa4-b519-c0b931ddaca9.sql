-- ============================================
-- POLYMARKET PRO TERMINAL DATABASE SCHEMA
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- MARKETS & TOKENS
-- ============================================

CREATE TABLE public.markets (
  id TEXT PRIMARY KEY,
  condition_id TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  question TEXT NOT NULL,
  description TEXT,
  outcomes TEXT[] NOT NULL DEFAULT '{}',
  volume NUMERIC DEFAULT 0,
  volume_24h NUMERIC DEFAULT 0,
  liquidity NUMERIC DEFAULT 0,
  liquidity_score NUMERIC DEFAULT 0,
  end_date TIMESTAMPTZ,
  closed BOOLEAN DEFAULT FALSE,
  tags TEXT[] DEFAULT '{}',
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.tokens (
  id TEXT PRIMARY KEY,
  market_id TEXT NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL,
  price NUMERIC DEFAULT 0,
  change_1h NUMERIC DEFAULT 0,
  change_24h NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tokens_market_id ON public.tokens(market_id);

-- ============================================
-- WALLETS (User Watchlist)
-- ============================================

CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT UNIQUE NOT NULL,
  proxy_address TEXT,
  label TEXT,
  volume_24h NUMERIC DEFAULT 0,
  volume_7d NUMERIC DEFAULT 0,
  total_volume NUMERIC DEFAULT 0,
  avg_trade_size NUMERIC DEFAULT 0,
  markets_traded INTEGER DEFAULT 0,
  win_rate NUMERIC DEFAULT 0,
  pnl NUMERIC DEFAULT 0,
  unusual_score NUMERIC DEFAULT 0,
  last_active TIMESTAMPTZ,
  is_watched BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallets_address ON public.wallets(address);
CREATE INDEX idx_wallets_watched ON public.wallets(is_watched) WHERE is_watched = TRUE;

-- ============================================
-- TRADES
-- ============================================

CREATE TABLE public.trades (
  id TEXT PRIMARY KEY,
  market_id TEXT NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  token_id TEXT,
  wallet_address TEXT,
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  size NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  outcome TEXT,
  maker TEXT,
  taker TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trades_market ON public.trades(market_id);
CREATE INDEX idx_trades_wallet ON public.trades(wallet_address);
CREATE INDEX idx_trades_timestamp ON public.trades(timestamp DESC);

-- ============================================
-- WALLET ACTIVITY (for unusual detection)
-- ============================================

CREATE TABLE public.wallet_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('TRADE', 'SPLIT', 'MERGE', 'REDEEM', 'REWARD')),
  market_id TEXT REFERENCES public.markets(id) ON DELETE SET NULL,
  market_question TEXT,
  outcome TEXT,
  side TEXT CHECK (side IN ('BUY', 'SELL')),
  size NUMERIC NOT NULL,
  price NUMERIC,
  is_unusual BOOLEAN DEFAULT FALSE,
  unusual_reason TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_activity_wallet ON public.wallet_activity(wallet_address);
CREATE INDEX idx_wallet_activity_unusual ON public.wallet_activity(is_unusual) WHERE is_unusual = TRUE;

-- ============================================
-- NEWS
-- ============================================

CREATE TABLE public.news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  url TEXT UNIQUE,
  summary TEXT,
  sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral')),
  published_at TIMESTAMPTZ NOT NULL,
  related_markets TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_news_published ON public.news(published_at DESC);

-- ============================================
-- BOT CONFIGURATION
-- ============================================

CREATE TABLE public.bot_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Smart Wallet Follower',
  mode TEXT NOT NULL DEFAULT 'paper' CHECK (mode IN ('paper', 'live')),
  status TEXT NOT NULL DEFAULT 'paused' CHECK (status IN ('running', 'paused', 'stopped')),
  wallets TEXT[] DEFAULT '{}',
  categories TEXT[] DEFAULT '{}',
  -- Signal Rules
  signal_min_trade_size NUMERIC DEFAULT 100,
  signal_cluster_trigger BOOLEAN DEFAULT FALSE,
  signal_cluster_min_trades INTEGER DEFAULT 3,
  signal_cluster_window_minutes INTEGER DEFAULT 15,
  signal_min_liquidity_score NUMERIC DEFAULT 50,
  signal_max_spread NUMERIC DEFAULT 0.05,
  -- Execution Rules
  exec_only_limit_orders BOOLEAN DEFAULT TRUE,
  exec_entry_slices INTEGER DEFAULT 2,
  exec_reprice_if_mid_moves NUMERIC DEFAULT 0.02,
  exec_max_slippage NUMERIC DEFAULT 0.03,
  -- Risk Rules
  risk_max_position_per_market NUMERIC DEFAULT 500,
  risk_max_total_exposure NUMERIC DEFAULT 5000,
  risk_daily_loss_limit NUMERIC DEFAULT 250,
  risk_cooldown_minutes INTEGER DEFAULT 30,
  risk_no_trade_near_resolution BOOLEAN DEFAULT TRUE,
  risk_resolution_buffer_hours INTEGER DEFAULT 24,
  risk_blocklist TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- BOT POSITIONS
-- ============================================

CREATE TABLE public.bot_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_config_id UUID REFERENCES public.bot_configs(id) ON DELETE CASCADE,
  market_id TEXT REFERENCES public.markets(id) ON DELETE SET NULL,
  market_question TEXT,
  token_id TEXT,
  outcome TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('LONG', 'SHORT')),
  size NUMERIC NOT NULL,
  entry_price NUMERIC NOT NULL,
  current_price NUMERIC DEFAULT 0,
  pnl NUMERIC DEFAULT 0,
  pnl_percent NUMERIC DEFAULT 0,
  triggered_by TEXT,
  reasons TEXT[] DEFAULT '{}',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bot_positions_config ON public.bot_positions(bot_config_id);
CREATE INDEX idx_bot_positions_open ON public.bot_positions(closed_at) WHERE closed_at IS NULL;

-- ============================================
-- BOT ORDERS
-- ============================================

CREATE TABLE public.bot_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_config_id UUID REFERENCES public.bot_configs(id) ON DELETE CASCADE,
  market_id TEXT REFERENCES public.markets(id) ON DELETE SET NULL,
  token_id TEXT,
  outcome TEXT,
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  size NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filled', 'partial', 'cancelled')),
  filled_size NUMERIC DEFAULT 0,
  filled_price NUMERIC,
  reasons TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bot_orders_config ON public.bot_orders(bot_config_id);
CREATE INDEX idx_bot_orders_status ON public.bot_orders(status);

-- ============================================
-- BOT EVENTS (Journal/Logs)
-- ============================================

CREATE TABLE public.bot_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_config_id UUID REFERENCES public.bot_configs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('signal', 'order', 'fill', 'cancel', 'risk', 'error')),
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  reasons TEXT[] DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bot_events_config ON public.bot_events(bot_config_id);
CREATE INDEX idx_bot_events_timestamp ON public.bot_events(timestamp DESC);
CREATE INDEX idx_bot_events_type ON public.bot_events(event_type);

-- ============================================
-- MARKET METRICS (Time Series)
-- ============================================

CREATE TABLE public.market_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id TEXT NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  price NUMERIC DEFAULT 0,
  volume_1h NUMERIC DEFAULT 0,
  volume_24h NUMERIC DEFAULT 0,
  trades_1h INTEGER DEFAULT 0,
  trades_24h INTEGER DEFAULT 0,
  liquidity_score NUMERIC DEFAULT 0,
  spread NUMERIC DEFAULT 0,
  net_flow_1h NUMERIC DEFAULT 0,
  net_flow_24h NUMERIC DEFAULT 0,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_market_metrics_market ON public.market_metrics(market_id);
CREATE INDEX idx_market_metrics_timestamp ON public.market_metrics(market_id, timestamp DESC);

-- ============================================
-- ALERTS
-- ============================================

CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL CHECK (alert_type IN ('price', 'volume', 'whale', 'unusual', 'news')),
  market_id TEXT REFERENCES public.markets(id) ON DELETE CASCADE,
  wallet_address TEXT,
  condition TEXT,
  threshold NUMERIC,
  triggered BOOLEAN DEFAULT FALSE,
  triggered_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_active ON public.alerts(is_active) WHERE is_active = TRUE;

-- ============================================
-- UPDATE TIMESTAMP TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply triggers
CREATE TRIGGER update_markets_updated_at
  BEFORE UPDATE ON public.markets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tokens_updated_at
  BEFORE UPDATE ON public.tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bot_configs_updated_at
  BEFORE UPDATE ON public.bot_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bot_positions_updated_at
  BEFORE UPDATE ON public.bot_positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bot_orders_updated_at
  BEFORE UPDATE ON public.bot_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- RLS POLICIES (Public read for market data)
-- ============================================

ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- Public read policies for market data (these are public Polymarket data)
CREATE POLICY "Markets are publicly readable" ON public.markets FOR SELECT USING (true);
CREATE POLICY "Tokens are publicly readable" ON public.tokens FOR SELECT USING (true);
CREATE POLICY "Trades are publicly readable" ON public.trades FOR SELECT USING (true);
CREATE POLICY "News are publicly readable" ON public.news FOR SELECT USING (true);
CREATE POLICY "Market metrics are publicly readable" ON public.market_metrics FOR SELECT USING (true);
CREATE POLICY "Wallets are publicly readable" ON public.wallets FOR SELECT USING (true);
CREATE POLICY "Wallet activity is publicly readable" ON public.wallet_activity FOR SELECT USING (true);

-- Service role insert/update for data ingestion (edge functions use service role)
CREATE POLICY "Service can insert markets" ON public.markets FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can update markets" ON public.markets FOR UPDATE USING (true);
CREATE POLICY "Service can insert tokens" ON public.tokens FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can update tokens" ON public.tokens FOR UPDATE USING (true);
CREATE POLICY "Service can insert trades" ON public.trades FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can insert news" ON public.news FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can insert metrics" ON public.market_metrics FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can manage wallets" ON public.wallets FOR ALL USING (true);
CREATE POLICY "Service can manage wallet activity" ON public.wallet_activity FOR ALL USING (true);

-- Bot tables are publicly accessible for single-user V1 (no auth yet)
CREATE POLICY "Bot configs are publicly accessible" ON public.bot_configs FOR ALL USING (true);
CREATE POLICY "Bot positions are publicly accessible" ON public.bot_positions FOR ALL USING (true);
CREATE POLICY "Bot orders are publicly accessible" ON public.bot_orders FOR ALL USING (true);
CREATE POLICY "Bot events are publicly accessible" ON public.bot_events FOR ALL USING (true);
CREATE POLICY "Alerts are publicly accessible" ON public.alerts FOR ALL USING (true);

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_activity;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;