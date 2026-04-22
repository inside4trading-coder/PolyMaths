-- Add biggest_win column to wallets table
ALTER TABLE public.wallets 
ADD COLUMN IF NOT EXISTS biggest_win numeric DEFAULT 0;