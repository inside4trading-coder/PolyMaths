-- Enable RLS on market_sentiment
ALTER TABLE public.market_sentiment ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Market sentiment is publicly readable" 
ON public.market_sentiment 
FOR SELECT 
USING (true);

-- Allow service to insert sentiment data
CREATE POLICY "Service can insert market sentiment" 
ON public.market_sentiment 
FOR INSERT 
WITH CHECK (true);