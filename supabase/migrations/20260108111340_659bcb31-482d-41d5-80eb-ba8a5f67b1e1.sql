-- Drop the existing constraint
ALTER TABLE public.wallet_activity DROP CONSTRAINT wallet_activity_activity_type_check;

-- Add updated constraint with MAKER_REBATE included
ALTER TABLE public.wallet_activity ADD CONSTRAINT wallet_activity_activity_type_check 
CHECK (activity_type = ANY (ARRAY['TRADE'::text, 'SPLIT'::text, 'MERGE'::text, 'REDEEM'::text, 'REWARD'::text, 'CONVERSION'::text, 'YIELD'::text, 'MAKER_REBATE'::text]));