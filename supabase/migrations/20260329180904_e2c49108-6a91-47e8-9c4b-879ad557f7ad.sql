-- Ensure pgvector extension exists
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop existing embedding column and recreate with proper vector type
ALTER TABLE news_embeddings DROP COLUMN IF EXISTS embedding;
ALTER TABLE news_embeddings ADD COLUMN embedding vector(1536);

-- Create similarity search RPC
CREATE OR REPLACE FUNCTION match_news_embeddings(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE(id uuid, title text, content text, source text, similarity float)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT ne.id, ne.title, ne.content, ne.source,
    (1 - (ne.embedding <=> query_embedding))::float as similarity
  FROM news_embeddings ne
  WHERE ne.embedding IS NOT NULL
    AND 1 - (ne.embedding <=> query_embedding) > match_threshold
  ORDER BY ne.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create index for fast vector similarity search
CREATE INDEX IF NOT EXISTS idx_news_embeddings_vector ON news_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);