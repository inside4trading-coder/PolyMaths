-- Create table for sentiment data
CREATE TABLE public.market_sentiment (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  market_id TEXT NOT NULL,
  market_question TEXT,
  sentiment_score NUMERIC CHECK (sentiment_score >= -1 AND sentiment_score <= 1),
  sentiment_label TEXT CHECK (sentiment_label IN ('bullish', 'bearish', 'neutral')),
  news_summary TEXT,
  sources TEXT[],
  price_at_analysis NUMERIC,
  price_change_after NUMERIC,
  correlation_score NUMERIC,
  analyzed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_market_sentiment_market_id ON public.market_sentiment(market_id);
CREATE INDEX idx_market_sentiment_analyzed_at ON public.market_sentiment(analyzed_at DESC);

-- Enable realtime for sentiment updates
ALTER TABLE public.market_sentiment REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.market_sentiment;