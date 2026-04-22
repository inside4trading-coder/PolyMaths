-- Add profile_image column to wallets table for Polymarket avatar
ALTER TABLE public.wallets ADD COLUMN profile_image text;