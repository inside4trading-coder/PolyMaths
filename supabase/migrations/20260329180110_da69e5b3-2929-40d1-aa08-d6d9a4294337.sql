CREATE TABLE IF NOT EXISTS public.bot_signals_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_config_id uuid REFERENCES bot_configs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  activity_id text NOT NULL,
  market_id text,
  market_question text,
  wallet_address text,
  outcome text,
  side text CHECK (side IN ('BUY', 'SELL')),
  size numeric,
  usdc_size numeric,
  price numeric,
  score numeric,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'skipped', 'error')),
  processed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(bot_config_id, activity_id)
);

ALTER TABLE public.bot_signals_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own signals queue" ON public.bot_signals_queue FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own signals queue" ON public.bot_signals_queue FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own signals queue" ON public.bot_signals_queue FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own signals queue" ON public.bot_signals_queue FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service can manage all signals queue" ON public.bot_signals_queue FOR ALL USING (true);

CREATE INDEX IF NOT EXISTS idx_signals_queue_pending ON bot_signals_queue(bot_config_id, status, created_at) WHERE status = 'pending';