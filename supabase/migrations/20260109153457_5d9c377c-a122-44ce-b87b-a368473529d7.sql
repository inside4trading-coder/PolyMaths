-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create table for news articles with embeddings
CREATE TABLE public.news_embeddings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  source TEXT NOT NULL,
  url TEXT,
  published_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  embedding vector(768),
  sentiment_score NUMERIC,
  relevance_markets TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for vector similarity search
CREATE INDEX news_embeddings_vector_idx ON public.news_embeddings 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create table for RAG trading signals
CREATE TABLE public.rag_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  market_id TEXT NOT NULL,
  market_question TEXT,
  signal_type TEXT NOT NULL, -- 'BUY_YES', 'BUY_NO', 'HOLD', 'STRONG_BUY_YES', 'STRONG_BUY_NO'
  confidence NUMERIC,
  reasoning TEXT,
  news_sources UUID[],
  current_price NUMERIC,
  suggested_price NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.news_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rag_signals ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "News embeddings are publicly readable" 
ON public.news_embeddings FOR SELECT USING (true);

CREATE POLICY "RAG signals are publicly readable" 
ON public.rag_signals FOR SELECT USING (true);

-- Service can insert
CREATE POLICY "Service can insert news embeddings" 
ON public.news_embeddings FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can insert RAG signals" 
ON public.rag_signals FOR INSERT WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.rag_signals;