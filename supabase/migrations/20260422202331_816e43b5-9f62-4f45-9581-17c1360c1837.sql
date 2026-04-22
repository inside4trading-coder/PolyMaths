
-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- ============================================================
-- HELPERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by owner"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- USER ROLES
-- ============================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- AUTO-CREATE PROFILE + DEFAULT ROLE ON SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- MARKETS
-- ============================================================
CREATE TABLE public.markets (
  id TEXT PRIMARY KEY,
  condition_id TEXT,
  slug TEXT,
  question TEXT NOT NULL,
  description TEXT,
  outcomes JSONB DEFAULT '["Yes","No"]'::jsonb,
  category TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  end_date TIMESTAMPTZ,
  volume NUMERIC DEFAULT 0,
  volume_24h NUMERIC DEFAULT 0,
  liquidity NUMERIC DEFAULT 0,
  liquidity_score NUMERIC DEFAULT 0,
  closed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Markets are publicly readable" ON public.markets FOR SELECT USING (true);
CREATE INDEX idx_markets_closed_volume ON public.markets (closed, volume_24h DESC);
CREATE INDEX idx_markets_category ON public.markets (category);
CREATE INDEX idx_markets_condition_id ON public.markets (condition_id);
CREATE INDEX idx_markets_slug ON public.markets (slug);
CREATE TRIGGER trg_markets_updated_at BEFORE UPDATE ON public.markets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- TOKENS
-- ============================================================
CREATE TABLE public.tokens (
  id TEXT PRIMARY KEY,
  market_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  price NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tokens are publicly readable" ON public.tokens FOR SELECT USING (true);
CREATE INDEX idx_tokens_market_id ON public.tokens (market_id);
CREATE TRIGGER trg_tokens_updated_at BEFORE UPDATE ON public.tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- PRICE HISTORY
-- ============================================================
CREATE TABLE public.price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id TEXT NOT NULL,
  market_id TEXT,
  price NUMERIC NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Price history publicly readable" ON public.price_history FOR SELECT USING (true);
CREATE INDEX idx_price_history_token_recorded ON public.price_history (token_id, recorded_at DESC);

-- ============================================================
-- TRADES
-- ============================================================
CREATE TABLE public.trades (
  id TEXT PRIMARY KEY,
  market_id TEXT,
  token_id TEXT,
  side TEXT,
  price NUMERIC,
  size NUMERIC,
  outcome TEXT,
  maker TEXT,
  taker TEXT,
  wallet_address TEXT,
  timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Trades publicly readable" ON public.trades FOR SELECT USING (true);
CREATE INDEX idx_trades_market_id ON public.trades (market_id);
CREATE INDEX idx_trades_wallet ON public.trades (wallet_address);
CREATE INDEX idx_trades_timestamp ON public.trades (timestamp DESC);

-- ============================================================
-- WALLETS (per-user, sync state lives here too)
-- ============================================================
CREATE TABLE public.wallets (
  address TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT,
  is_watched BOOLEAN DEFAULT false,
  total_volume NUMERIC DEFAULT 0,
  volume_24h NUMERIC DEFAULT 0,
  volume_7d NUMERIC DEFAULT 0,
  avg_trade_size NUMERIC DEFAULT 0,
  markets_traded INTEGER DEFAULT 0,
  pnl NUMERIC DEFAULT 0,
  total_pnl NUMERIC DEFAULT 0,
  realized_pnl NUMERIC DEFAULT 0,
  unrealized_pnl NUMERIC DEFAULT 0,
  win_rate NUMERIC DEFAULT 0,
  biggest_win NUMERIC DEFAULT 0,
  closed_positions_count INTEGER DEFAULT 0,
  total_buys_usd NUMERIC DEFAULT 0,
  pnl_sync_status TEXT DEFAULT 'idle',
  pnl_sync_offset INTEGER DEFAULT 0,
  pnl_sync_started_at TIMESTAMPTZ,
  pnl_sync_completed_at TIMESTAMPTZ,
  activity_cursor TIMESTAMPTZ,
  activity_loaded_count INTEGER DEFAULT 0,
  splits_count INTEGER DEFAULT 0,
  merges_count INTEGER DEFAULT 0,
  total_fees_paid NUMERIC DEFAULT 0,
  maker_ratio NUMERIC DEFAULT 0,
  liquidity_provided NUMERIC DEFAULT 0,
  onchain_verified BOOLEAN DEFAULT false,
  onchain_synced_at TIMESTAMPTZ,
  last_active TIMESTAMPTZ,
  profile_image TEXT,
  last_signal_scan_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (address, user_id)
);
-- Also allow service-role rows without user_id (discovery): partial unique on address when user_id is null
CREATE UNIQUE INDEX idx_wallets_address_global ON public.wallets (address) WHERE user_id IS NULL;
CREATE INDEX idx_wallets_user_id ON public.wallets (user_id);
CREATE INDEX idx_wallets_is_watched ON public.wallets (is_watched) WHERE is_watched = true;

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own wallets and global"
  ON public.wallets FOR SELECT
  USING (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY "Users can insert own wallets"
  ON public.wallets FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own wallets"
  ON public.wallets FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own wallets"
  ON public.wallets FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_wallets_updated_at BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- WALLET POSITIONS
-- ============================================================
CREATE TABLE public.wallet_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  condition_id TEXT NOT NULL,
  asset_id TEXT,
  slug TEXT,
  title TEXT,
  outcome TEXT,
  outcome_index INTEGER,
  size NUMERIC DEFAULT 0,
  avg_price NUMERIC,
  cur_price NUMERIC,
  initial_value NUMERIC,
  current_value NUMERIC,
  cash_pnl NUMERIC DEFAULT 0,
  percent_pnl NUMERIC DEFAULT 0,
  realized_pnl NUMERIC DEFAULT 0,
  total_bought NUMERIC DEFAULT 0,
  redeemable BOOLEAN DEFAULT false,
  mergeable BOOLEAN DEFAULT false,
  end_date TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wallet_address, condition_id, outcome)
);
ALTER TABLE public.wallet_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Wallet positions publicly readable" ON public.wallet_positions FOR SELECT USING (true);
CREATE INDEX idx_wallet_positions_wallet ON public.wallet_positions (wallet_address);
CREATE INDEX idx_wallet_positions_synced_at ON public.wallet_positions (synced_at DESC);

-- ============================================================
-- WALLET ACTIVITY
-- ============================================================
CREATE TABLE public.wallet_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature TEXT UNIQUE,
  wallet_address TEXT NOT NULL,
  activity_type TEXT NOT NULL DEFAULT 'TRADE',
  market_id TEXT,
  condition_id TEXT,
  market_question TEXT,
  outcome TEXT,
  side TEXT,
  size NUMERIC DEFAULT 0,
  usdc_size NUMERIC,
  price NUMERIC,
  is_unusual BOOLEAN DEFAULT false,
  unusual_reason TEXT,
  asset_id TEXT,
  transaction_hash TEXT,
  source TEXT DEFAULT 'api',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wallet_address, market_id, timestamp, size, side)
);
ALTER TABLE public.wallet_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Wallet activity publicly readable" ON public.wallet_activity FOR SELECT USING (true);
CREATE INDEX idx_wa_wallet_ts ON public.wallet_activity (wallet_address, timestamp DESC);
CREATE INDEX idx_wa_market_id ON public.wallet_activity (market_id);
CREATE INDEX idx_wa_timestamp ON public.wallet_activity (timestamp DESC);
CREATE INDEX idx_wa_is_unusual ON public.wallet_activity (is_unusual) WHERE is_unusual = true;
CREATE INDEX idx_wa_source ON public.wallet_activity (source);

-- ============================================================
-- MARKET METRICS
-- ============================================================
CREATE TABLE public.market_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id TEXT NOT NULL,
  price NUMERIC,
  volume_1h NUMERIC,
  volume_24h NUMERIC,
  trades_1h INTEGER,
  trades_24h INTEGER,
  liquidity_score NUMERIC,
  spread NUMERIC,
  net_flow_1h NUMERIC,
  net_flow_24h NUMERIC,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.market_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Market metrics publicly readable" ON public.market_metrics FOR SELECT USING (true);
CREATE INDEX idx_market_metrics_mid_ts ON public.market_metrics (market_id, timestamp DESC);

-- ============================================================
-- NEWS
-- ============================================================
CREATE TABLE public.news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  source TEXT,
  url TEXT,
  summary TEXT,
  sentiment TEXT,
  related_markets JSONB DEFAULT '[]'::jsonb,
  published_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
CREATE POLICY "News publicly readable" ON public.news FOR SELECT USING (true);
CREATE INDEX idx_news_published_at ON public.news (published_at DESC);

-- ============================================================
-- AGENT CONFIGS (per user)
-- ============================================================
CREATE TABLE public.agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Agent',
  model TEXT NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  categories JSONB DEFAULT '["Politics","Sports","Crypto"]'::jsonb,
  risk_tolerance TEXT DEFAULT 'medium',
  analysis_depth TEXT DEFAULT 'balanced',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own agent configs" ON public.agent_configs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own agent configs" ON public.agent_configs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own agent configs" ON public.agent_configs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own agent configs" ON public.agent_configs FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER trg_agent_configs_updated_at BEFORE UPDATE ON public.agent_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- AGENT PREDICTIONS (publicly readable, write via service role/owner)
-- ============================================================
CREATE TABLE public.agent_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_config_id UUID REFERENCES public.agent_configs(id) ON DELETE SET NULL,
  market_id TEXT,
  market_question TEXT,
  analysis TEXT,
  prediction TEXT,
  recommendation TEXT,
  confidence NUMERIC,
  reasoning TEXT,
  model_used TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Predictions publicly readable" ON public.agent_predictions FOR SELECT USING (true);
CREATE POLICY "Users insert own predictions" ON public.agent_predictions FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE INDEX idx_ap_created_at ON public.agent_predictions (created_at DESC);
CREATE INDEX idx_ap_user_id ON public.agent_predictions (user_id);

-- ============================================================
-- MARKET SENTIMENT
-- ============================================================
CREATE TABLE public.market_sentiment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id TEXT,
  market_question TEXT,
  sentiment_score NUMERIC,
  sentiment_label TEXT,
  news_summary TEXT,
  sources JSONB DEFAULT '[]'::jsonb,
  price_at_analysis NUMERIC,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.market_sentiment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Market sentiment publicly readable" ON public.market_sentiment FOR SELECT USING (true);
CREATE INDEX idx_ms_market_id ON public.market_sentiment (market_id, created_at DESC);

-- ============================================================
-- RAG SIGNALS
-- ============================================================
CREATE TABLE public.rag_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id TEXT,
  market_question TEXT,
  signal_type TEXT,
  confidence NUMERIC,
  reasoning TEXT,
  news_sources JSONB DEFAULT '[]'::jsonb,
  current_price NUMERIC,
  suggested_price NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rag_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Rag signals publicly readable" ON public.rag_signals FOR SELECT USING (true);
CREATE INDEX idx_rs_created_at ON public.rag_signals (created_at DESC);
CREATE INDEX idx_rs_market_id ON public.rag_signals (market_id);

-- ============================================================
-- NEWS EMBEDDINGS
-- ============================================================
CREATE TABLE public.news_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  content TEXT,
  source TEXT,
  url TEXT,
  embedding JSONB,
  sentiment_score NUMERIC,
  relevance_markets JSONB DEFAULT '[]'::jsonb,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.news_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "News embeddings publicly readable" ON public.news_embeddings FOR SELECT USING (true);

-- ============================================================
-- SIGNAL OUTCOMES
-- ============================================================
CREATE TABLE public.signal_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID,
  market_id TEXT,
  was_correct BOOLEAN,
  pnl_if_traded NUMERIC,
  evaluated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.signal_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signal outcomes publicly readable" ON public.signal_outcomes FOR SELECT USING (true);

-- ============================================================
-- BOT CONFIGS
-- ============================================================
CREATE TABLE public.bot_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Smart Wallet Follower',
  mode TEXT NOT NULL DEFAULT 'paper',
  status TEXT NOT NULL DEFAULT 'paused',
  wallets JSONB DEFAULT '[]'::jsonb,
  categories JSONB DEFAULT '[]'::jsonb,
  signal_min_trade_size NUMERIC DEFAULT 100,
  signal_cluster_trigger BOOLEAN DEFAULT false,
  signal_cluster_min_trades INTEGER DEFAULT 3,
  signal_cluster_window_minutes INTEGER DEFAULT 15,
  signal_min_liquidity_score NUMERIC DEFAULT 50,
  signal_max_spread NUMERIC DEFAULT 0.05,
  exec_only_limit_orders BOOLEAN DEFAULT true,
  exec_entry_slices INTEGER DEFAULT 2,
  exec_reprice_if_mid_moves NUMERIC DEFAULT 0.02,
  exec_max_slippage NUMERIC DEFAULT 0.03,
  risk_max_position_per_market NUMERIC DEFAULT 500,
  risk_max_total_exposure NUMERIC DEFAULT 5000,
  risk_daily_loss_limit NUMERIC DEFAULT 250,
  risk_cooldown_minutes INTEGER DEFAULT 30,
  risk_no_trade_near_resolution BOOLEAN DEFAULT true,
  risk_resolution_buffer_hours INTEGER DEFAULT 24,
  last_signal_scan_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bot_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own bot configs" ON public.bot_configs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own bot configs" ON public.bot_configs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own bot configs" ON public.bot_configs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own bot configs" ON public.bot_configs FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER trg_bot_configs_updated_at BEFORE UPDATE ON public.bot_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- BOT SIGNALS QUEUE
-- ============================================================
CREATE TABLE public.bot_signals_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_config_id UUID NOT NULL REFERENCES public.bot_configs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id UUID,
  market_id TEXT,
  market_question TEXT,
  wallet_address TEXT,
  outcome TEXT,
  side TEXT,
  size NUMERIC,
  usdc_size NUMERIC,
  price NUMERIC,
  score NUMERIC,
  status TEXT DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bot_config_id, activity_id)
);
ALTER TABLE public.bot_signals_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own queue" ON public.bot_signals_queue FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_bsq_config_status ON public.bot_signals_queue (bot_config_id, status, created_at);

-- ============================================================
-- BOT ORDERS
-- ============================================================
CREATE TABLE public.bot_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_config_id UUID NOT NULL REFERENCES public.bot_configs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market_id TEXT,
  token_id TEXT,
  outcome TEXT,
  side TEXT,
  size NUMERIC,
  price NUMERIC,
  status TEXT DEFAULT 'pending',
  filled_size NUMERIC DEFAULT 0,
  filled_price NUMERIC,
  simulated_slippage NUMERIC,
  source_activity_id UUID,
  reasons JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bot_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own bot orders" ON public.bot_orders FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_bo_config ON public.bot_orders (bot_config_id, created_at DESC);
CREATE INDEX idx_bo_user ON public.bot_orders (user_id);
CREATE TRIGGER trg_bot_orders_updated_at BEFORE UPDATE ON public.bot_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- BOT POSITIONS
-- ============================================================
CREATE TABLE public.bot_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_config_id UUID NOT NULL REFERENCES public.bot_configs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market_id TEXT,
  market_question TEXT,
  token_id TEXT,
  outcome TEXT,
  side TEXT,
  size NUMERIC DEFAULT 0,
  entry_price NUMERIC,
  current_price NUMERIC,
  pnl NUMERIC DEFAULT 0,
  pnl_percent NUMERIC DEFAULT 0,
  triggered_by TEXT,
  source_activity_id UUID,
  reasons JSONB DEFAULT '[]'::jsonb,
  closed_at TIMESTAMPTZ,
  close_reason TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bot_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own bot positions" ON public.bot_positions FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_bp_config ON public.bot_positions (bot_config_id, opened_at DESC);
CREATE INDEX idx_bp_user ON public.bot_positions (user_id);
CREATE INDEX idx_bp_open ON public.bot_positions (bot_config_id) WHERE closed_at IS NULL;
CREATE TRIGGER trg_bot_positions_updated_at BEFORE UPDATE ON public.bot_positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- BOT EVENTS
-- ============================================================
CREATE TABLE public.bot_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_config_id UUID REFERENCES public.bot_configs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  message TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  reasons JSONB DEFAULT '[]'::jsonb,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bot_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own bot events" ON public.bot_events FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
CREATE INDEX idx_be_config_ts ON public.bot_events (bot_config_id, timestamp DESC);
CREATE INDEX idx_be_user ON public.bot_events (user_id);
CREATE INDEX idx_be_event_type ON public.bot_events (event_type);
