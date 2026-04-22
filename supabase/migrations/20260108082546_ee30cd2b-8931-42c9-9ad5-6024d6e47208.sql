-- Enable realtime for wallet_activity table
ALTER TABLE public.wallet_activity REPLICA IDENTITY FULL;

-- Add to realtime publication if not already added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'wallet_activity'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_activity;
  END IF;
END $$;