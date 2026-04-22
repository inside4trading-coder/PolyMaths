-- Create table for agent configurations
CREATE TABLE public.agent_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'My Agent',
  model TEXT NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  categories TEXT[] DEFAULT ARRAY['Politics', 'Sports', 'Crypto'],
  risk_tolerance TEXT DEFAULT 'medium',
  analysis_depth TEXT DEFAULT 'balanced',
  auto_analyze BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for agent predictions/analysis history
CREATE TABLE public.agent_predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_config_id UUID REFERENCES public.agent_configs(id) ON DELETE SET NULL,
  market_id TEXT,
  market_question TEXT,
  analysis TEXT NOT NULL,
  prediction TEXT,
  confidence NUMERIC,
  reasoning TEXT,
  recommendation TEXT,
  model_used TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_predictions ENABLE ROW LEVEL SECURITY;

-- Public access policies (single-user app)
CREATE POLICY "Allow all operations on agent_configs"
ON public.agent_configs FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow all operations on agent_predictions"
ON public.agent_predictions FOR ALL
USING (true)
WITH CHECK (true);

-- Index for faster queries
CREATE INDEX idx_agent_predictions_created_at ON public.agent_predictions(created_at DESC);
CREATE INDEX idx_agent_predictions_market_id ON public.agent_predictions(market_id);

-- Trigger for updated_at
CREATE TRIGGER update_agent_configs_updated_at
BEFORE UPDATE ON public.agent_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();