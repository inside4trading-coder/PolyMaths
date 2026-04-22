-- Create price_history table for local price storage
CREATE TABLE public.price_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_id text NOT NULL,
  price numeric NOT NULL,
  recorded_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create index for fast lookups by token and time
CREATE INDEX idx_price_history_token_time ON public.price_history (token_id, recorded_at DESC);

-- Enable RLS
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Price history is publicly readable"
ON public.price_history FOR SELECT USING (true);

CREATE POLICY "Service can insert price history"
ON public.price_history FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can delete old price history"
ON public.price_history FOR DELETE USING (true);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.price_history;