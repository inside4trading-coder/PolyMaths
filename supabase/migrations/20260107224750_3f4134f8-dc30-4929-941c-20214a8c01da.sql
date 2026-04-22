-- Allow additional Polymarket activity types that appear in /activity
ALTER TABLE public.wallet_activity DROP CONSTRAINT IF EXISTS wallet_activity_activity_type_check;
ALTER TABLE public.wallet_activity
  ADD CONSTRAINT wallet_activity_activity_type_check
  CHECK (activity_type = ANY (ARRAY[
    'TRADE'::text,
    'SPLIT'::text,
    'MERGE'::text,
    'REDEEM'::text,
    'REWARD'::text,
    'CONVERSION'::text,
    'YIELD'::text
  ]));